import { generateObject } from "ai";
import { z } from "zod";
import { getProviderForRole } from "../providers/llm.js";
import { createLogger } from "../logger/index.js";
import { loadPrompt } from "../prompts/index.js";
import type { PlanStep } from "@talos/shared/types";

const log = createLogger("planner");

const planSchema = z.object({
  steps: z.array(z.object({
    id: z.string().describe("Step identifier like step_1, step_2, etc."),
    type: z.enum(["tool", "think"]).describe("'tool' requires a module, 'think' is pure computation"),
    module: z.string().optional().describe("Module reference like 'google:gmail' — required for tool steps"),
    tool_name: z.string().optional().describe("The specific function to call from the module's function list — required for tool steps"),
    description: z.string().describe("What this step accomplishes"),
    depends_on: z.array(z.string()).optional().describe("Step IDs this step depends on for input data"),
  })),
});

const PLANNER_SYSTEM = loadPrompt("planner-system.md");
const REPLANNER_SYSTEM = loadPrompt("replanner-system.md");

/**
 * Generate a structured plan for executing a multi-step request.
 * Uses the active provider's model with structured output.
 * @param pluginPrompts - prompt.md content from plugins (workflow instructions for the planner)
 */
export async function generatePlan(
  request: string,
  moduleCatalog: string,
  pluginPrompts?: string[],
): Promise<PlanStep[]> {
  const active = getProviderForRole("planner");
  if (!active) {
    throw new Error("No active model configured");
  }

  const moduleLines = moduleCatalog.split("\n").filter((l) => l.trim().length > 0);
  log.dev.debug("Generating plan", { request, moduleCount: moduleLines.length, modules: moduleLines.map((l) => l.trim()) });

  let prompt = `Available modules:\n${moduleCatalog}`;

  if (pluginPrompts && pluginPrompts.length > 0) {
    prompt += `\n\n## Plugin workflow instructions\n\n${pluginPrompts.join("\n\n---\n\n")}`;
  }

  prompt += `\n\nUser request: ${request}`;

  log.user.high("Generating plan...");

  const result = await generateObject({
    model: active.model,
    schema: planSchema,
    system: PLANNER_SYSTEM,
    prompt,
  });

  const steps = result.object.steps as PlanStep[];

  const stepSummaries = steps.map((s) => `${s.id}: ${s.type}${s.module ? ` [${s.module}]` : ""}${s.tool_name ? ` fn=${s.tool_name}` : ""} — ${s.description}`);
  log.info(`Plan generated: ${steps.length} step(s)`, { steps: steps.map((s) => s.description) });
  log.dev.debug("Plan details", { steps: stepSummaries, plan: steps });

  return steps;
}

export interface StepOutcome {
  id: string;
  description: string;
  status: "complete" | "skipped" | "error";
  result?: unknown;
  error?: string;
}

/**
 * Re-plan remaining steps after a step was skipped or errored.
 * Uses the planner role model to generate a revised set of steps.
 */
export async function replanRemainingSteps(
  request: string,
  moduleCatalog: string,
  completedSteps: StepOutcome[],
  remainingSteps: PlanStep[],
  triggerStep: StepOutcome,
  pluginPrompts?: string[],
): Promise<PlanStep[]> {
  const active = getProviderForRole("planner");
  if (!active) {
    throw new Error("No active model configured");
  }

  let prompt = `## Original Request\n${request}\n\n`;
  prompt += `## Available Modules\n${moduleCatalog}\n\n`;

  if (pluginPrompts && pluginPrompts.length > 0) {
    prompt += `## Plugin workflow instructions\n\n${pluginPrompts.join("\n\n---\n\n")}\n\n`;
  }

  prompt += `## Completed Steps\n`;
  for (const s of completedSteps) {
    const resultStr = s.result != null ? JSON.stringify(s.result).slice(0, 500) : "(no output)";
    prompt += `- ${s.id} [${s.status}]: ${s.description}\n  Result: ${resultStr}\n`;
  }

  prompt += `\n## Trigger Event\n`;
  prompt += `Step ${triggerStep.id} [${triggerStep.status}]: ${triggerStep.description}\n`;
  if (triggerStep.error) {
    prompt += `Error: ${triggerStep.error}\n`;
  }
  if (triggerStep.result != null) {
    prompt += `Result: ${JSON.stringify(triggerStep.result).slice(0, 500)}\n`;
  }

  prompt += `\n## Remaining Planned Steps (not yet executed)\n`;
  prompt += `Each step below shows its type, module reference, and tool_name. Preserve these values in your revised steps.\n`;
  for (const s of remainingSteps) {
    prompt += `- ${s.id}: type=${s.type}`;
    if (s.module) prompt += `, module="${s.module}"`;
    if (s.tool_name) prompt += `, tool_name="${s.tool_name}"`;
    if (s.depends_on && s.depends_on.length > 0) prompt += `, depends_on=[${s.depends_on.join(", ")}]`;
    prompt += ` — ${s.description}\n`;
  }

  prompt += `\nRevise the remaining steps based on the execution progress and trigger event.`;

  log.user.high("Re-planning remaining steps...");
  log.dev.debug("Re-plan context", { completedCount: completedSteps.length, remainingCount: remainingSteps.length, trigger: triggerStep.id });

  const result = await generateObject({
    model: active.model,
    schema: planSchema,
    system: REPLANNER_SYSTEM,
    prompt,
  });

  const steps = result.object.steps as PlanStep[];

  const stepSummaries = steps.map((s) => `${s.id}: ${s.type}${s.module ? ` [${s.module}]` : ""}${s.tool_name ? ` fn=${s.tool_name}` : ""} — ${s.description}`);
  log.info(`Re-plan generated: ${steps.length} step(s)`, { steps: steps.map((s) => s.description) });
  log.dev.debug("Re-plan details", { steps: stepSummaries, plan: steps });

  return steps;
}
