import { streamText, generateText, stepCountIs } from "ai";
import { getActiveProvider } from "../providers/llm.js";
import { buildModulePluginToolSet } from "../plugins/runner.js";
import { createLogger } from "../logger/index.js";
import type { PlanStep, PlanResult } from "@talos/shared/types";
import type { ApprovalGate } from "../plugins/runner.js";

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
  onProgress?: (stepId: string, description: string, status: "running" | "complete" | "error") => void,
  onToolCall?: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void,
  onToolResult?: (toolCallId: string, toolName: string, result: unknown) => void,
): Promise<PlanResult> {
  const active = getActiveProvider();
  if (!active) {
    throw new Error("No active model configured");
  }

  const results = new Map<string, unknown>();
  const stepResults: PlanResult["steps"] = [];

  // Build execution order respecting dependencies
  const executed = new Set<string>();
  const remaining = new Set(plan.map((s) => s.id));

  while (remaining.size > 0) {
    // Find steps whose dependencies are all satisfied
    const ready = plan.filter((step) => {
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
      onProgress?.(step.id, step.description, "running");
      log.user.high(`Step ${step.id}: ${step.description}`);

      try {
        const stepResult = await executeStep(step, request, results, active, approvalGate, onToolCall, onToolResult);
        results.set(step.id, stepResult);
        stepResults.push({ id: step.id, status: "complete", result: stepResult });
        onProgress?.(step.id, step.description, "complete");
        log.dev.debug(`Step ${step.id} complete`, { resultPreview: String(stepResult).slice(0, 200) });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        stepResults.push({ id: step.id, status: "error", error: message });
        onProgress?.(step.id, step.description, "error");
        log.error(`Step ${step.id} failed`, { error: message });
      }

      executed.add(step.id);
      remaining.delete(step.id);
    }
  }

  // Build a summary of what happened
  const completedCount = stepResults.filter((s) => s.status === "complete").length;
  const summary = completedCount === stepResults.length
    ? `All ${completedCount} step(s) completed successfully.`
    : `${completedCount}/${stepResults.length} step(s) completed.`;

  return { steps: stepResults, summary };
}

/** Build context string from dependency results. */
function buildDependencyContext(step: PlanStep, results: Map<string, unknown>): string {
  const deps = step.depends_on ?? [];
  if (deps.length === 0) return "";

  const parts: string[] = [];
  for (const depId of deps) {
    const depResult = results.get(depId);
    if (depResult !== undefined) {
      const json = JSON.stringify(depResult, null, 2);
      const truncated = json.length > 4000 ? json.slice(0, 4000) + "\n...(truncated)" : json;
      parts.push(`[Result from ${depId}]:\n${truncated}`);
    }
  }

  return parts.length > 0 ? "\n\n" + parts.join("\n\n") : "";
}

/** Execute a single plan step. */
async function executeStep(
  step: PlanStep,
  originalRequest: string,
  results: Map<string, unknown>,
  active: NonNullable<ReturnType<typeof getActiveProvider>>,
  approvalGate?: ApprovalGate,
  onToolCall?: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void,
  onToolResult?: (toolCallId: string, toolName: string, result: unknown) => void,
): Promise<unknown> {
  const depContext = buildDependencyContext(step, results);

  if (step.type === "think") {
    return executeThinkStep(step, originalRequest, depContext, active);
  }

  return executeToolStep(step, originalRequest, depContext, active, approvalGate, onToolCall, onToolResult);
}

/** Execute a think step — LLM call with no tools, pure computation. */
async function executeThinkStep(
  step: PlanStep,
  originalRequest: string,
  depContext: string,
  active: NonNullable<ReturnType<typeof getActiveProvider>>,
): Promise<string> {
  const result = await generateText({
    model: active.model,
    system: "You are a data processing assistant. Perform the requested computation and return the result. Be concise and structured.",
    prompt: `Original request: ${originalRequest}\n\nTask: ${step.description}${depContext}`,
  });

  return result.text;
}

/** Execute a tool step — focused LLM call with module-specific tools. */
async function executeToolStep(
  step: PlanStep,
  originalRequest: string,
  depContext: string,
  active: NonNullable<ReturnType<typeof getActiveProvider>>,
  approvalGate?: ApprovalGate,
  onToolCall?: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void,
  onToolResult?: (toolCallId: string, toolName: string, result: unknown) => void,
): Promise<unknown> {
  if (!step.module) {
    throw new Error(`Tool step ${step.id} is missing a module reference`);
  }

  const moduleToolSet = buildModulePluginToolSet(step.module, approvalGate);
  if (!moduleToolSet) {
    throw new Error(`Module "${step.module}" not found or has no available tools`);
  }

  const basePrompt = "You are a focused tool executor. Use the available tools to accomplish the task. Be efficient: stop as soon as you have the information needed — do not exhaustively search every possible variation. Be concise in your output.";
  const systemPrompt = moduleToolSet.pluginPrompts.length > 0
    ? `${basePrompt}\n\n${moduleToolSet.pluginPrompts.join("\n\n")}`
    : basePrompt;

  let fullText = "";
  let lastToolResults: unknown[] = [];

  // Suppress unhandled rejection warnings on derived promises
  const noop = () => {};

  const streamResult = streamText({
    model: active.model,
    system: systemPrompt,
    messages: [
      { role: "user", content: `Original request: ${originalRequest}\n\nTask: ${step.description}${depContext}` },
    ],
    tools: moduleToolSet.tools,
    stopWhen: stepCountIs(3),
  });

  Promise.resolve(streamResult.usage).catch(noop);
  Promise.resolve(streamResult.response).catch(noop);
  Promise.resolve(streamResult.text).catch(noop);

  for await (const part of streamResult.fullStream) {
    switch (part.type) {
      case "text-delta":
        fullText += part.text;
        break;
      case "tool-call":
        log.dev.debug(`Executor tool call: ${part.toolName}`, { args: part.input });
        onToolCall?.(part.toolCallId, part.toolName, part.input as Record<string, unknown>);
        break;
      case "tool-result":
        log.dev.debug(`Executor tool result: ${part.toolName}`, { resultPreview: JSON.stringify(part.output).slice(0, 100) });
        onToolResult?.(part.toolCallId, part.toolName, part.output);
        lastToolResults.push(part.output);
        break;
      case "error":
        log.error("Executor stream error", { error: part.error });
        break;
    }
  }

  // Return the most useful result: tool outputs if available, otherwise text
  if (lastToolResults.length > 0) {
    return lastToolResults.length === 1 ? lastToolResults[0] : lastToolResults;
  }
  return fullText;
}
