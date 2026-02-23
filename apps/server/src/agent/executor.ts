import { streamText, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { getProviderForRole } from "../providers/llm.js";
import { buildModulePluginToolSet, getModulePrompt } from "../plugins/runner.js";
import { createLogger } from "../logger/index.js";
import { loadPrompt } from "../prompts/index.js";
import { replanRemainingSteps } from "./planner.js";
import type { StepOutcome } from "./planner.js";
import type { PlanStep, PlanResult } from "@talos/shared/types";
import type { ApprovalGate } from "../plugins/runner.js";

export interface ReplanContext {
  moduleCatalog: string;
  pluginPrompts?: string[];
  onPlanRevised?: (removedStepIds: string[], addedSteps: Array<{ id: string; description: string }>) => void;
}

const MAX_REPLANS = 3;

const log = createLogger("executor");


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
  const active = getProviderForRole("executor");
  if (!active) {
    throw new Error("No active model configured");
  }

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
        replanContext.moduleCatalog,
        completedOutcomes,
        remainingSteps,
        triggerOutcome,
        replanContext.pluginPrompts,
      );

      // Validate: every tool step must have a module reference
      const invalid = revisedSteps.filter((s) => s.type === "tool" && !s.module);
      if (invalid.length > 0) {
        log.warn("Re-plan generated tool steps without module references, discarding re-plan", {
          invalidSteps: invalid.map((s) => s.id),
        });
        return;
      }

      // Compute diff for notification
      const removedStepIds = remainingSteps.map((s) => s.id);
      const addedSteps = revisedSteps.map((s) => ({ id: s.id, description: s.description }));

      // Track new step IDs as re-plan-originated
      for (const s of revisedSteps) {
        replanStepIds.add(s.id);
      }

      // Replace remaining plan steps
      currentPlan = [
        ...currentPlan.filter((s) => !remaining.has(s.id)),
        ...revisedSteps,
      ];

      // Update tracking state
      remaining = new Set(revisedSteps.map((s) => s.id));
      planStepNum = new Map(currentPlan.map((s, i) => [s.id, i + 1]));

      log.info(`Plan revised: removed ${removedStepIds.length} step(s), added ${revisedSteps.length} step(s)`, {
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

        const wasSkipped = stepResult != null && typeof stepResult === "object" && (stepResult as Record<string, unknown>)["skipped"] === true;
        stepResults.push({ id: step.id, status: "complete", result: stepResult });
        onProgress?.(step.id, step.description, wasSkipped ? "skipped" : "complete");
        if (wasSkipped) {
          log.info(`Plan step ${planStepNum.get(step.id)} skipped: ${step.description}`);
        } else {
          log.info(`Completed plan step ${planStepNum.get(step.id)}: ${step.description}`, { resultPreview: JSON.stringify(stepResult).slice(0, 200) });
        }

        // Collect prompt.md from the plugin used in this step
        if (step.type === "tool" && step.module) {
          const pluginId = step.module.split(":")[0];
          if (pluginId && !usedPluginPrompts.has(pluginId)) {
            const prompt = getModulePrompt(step.module);
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

/** Execute a think step — LLM call with no tools, pure computation. */
async function executeThinkStep(
  step: PlanStep,
  originalRequest: string,
  depContext: string,
  active: NonNullable<ReturnType<typeof getProviderForRole>>,
): Promise<string> {
  const result = await generateText({
    model: active.model,
    system: loadPrompt("executor-think-system.md"),
    prompt: `Original request: ${originalRequest}\n\nTask: ${step.description}${depContext}`,
  });

  return result.text;
}

/** Execute a tool step — focused LLM call with module-specific tools. */
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
  if (!step.module) {
    throw new Error(`Tool step ${step.id} is missing a module reference`);
  }

  let moduleToolSet = buildModulePluginToolSet(step.module, approvalGate);
  if (!moduleToolSet) {
    throw new Error(`Module "${step.module}" not found or has no available tools`);
  }

  // Filter to the single named tool when the planner specified one
  if (step.tool_name) {
    const pluginId = step.module.split(":")[0];
    const fullToolName = `${pluginId}_${step.tool_name}`;
    const targetTool = moduleToolSet.tools[fullToolName];
    if (targetTool) {
      moduleToolSet = { ...moduleToolSet, tools: { [fullToolName]: targetTool } };
    } else {
      log.warn(`tool_name "${step.tool_name}" not found as "${fullToolName}", using all module tools`);
    }
  }

  // When the step has dependency context, the LLM may determine the step is
  // unnecessary (e.g. "login" when check_session says already logged in).
  // Inject a __skip__ tool so the LLM can explicitly signal this.
  const hasDeps = (step.depends_on ?? []).length > 0;
  const tools = hasDeps
    ? {
        ...moduleToolSet.tools,
        __skip__: {
          description: "Skip this step when prior step results prove the action is unnecessary or already done. Only call this when you are CERTAIN the step does not need to run.",
          inputSchema: z.object({
            reason: z.string().describe("Why this step is being skipped"),
          }),
          execute: async (args: { reason: string }) => ({ skipped: true, reason: args.reason }),
        },
      }
    : moduleToolSet.tools;

  const toolNames = Object.keys(tools);
  log.dev.debug(`Executor tools for ${step.module}`, { toolCount: toolNames.length, tools: toolNames });

  const basePrompt = loadPrompt("executor-tool-system.md");
  const systemPrompt = moduleToolSet.pluginPrompts.length > 0
    ? `${basePrompt}\n\n${moduleToolSet.pluginPrompts.join("\n\n")}`
    : basePrompt;

  const messages = [
    { role: "user" as const, content: `Original request: ${originalRequest}\n\nTask: ${step.description}${depContext}` },
  ];

  const runStream = async () => {
    let fullText = "";
    const toolResults: unknown[] = [];
    let streamError: unknown = null;
    let stepCount = 0;
    let lastFinishReason = "";
    let toolCallCount = 0;

    // Track tool inputs that started but never completed as tool-call events
    // (AI SDK v6 bug: empty-param tools via OpenRouter streaming don't emit tool-call)
    const pendingToolInputs = new Map<string, { toolName: string; argsText: string }>();

    log.dev.debug(`Executor round starting`, { module: step.module, tools: toolNames });

    // Suppress unhandled rejection warnings on derived promises
    const noop = () => {};

    const streamResult = streamText({
      model: active.model,
      system: systemPrompt,
      messages,
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
          } else {
            log.dev.debug(`Executor tool call: ${part.toolName}`, { args: part.input });
            onToolCall?.(part.toolCallId, part.toolName, part.input as Record<string, unknown>, step.id);
          }
          break;
        case "tool-result":
          if (part.toolName === "__skip__") {
            toolResults.push(part.output);
          } else {
            log.dev.debug(`Executor tool result: ${part.toolName}`, { resultPreview: JSON.stringify(part.output).slice(0, 200) });
            onToolResult?.(part.toolCallId, part.toolName, part.output, step.id);
            toolResults.push(part.output);
          }
          break;
        case "finish":
          stepCount++;
          lastFinishReason = (part as Record<string, unknown>)["finishReason"] as string ?? "unknown";
          log.dev.debug(`Executor round complete`, {
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
      const pendingSummary = [...pendingToolInputs.entries()].map(([id, { toolName, argsText }]) =>
        `${toolName}(${argsText.slice(0, 100) || "{}"}) [${id.slice(0, 12)}]`
      );
      log.warn(`${String(pendingToolInputs.size)} tool input(s) started but never completed as tool-call events — executing manually`, {
        tools: pendingSummary,
      });

      for (const [id, { toolName, argsText }] of pendingToolInputs) {
        const tool = moduleToolSet.tools[toolName];
        if (!tool || !tool.execute) {
          log.error(`Cannot manually execute tool "${toolName}" — not found in tool set`);
          continue;
        }

        let parsedArgs: Record<string, unknown> = {};
        if (argsText.trim()) {
          try {
            parsedArgs = JSON.parse(argsText) as Record<string, unknown>;
          } catch {
            log.warn(`Could not parse tool args for "${toolName}", using empty args`, { argsText });
          }
        }

        log.dev.debug(`Manual executor tool call: ${toolName}`, { args: parsedArgs, toolCallId: id });
        onToolCall?.(id, toolName, parsedArgs, step.id);

        try {
          const result = await tool.execute(parsedArgs, { toolCallId: id, messages: [], abortSignal: undefined as unknown as AbortSignal });
          log.dev.debug(`Manual executor tool result: ${toolName}`, { resultPreview: JSON.stringify(result).slice(0, 200) });
          onToolResult?.(id, toolName, result, step.id);
          toolResults.push(result);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.error(`Manual tool execution failed: ${toolName}`, { error: message });
          toolResults.push({ error: message });
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
      totalSteps: stepCount,
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

    return { fullText, toolResults };
  };

  const result = await runStream();

  // Return the most useful result: tool outputs if available, otherwise text
  if (result.toolResults.length > 0) {
    return result.toolResults.length === 1 ? result.toolResults[0] : result.toolResults;
  }
  return result.fullText;
}
