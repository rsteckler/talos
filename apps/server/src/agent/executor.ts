import { streamText, generateText, generateObject, stepCountIs } from "ai";
import type { ModelMessage, LanguageModel } from "ai";
import { z } from "zod";
import { getProviderForRole } from "../providers/llm.js";
import { buildModulePluginToolSet, getModulePrompt } from "../plugins/runner.js";
import { createLogger } from "../logger/index.js";
import { loadPrompt } from "../prompts/index.js";
import { formatToolSpecs } from "../plugins/registry.js";
import { replanRemainingSteps, validatePlan } from "./planner.js";
import type { StepOutcome } from "./planner.js";
import type { PlanStep, PlanResult } from "@talos/shared/types";
import type { ToolSearchResult } from "../plugins/tool-registry.js";
import { parseToolRef } from "@talos/shared";
import type { ApprovalGate } from "../plugins/runner.js";

interface ToolCallRecord {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

interface AttemptRecord {
  attemptNumber: number;
  toolArgs: Record<string, unknown>;
  resultSummary: string;
  criteriaFeedback?: string;
}

export interface ReplanContext {
  discoveredTools: Map<string, ToolSearchResult>;
  pluginPrompts?: string[];
  onPlanRevised?: (removedStepIds: string[], addedSteps: Array<{ id: string; description: string }>) => void;
}

const MAX_REPLANS = 3;
const MAX_EXECUTOR_ROUNDS = 3;

const log = createLogger("executor");

const SUMMARY_PROMPT = loadPrompt("summary-generator.md");

/** Check if a tool result is an error object ({ error: string }). Returns the error message or null. */
function isErrorResult(result: unknown): string | null {
  if (result != null && typeof result === "object" && "error" in result) {
    const err = (result as Record<string, unknown>)["error"];
    if (typeof err === "string") return err;
  }
  return null;
}

/** Check if a tool result is an empty result set (e.g. { results: [], total: 0 }). */
function isEmptyResult(result: unknown): boolean {
  if (Array.isArray(result) && result.length === 0) return true;
  if (result != null && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    for (const key of ["results", "items", "data", "matches"]) {
      if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length === 0) return true;
    }
  }
  return false;
}

/** Evaluate whether a step's result meets its success criteria. */
async function evaluateSuccessCriteria(
  result: unknown,
  criteria: string,
  stepDescription: string,
  model: LanguageModel,
): Promise<{ passed: boolean; feedback: string }> {
  const resultStr = JSON.stringify(result).slice(0, 4000);

  const evaluation = await generateObject({
    model,
    schema: z.object({
      passed: z.boolean().describe("Whether the result meets the success criteria"),
      feedback: z.string().describe("Brief explanation of why criteria passed or failed, and what to try differently if failed"),
    }),
    prompt: `Evaluate whether this step result meets the success criteria.

Step: ${stepDescription}
Success criteria: ${criteria}

Result:
${resultStr}

Does the result satisfy the criteria? If not, explain what's wrong and suggest a different approach.`,
  });

  return evaluation.object;
}

/** Generate a concise summary of a step result. */
async function generateStepSummary(
  result: unknown,
  stepDescription: string,
  model: LanguageModel,
): Promise<string> {
  try {
    const resultStr = JSON.stringify(result).slice(0, 4000);
    const { text } = await generateText({
      model,
      system: SUMMARY_PROMPT,
      prompt: `Step: ${stepDescription}\n\nResult:\n${resultStr}`,
    });
    return text.trim() || `Completed: ${stepDescription}`;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("Step summary generation failed, using fallback", { error: message });
    return `Completed: ${stepDescription}`;
  }
}

/** Get the appropriate model for a plan step, respecting requires_smart_model. */
function getModelForStep(step: PlanStep) {
  if (step.requires_smart_model) {
    const smart = getProviderForRole("smart");
    if (smart) return smart;
    // Fallback to executor if no smart model configured
  }
  return getProviderForRole("executor");
}

/**
 * Validate replanned steps using pass-2 validation.
 * Returns the validated steps, or the original steps if validation fails.
 */
async function validateReplannedSteps(
  steps: PlanStep[],
  request: string,
  discoveredTools: Map<string, ToolSearchResult>,
): Promise<PlanStep[]> {
  try {
    return await validatePlan(steps, request, discoveredTools);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("Replanned step validation failed, using unvalidated steps", { error: message });
    return steps;
  }
}

/**
 * Execute a plan by running each step in dependency order.
 * Tool steps get a focused LLM call with only that module's tools.
 * Think steps get a tool-less LLM call for pure computation.
 */
export async function executePlan(
  plan: PlanStep[],
  request: string,
  approvalGate?: ApprovalGate,
  onProgress?: (stepId: string, description: string, status: "running" | "complete" | "skipped" | "error") => void,
  onToolCall?: (toolCallId: string, toolName: string, args: Record<string, unknown>, stepId?: string) => void,
  onToolResult?: (toolCallId: string, toolName: string, result: unknown, stepId?: string) => void,
  signal?: AbortSignal,
  replanContext?: ReplanContext,
): Promise<PlanResult> {
  const results = new Map<string, unknown>();
  const stepResults: PlanResult["steps"] = [];
  const usedPluginPrompts = new Map<string, string>();

  // Mutable plan state — may be modified by re-planning
  let currentPlan = [...plan];

  // Map step IDs to 1-based position for readable log messages
  let planStepNum = new Map(currentPlan.map((s, i) => [s.id, i + 1]));

  // Build execution order respecting dependencies
  const executed = new Set<string>();
  let remaining = new Set(currentPlan.map((s) => s.id));
  let replanCount = 0;

  // Track which step IDs came from re-planning (to prevent cascade)
  const replanStepIds = new Set<string>();

  /** Attempt to re-plan remaining steps after an error. */
  const tryReplan = async (triggerStep: PlanStep, triggerError: string) => {
    if (!replanContext || remaining.size === 0 || replanCount >= MAX_REPLANS) return;

    // Don't let errors from re-planned steps trigger another re-plan (prevents cascade)
    if (replanStepIds.has(triggerStep.id)) {
      log.warn("Skipping re-plan: trigger step was itself from a prior re-plan", { stepId: triggerStep.id });
      return;
    }

    const triggerOutcome: StepOutcome = {
      id: triggerStep.id,
      description: triggerStep.description,
      status: "error",
      error: triggerError,
    };

    const completedOutcomes: StepOutcome[] = stepResults.map((sr) => ({
      id: sr.id,
      description: currentPlan.find((s) => s.id === sr.id)?.description ?? sr.id,
      status: sr.error ? "error" : "complete",
      result: sr.result,
      error: sr.error,
    }));

    const remainingSteps = currentPlan.filter((s) => remaining.has(s.id));

    try {
      replanCount++;
      const revisedSteps = await replanRemainingSteps(
        request,
        replanContext.discoveredTools,
        completedOutcomes,
        remainingSteps,
        triggerOutcome,
        replanContext.pluginPrompts,
      );

      // Validate: every tool step must have a valid tool reference from discoveredTools
      const invalid = revisedSteps.filter((s) => {
        if (s.type !== "tool") return false;
        if (!s.tool) return true;
        return !replanContext.discoveredTools.has(s.tool);
      });
      if (invalid.length > 0) {
        log.warn("Re-plan generated tool steps with missing or unknown tool references, discarding re-plan", {
          invalidSteps: invalid.map((s) => `${s.id}: ${s.tool ?? "(missing)"}`),
        });
        return;
      }

      // Run pass-2 validation on replanned steps
      const validated = await validateReplannedSteps(revisedSteps, request, replanContext.discoveredTools);

      // Compute diff for notification
      const removedStepIds = remainingSteps.map((s) => s.id);
      const addedSteps = validated.map((s) => ({ id: s.id, description: s.description }));

      // Track new step IDs as re-plan-originated
      for (const s of validated) {
        replanStepIds.add(s.id);
      }

      // Replace remaining plan steps
      currentPlan = [
        ...currentPlan.filter((s) => !remaining.has(s.id)),
        ...validated,
      ];

      // Update tracking state
      remaining = new Set(validated.map((s) => s.id));
      planStepNum = new Map(currentPlan.map((s, i) => [s.id, i + 1]));

      log.info(`Plan revised: removed ${removedStepIds.length} step(s), added ${validated.length} step(s)`, {
        removed: removedStepIds,
        added: addedSteps.map((s) => s.id),
      });

      replanContext.onPlanRevised?.(removedStepIds, addedSteps);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("Re-planning failed, continuing with original plan", { error: message });
    }
  };

  while (remaining.size > 0) {
    // Check for cancellation before starting next batch of steps
    if (signal?.aborted) {
      log.info("Plan cancelled by user");
      for (const id of remaining) {
        stepResults.push({ id, status: "error", error: "Cancelled" });
      }
      break;
    }

    // Find steps whose dependencies are all satisfied
    const ready = currentPlan.filter((step) => {
      if (!remaining.has(step.id)) return false;
      const deps = step.depends_on ?? [];
      return deps.every((d) => executed.has(d));
    });

    if (ready.length === 0) {
      // Circular dependency or missing dep — fail remaining steps
      for (const id of remaining) {
        stepResults.push({ id, status: "error", error: "Unresolvable dependency" });
      }
      break;
    }

    // Execute ready steps sequentially (could be parallelized for independent steps later)
    for (const step of ready) {
      // Check for cancellation before each step
      if (signal?.aborted) {
        log.info("Plan cancelled by user");
        for (const id of remaining) {
          stepResults.push({ id, status: "error", error: "Cancelled" });
        }
        remaining.clear();
        break;
      }

      onProgress?.(step.id, step.description, "running");
      log.user.high(`Executing step ${planStepNum.get(step.id)}: ${step.description}`);
      log.info(`Executing plan step ${planStepNum.get(step.id)}: ${step.description}`);

      // Get appropriate model for this step
      const active = getModelForStep(step);
      if (!active) {
        const error = "No active model configured";
        stepResults.push({ id: step.id, status: "error", error });
        onProgress?.(step.id, step.description, "error");
        executed.add(step.id);
        remaining.delete(step.id);
        continue;
      }

      let stepError: string | undefined;
      let stepResult: unknown;

      try {
        stepResult = await executeStep(step, request, results, currentPlan, active, planStepNum.get(step.id) ?? 0, approvalGate, onToolCall, onToolResult);
        results.set(step.id, stepResult);

        // Check for cancellation after step completes — mark complete but stop remaining
        if (signal?.aborted) {
          stepResults.push({ id: step.id, status: "complete", result: stepResult });
          onProgress?.(step.id, step.description, "complete");
          log.info("Plan cancelled after step completed", { stepId: step.id });
          executed.add(step.id);
          remaining.delete(step.id);
          // Cancel remaining steps
          for (const id of remaining) {
            stepResults.push({ id, status: "error", error: "Cancelled" });
          }
          remaining.clear();
          break;
        }

        // Check if the tool returned an error result ({ error: string })
        const errorMsg = isErrorResult(stepResult);
        if (errorMsg) {
          stepError = errorMsg;
          stepResults.push({ id: step.id, status: "error", error: errorMsg, result: stepResult });
          onProgress?.(step.id, step.description, "error");
          log.warn(`Plan step ${planStepNum.get(step.id)} returned error result: ${errorMsg}`);
        } else {
          const wasSkipped = stepResult != null && typeof stepResult === "object" && (stepResult as Record<string, unknown>)["skipped"] === true;

          // Generate summary for successful steps
          let summary: string | undefined;
          if (!wasSkipped) {
            summary = await generateStepSummary(stepResult, step.description, active.model);
          }

          stepResults.push({ id: step.id, status: "complete", result: stepResult, summary });
          onProgress?.(step.id, step.description, wasSkipped ? "skipped" : "complete");
          if (wasSkipped) {
            log.info(`Plan step ${planStepNum.get(step.id)} skipped: ${step.description}`);
          } else {
            log.info(`Completed plan step ${planStepNum.get(step.id)}: ${step.description}`, { resultPreview: JSON.stringify(stepResult).slice(0, 200), summary });
          }
        }

        // Collect prompt.md from the plugin used in this step
        if (step.type === "tool" && step.tool) {
          const { pluginId, module } = parseToolRef(step.tool);
          if (!usedPluginPrompts.has(pluginId)) {
            const prompt = getModulePrompt(module);
            if (prompt) usedPluginPrompts.set(pluginId, prompt);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        stepError = message;
        stepResults.push({ id: step.id, status: "error", error: message });
        onProgress?.(step.id, step.description, "error");
        log.error(`Plan step ${planStepNum.get(step.id)} failed: ${step.description}`, { error: message });
      }

      executed.add(step.id);
      remaining.delete(step.id);

      // Log plan evaluation decision between steps
      if (remaining.size > 0) {
        const nextSteps = currentPlan.filter((s) => remaining.has(s.id));
        const nextDescriptions = nextSteps.map((s) => `${s.id}: ${s.description}`);

        if (stepError) {
          log.info(`Plan evaluation: step ${step.id} errored — attempting re-plan`, {
            error: stepError,
            remainingSteps: nextDescriptions,
          });
          await tryReplan(step, stepError);
          // After replan, break out of the inner for-loop so the while loop
          // re-evaluates which steps are ready from the potentially revised plan
          break;
        }

        const wasSkipped = stepResult != null && typeof stepResult === "object" && (stepResult as Record<string, unknown>)["skipped"] === true;
        if (wasSkipped) {
          log.info(`Plan evaluation: step ${step.id} skipped — remaining plan still valid, continuing`, {
            remainingSteps: nextDescriptions,
          });
        } else {
          log.info(`Plan evaluation: step ${step.id} complete — continuing with plan`, {
            remainingSteps: nextDescriptions,
          });
        }
      }
    }
  }

  // Log plan completion
  const completedCount = stepResults.filter((s) => s.status === "complete").length;
  log.info(`Plan complete: ${completedCount}/${stepResults.length} step(s) completed`);

  const summary = completedCount === stepResults.length
    ? `All ${completedCount} step(s) completed successfully.`
    : `${completedCount}/${stepResults.length} step(s) completed.`;

  return {
    steps: stepResults,
    summary,
    pluginPrompts: usedPluginPrompts.size > 0 ? [...usedPluginPrompts.values()] : undefined,
  };
}

/** Build context string from dependency results, including what each prior step accomplished. */
function buildDependencyContext(step: PlanStep, results: Map<string, unknown>, plan: PlanStep[]): string {
  const deps = step.depends_on ?? [];
  if (deps.length === 0) return "";

  const stepMap = new Map(plan.map((s) => [s.id, s]));
  const parts: string[] = [];
  for (const depId of deps) {
    const depStep = stepMap.get(depId);
    const depResult = results.get(depId);
    const label = depStep
      ? `[${depId} — already completed: "${depStep.description}"]`
      : `[${depId} — already completed]`;

    if (depResult !== undefined) {
      const json = JSON.stringify(depResult, null, 2);
      const truncated = json.length > 4000 ? json.slice(0, 4000) + "\n...(truncated)" : json;
      parts.push(`${label}:\n${truncated}`);
    } else {
      parts.push(`${label}: (no output)`);
    }
  }

  return parts.length > 0
    ? "\n\nThe following steps have ALREADY been completed. Do NOT repeat their actions:\n" + parts.join("\n\n")
    : "";
}

/** Execute a single plan step. */
async function executeStep(
  step: PlanStep,
  originalRequest: string,
  results: Map<string, unknown>,
  plan: PlanStep[],
  active: NonNullable<ReturnType<typeof getProviderForRole>>,
  stepNumber: number,
  approvalGate?: ApprovalGate,
  onToolCall?: (toolCallId: string, toolName: string, args: Record<string, unknown>, stepId?: string) => void,
  onToolResult?: (toolCallId: string, toolName: string, result: unknown, stepId?: string) => void,
): Promise<unknown> {
  const depContext = buildDependencyContext(step, results, plan);

  if (step.type === "think") {
    return executeThinkStep(step, originalRequest, depContext, active);
  }

  return executeToolStep(step, originalRequest, depContext, active, stepNumber, approvalGate, onToolCall, onToolResult);
}

/** Execute a think step — LLM call with __error__ tool so it can signal failure. */
async function executeThinkStep(
  step: PlanStep,
  originalRequest: string,
  depContext: string,
  active: NonNullable<ReturnType<typeof getProviderForRole>>,
): Promise<unknown> {
  const tools = {
    __error__: {
      description: "Call this when you cannot accomplish the task — e.g. the required data is missing from prior step results. Signals a fatal error to the planner so it can re-plan.",
      inputSchema: z.object({
        reason: z.string().describe("What went wrong and why you cannot complete this step"),
      }),
      execute: async (args: { reason: string }) => ({ error: args.reason }),
    },
  };

  const result = await generateText({
    model: active.model,
    system: loadPrompt("executor-think-system.md"),
    tools,
    prompt: `You are executing one step of a larger plan.\n\nYour task: ${step.description}\n\nLarger plan context: ${originalRequest}\nUse this context to choose better parameters for your tool call.${depContext}`,
  });

  // Check if the LLM called __error__
  for (const s of result.steps) {
    for (const tc of s.toolCalls) {
      if (tc.toolName === "__error__") {
        const reason = (tc.input as Record<string, unknown>)["reason"] ?? "unknown error";
        log.error(`Think step raised error: ${String(reason)}`);
        return { error: String(reason) };
      }
    }
  }

  // Empty or whitespace-only text = the LLM failed to produce output
  const text = result.text.trim();
  if (!text) {
    log.warn(`Think step "${step.id}" produced empty output, treating as error`);
    return { error: `Think step produced no output for: ${step.description}` };
  }

  return text;
}

/** Execute a tool step — focused LLM call with module-specific tools and manual retry loop. */
async function executeToolStep(
  step: PlanStep,
  originalRequest: string,
  depContext: string,
  active: NonNullable<ReturnType<typeof getProviderForRole>>,
  stepNumber: number,
  approvalGate?: ApprovalGate,
  onToolCall?: (toolCallId: string, toolName: string, args: Record<string, unknown>, stepId?: string) => void,
  onToolResult?: (toolCallId: string, toolName: string, result: unknown, stepId?: string) => void,
): Promise<unknown> {
  if (!step.tool) {
    throw new Error(`Tool step ${step.id} is missing a tool reference`);
  }

  const { module: moduleRef, pluginId, toolName } = parseToolRef(step.tool);

  let moduleToolSet = buildModulePluginToolSet(moduleRef, approvalGate);
  if (!moduleToolSet) {
    throw new Error(`Module "${moduleRef}" not found or has no available tools`);
  }

  // Filter to the single named tool
  const fullToolName = `${pluginId}_${toolName}`;
  const targetTool = moduleToolSet.tools[fullToolName];
  if (targetTool) {
    moduleToolSet = { ...moduleToolSet, tools: { [fullToolName]: targetTool } };
  } else {
    log.warn(`Tool "${toolName}" not found as "${fullToolName}", using all module tools`);
  }

  // Inject __error__ tool so the LLM can signal fatal failure back to the planner
  const errorTool = {
    __error__: {
      description: "Call this when you cannot accomplish the step after retrying. Signals a fatal error to the planner so it can re-plan.",
      inputSchema: z.object({
        reason: z.string().describe("What went wrong and why you cannot complete this step"),
      }),
      execute: async (args: { reason: string }) => ({ error: args.reason }),
    },
  };

  // When the step has dependency context, the LLM may determine the step is
  // unnecessary (e.g. "login" when check_session says already logged in).
  // Inject a __skip__ tool so the LLM can explicitly signal this.
  const hasDeps = (step.depends_on ?? []).length > 0;
  const tools = hasDeps
    ? {
        ...moduleToolSet.tools,
        ...errorTool,
        __skip__: {
          description: "Skip this step when prior step results prove the action is unnecessary or already done. Only call this when you are CERTAIN the step does not need to run.",
          inputSchema: z.object({
            reason: z.string().describe("Why this step is being skipped"),
          }),
          execute: async (args: { reason: string }) => ({ skipped: true, reason: args.reason }),
        },
      }
    : { ...moduleToolSet.tools, ...errorTool };

  const toolNames = Object.keys(tools);
  log.dev.debug(`Executor tools for ${step.tool}`, { toolCount: toolNames.length, tools: toolNames });

  const basePrompt = loadPrompt("executor-tool-system.md");
  const systemPrompt = moduleToolSet.pluginPrompts.length > 0
    ? `${basePrompt}\n\n${moduleToolSet.pluginPrompts.join("\n\n")}`
    : basePrompt;

  const messages: ModelMessage[] = [
    { role: "user", content: `You are executing one step of a larger plan.\n\nYour task: ${step.description}\n\nLarger plan context: ${originalRequest}\nUse this context to choose better parameters for your tool call.${depContext}` },
  ];

  // Track attempt records for structured failure reports
  const attemptRecords: AttemptRecord[] = [];

  const runStream = async (streamMessages: ModelMessage[], attempt: number) => {
    let fullText = "";
    const toolResults: unknown[] = [];
    const toolCallRecords: ToolCallRecord[] = [];
    const phantomToolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> = [];
    let streamError: unknown = null;
    let lastFinishReason = "";
    let toolCallCount = 0;

    // Track tool inputs that started but never completed as tool-call events
    // (AI SDK v6 bug: empty-param tools via OpenRouter streaming don't emit tool-call)
    const pendingToolInputs = new Map<string, { toolName: string; argsText: string }>();

    log.dev.debug(`Executor attempt ${attempt}/${MAX_EXECUTOR_ROUNDS} starting for step ${stepNumber}`, { tool: step.tool, tools: toolNames });

    // Suppress unhandled rejection warnings on derived promises
    const noop = () => {};

    const streamResult = streamText({
      model: active.model,
      system: systemPrompt,
      messages: streamMessages,
      tools,
      stopWhen: stepCountIs(1),
    });

    Promise.resolve(streamResult.usage).catch(noop);
    Promise.resolve(streamResult.response).catch(noop);
    Promise.resolve(streamResult.text).catch(noop);

    for await (const part of streamResult.fullStream) {
      switch (part.type) {
        case "text-delta":
          fullText += part.text;
          // Log once when LLM starts producing text (not every delta)
          if (fullText.length === part.text.length) {
            log.dev.debug("Executor LLM generating text...");
          }
          break;
        case "tool-call":
          toolCallCount++;
          pendingToolInputs.delete(part.toolCallId);
          if (part.toolName === "__skip__") {
            const reason = (part.input as Record<string, unknown>)["reason"] ?? "no reason";
            log.info(`Plan step ${stepNumber} skipped: ${String(reason)}`);
          } else if (part.toolName === "__error__") {
            const reason = (part.input as Record<string, unknown>)["reason"] ?? "no reason";
            log.error(`Plan step ${stepNumber} raised error: ${String(reason)}`);
            log.user.high(`Step ${stepNumber} failed: ${String(reason)}`);
          } else if (!(part.toolName in tools)) {
            log.error(`Executor called unavailable tool "${part.toolName}"`, { available: toolNames, step: step.id });
            phantomToolCalls.push({ toolCallId: part.toolCallId, toolName: part.toolName, args: part.input as Record<string, unknown> });
          } else {
            log.dev.debug(`Executor tool call: ${part.toolName}`, { args: part.input });
            onToolCall?.(part.toolCallId, part.toolName, part.input as Record<string, unknown>, step.id);
          }
          break;
        case "tool-result": {
          const record: ToolCallRecord = {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: {} as Record<string, unknown>, // args already forwarded via tool-call event
            result: part.output,
          };
          toolCallRecords.push(record);
          if (part.toolName === "__skip__" || part.toolName === "__error__") {
            toolResults.push(part.output);
          } else {
            log.dev.debug(`Executor tool result: ${part.toolName}`, { resultPreview: JSON.stringify(part.output).slice(0, 200) });
            onToolResult?.(part.toolCallId, part.toolName, part.output, step.id);
            toolResults.push(part.output);
          }
          break;
        }
        case "finish":
          lastFinishReason = (part as Record<string, unknown>)["finishReason"] as string ?? "unknown";
          log.dev.debug(`Executor attempt ${attempt} stream finished`, {
            finishReason: lastFinishReason,
            toolCalls: toolCallCount,
            toolResults: toolResults.length,
          });
          break;
        case "error":
          log.error("Executor stream error", { error: part.error });
          streamError = part.error;
          break;
        default: {
          const p = part as Record<string, unknown>;
          const eventType = p["type"] as string;

          // Track tool-input-start / tool-input-delta for fallback execution
          if (eventType === "tool-input-start" && typeof p["id"] === "string" && typeof p["toolName"] === "string") {
            pendingToolInputs.set(p["id"] as string, { toolName: p["toolName"] as string, argsText: "" });
            log.dev.verbose(`Stream event: tool-input-start (no tool-call yet)`, { toolName: p["toolName"], id: p["id"] });
          } else if (eventType === "tool-input-delta" && typeof p["id"] === "string" && typeof p["delta"] === "string") {
            const pending = pendingToolInputs.get(p["id"] as string);
            if (pending) pending.argsText += p["delta"] as string;
          } else {
            log.dev.verbose(`Stream event: ${eventType}`, { keys: Object.keys(p).filter(k => k !== "type") });
          }

          break;
        }
      }
    }

    // Workaround: if the model made tool calls (tool-input-start) but the AI SDK
    // never emitted tool-call events, execute the tools manually
    if (pendingToolInputs.size > 0 && toolResults.length === 0) {
      const pendingSummary = [...pendingToolInputs.entries()].map(([id, { toolName: tn, argsText }]) =>
        `${tn}(${argsText.slice(0, 100) || "{}"}) [${id.slice(0, 12)}]`
      );
      log.warn(`${String(pendingToolInputs.size)} tool input(s) started but never completed as tool-call events — executing manually`, {
        tools: pendingSummary,
      });

      for (const [id, { toolName: tn, argsText }] of pendingToolInputs) {
        const tool = moduleToolSet.tools[tn];
        if (!tool || !tool.execute) {
          log.error(`Cannot manually execute tool "${tn}" — not found in tool set`);
          continue;
        }

        let parsedArgs: Record<string, unknown> = {};
        if (argsText.trim()) {
          try {
            parsedArgs = JSON.parse(argsText) as Record<string, unknown>;
          } catch {
            log.warn(`Could not parse tool args for "${tn}", using empty args`, { argsText });
          }
        }

        log.dev.debug(`Manual executor tool call: ${tn}`, { args: parsedArgs, toolCallId: id });
        onToolCall?.(id, tn, parsedArgs, step.id);

        try {
          const result = await tool.execute(parsedArgs, { toolCallId: id, messages: [], abortSignal: undefined as unknown as AbortSignal });
          log.dev.debug(`Manual executor tool result: ${tn}`, { resultPreview: JSON.stringify(result).slice(0, 200) });
          onToolResult?.(id, tn, result, step.id);
          toolResults.push(result);
          toolCallRecords.push({ toolCallId: id, toolName: tn, args: parsedArgs, result });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.error(`Manual tool execution failed: ${tn}`, { error: message });
          const errorResult = { error: message };
          toolResults.push(errorResult);
          toolCallRecords.push({ toolCallId: id, toolName: tn, args: parsedArgs, result: errorResult });
        }
      }
    }

    // Warn when the LLM generated text instead of calling a tool
    if (fullText.trim() && toolResults.length === 0) {
      log.warn("Executor generated text instead of calling a tool", {
        text: fullText.slice(0, 500),
        step: step.id,
      });
    }

    log.dev.debug(`Executor stream complete`, {
      attempt,
      totalToolCalls: toolCallCount,
      totalToolResults: toolResults.length,
      pendingToolInputs: pendingToolInputs.size,
      textLength: fullText.length,
      lastFinishReason,
      textPreview: fullText.slice(0, 300) || "(empty)",
    });

    // Re-throw stream errors so the caller can handle them
    if (streamError) {
      const errObj = streamError as Record<string, unknown>;
      const body = typeof errObj["responseBody"] === "string" ? errObj["responseBody"] : "";
      const name = typeof errObj["name"] === "string" ? errObj["name"] : "";
      throw new Error(`${name}: ${body}`);
    }

    return { fullText, toolResults, toolCallRecords, phantomToolCalls };
  };

  // Manual retry loop: each attempt is a separate streamText call with stepCountIs(1).
  // Between attempts, failed tool calls + error results are appended to messages.
  let lastResult;
  for (let attempt = 1; attempt <= MAX_EXECUTOR_ROUNDS; attempt++) {
    log.info(`Executor attempt ${attempt}/${MAX_EXECUTOR_ROUNDS} for step ${stepNumber}: ${step.description}`);
    lastResult = await runStream(messages, attempt);

    // LLM explicitly gave up via __error__ — don't retry
    const usedErrorTool = lastResult.toolCallRecords.some((tc) => tc.toolName === "__error__");
    if (usedErrorTool) break;

    // LLM called tools not in the available set — retry with corrective feedback
    if (lastResult.phantomToolCalls.length > 0 && lastResult.toolResults.length === 0) {
      if (attempt === MAX_EXECUTOR_ROUNDS) break;
      const phantomNames = lastResult.phantomToolCalls.map((tc) => tc.toolName).join(", ");
      log.warn(`Executor attempt ${attempt} called unavailable tool(s): ${phantomNames}, retrying`);
      messages.push({
        role: "assistant",
        content: lastResult.phantomToolCalls.map((tc) => ({
          type: "tool-call" as const,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.args,
        })),
      });
      messages.push({
        role: "tool",
        content: lastResult.phantomToolCalls.map((tc) => ({
          type: "tool-result" as const,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          output: { type: "text" as const, value: JSON.stringify({ error: `Tool "${tc.toolName}" is NOT available. You can ONLY use: ${toolNames.join(", ")}` }) },
        })),
      });
      continue;
    }

    // LLM generated text only — it gave up
    if (lastResult.toolResults.length === 0) break;

    const lastToolResult = lastResult.toolResults[lastResult.toolResults.length - 1];
    const errorMsg = isErrorResult(lastToolResult);
    const empty = !errorMsg && isEmptyResult(lastToolResult);

    // Record attempt for failure reporting
    const lastRecord = lastResult.toolCallRecords[lastResult.toolCallRecords.length - 1];
    const attemptRecord: AttemptRecord = {
      attemptNumber: attempt,
      toolArgs: lastRecord?.args ?? {},
      resultSummary: JSON.stringify(lastToolResult).slice(0, 500),
    };

    // Success checks: first error/empty, then success criteria
    if (!errorMsg && !empty) {
      // Check success criteria if defined
      if (step.success_criteria) {
        const executorModel = getProviderForRole("executor");
        if (executorModel) {
          const evaluation = await evaluateSuccessCriteria(
            lastToolResult,
            step.success_criteria,
            step.description,
            executorModel.model,
          );

          if (!evaluation.passed) {
            attemptRecord.criteriaFeedback = evaluation.feedback;
            attemptRecords.push(attemptRecord);

            if (attempt === MAX_EXECUTOR_ROUNDS) {
              log.warn(`Success criteria not met after ${attempt} attempts`, { feedback: evaluation.feedback });
              break;
            }

            log.info(`Success criteria not met on attempt ${attempt}, retrying`, { feedback: evaluation.feedback });

            // Append failed result + criteria feedback to messages for next attempt
            messages.push({
              role: "assistant",
              content: lastResult.toolCallRecords.map((tc) => ({
                type: "tool-call" as const,
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.args,
              })),
            });
            messages.push({
              role: "tool",
              content: lastResult.toolCallRecords.map((tc) => ({
                type: "tool-result" as const,
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                output: { type: "text" as const, value: JSON.stringify(tc.result) },
              })),
            });
            messages.push({
              role: "user",
              content: `Result did not meet success criteria: ${evaluation.feedback}\nTry a different approach — use different search terms, filters, or parameters.`,
            });
            continue;
          }
        }
      }

      // Passed all checks
      attemptRecords.push(attemptRecord);
      break;
    }

    attemptRecords.push(attemptRecord);
    if (attempt === MAX_EXECUTOR_ROUNDS) break;

    if (errorMsg) {
      log.info(`Executor attempt ${attempt} returned error, retrying`, { error: errorMsg });
    } else {
      log.info(`Executor attempt ${attempt} returned empty results, retrying with broader search`);
    }

    // Append failed tool calls + results as messages for next attempt
    messages.push({
      role: "assistant",
      content: lastResult.toolCallRecords.map((tc) => ({
        type: "tool-call" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.args,
      })),
    });
    messages.push({
      role: "tool",
      content: lastResult.toolCallRecords.map((tc) => ({
        type: "tool-result" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        output: { type: "text" as const, value: JSON.stringify(tc.result) },
      })),
    });
  }

  // Return the last tool result if any tool executed successfully
  if (lastResult && lastResult.toolResults.length > 0) {
    const lastToolResult = lastResult.toolResults[lastResult.toolResults.length - 1];

    // If all attempts failed and we have attempt records, build a structured failure report
    const lastErrorMsg = isErrorResult(lastToolResult);
    const usedErrorTool = lastResult.toolCallRecords.some((tc) => tc.toolName === "__error__");
    if ((lastErrorMsg || usedErrorTool) && attemptRecords.length > 0) {
      return {
        error: JSON.stringify({
          type: "failure_report",
          stepId: step.id,
          stepDescription: step.description,
          totalAttempts: attemptRecords.length,
          attempts: attemptRecords,
          conclusion: lastErrorMsg ?? "Executor gave up via __error__",
        }),
      };
    }

    return lastToolResult;
  }

  // No tool was executed — this is a failure for a tool step.
  // Return as error so executePlan triggers re-planning.
  const explanation = lastResult?.fullText?.trim() || "Executor failed to execute any tools for this step";
  log.warn(`Tool step ${stepNumber} produced no tool results, raising error to planner`, {
    step: step.id,
    explanation: explanation.slice(0, 300),
  });
  return { error: explanation };
}
