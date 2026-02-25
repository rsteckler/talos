import { generateObject } from "ai";
import { z } from "zod";
import { getProviderForRole } from "../providers/llm.js";
import { createLogger } from "../logger/index.js";
import { loadPrompt } from "../prompts/index.js";
import { formatToolSpecs } from "../plugins/registry.js";
import type { ModuleCatalogEntry } from "../plugins/registry.js";
import type { PlanStep } from "@talos/shared/types";
import { parseToolRef } from "@talos/shared";

const log = createLogger("planner");

const planSchema = z.object({
  steps: z.array(z.object({
    id: z.string().describe("Step identifier like step_1, step_2, etc."),
    type: z.enum(["tool", "think"]).describe("'tool' requires a tool reference, 'think' is pure computation"),
    tool: z.string().optional().describe("Module ref + function name joined by '/', e.g. 'obsidian:obsidian/search_for_snippet'. Required for tool steps, omit for think steps."),
    description: z.string().describe("What this step accomplishes"),
    depends_on: z.array(z.string()).optional().describe("Step IDs this step depends on for input data"),
  })),
});

const PLANNER_SYSTEM = loadPrompt("planner-system.md");
const REPLANNER_SYSTEM = loadPrompt("replanner-system.md");
const VALIDATOR_SYSTEM = loadPrompt("validator-system.md");
const VALIDATOR_USER = loadPrompt("validator-user.md");

/**
 * Generate a structured plan for executing a multi-step request.
 * Uses the active provider's model with structured output.
 * Pass 1 generates the initial plan; pass 2 validates data flow using focused tool specs.
 * @param catalogEntries - full catalog entries for pass 2 validation
 * @param pluginPrompts - prompt.md content from plugins (workflow instructions for the planner)
 */
export async function generatePlan(
  request: string,
  moduleCatalog: string,
  catalogEntries: ModuleCatalogEntry[],
  pluginPrompts?: string[],
): Promise<PlanStep[]> {
  const active = getProviderForRole("planner");
  if (!active) {
    throw new Error("No active model configured");
  }

  const moduleLines = moduleCatalog.split("\n").filter((l) => l.trim().length > 0);
  log.dev.debug("Generating plan (pass 1)", { request, moduleCount: moduleLines.length, modules: moduleLines.map((l) => l.trim()) });

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

  const stepSummaries = steps.map((s) => `${s.id}: ${s.type}${s.tool ? ` [${s.tool}]` : ""} — ${s.description}`);
  log.info(`Plan pass 1: ${steps.length} step(s)`, { steps: steps.map((s) => s.description) });
  log.dev.debug("Pass 1 details", { steps: stepSummaries, plan: steps });

  // Pass 2: validate data flow with focused tool specs
  const validated = await validatePlan(steps, request, catalogEntries);
  return validated;
}

/**
 * Validate a plan's data flow using focused tool specifications (pass 2).
 * Only sees tool specs for functions actually selected in the plan,
 * plus plugin prompts for only the used plugins.
 */
async function validatePlan(
  plan: PlanStep[],
  request: string,
  catalogEntries: ModuleCatalogEntry[],
): Promise<PlanStep[]> {
  const toolSpecs = formatToolSpecs(plan);

  // If there are no tool steps, skip validation
  if (!toolSpecs) return plan;

  const active = getProviderForRole("planner");
  if (!active) return plan;

  // Collect prompt.md only for plugins used in the plan
  const usedPluginIds = new Set<string>();
  for (const step of plan) {
    if (step.tool) {
      const { pluginId } = parseToolRef(step.tool);
      usedPluginIds.add(pluginId);
    }
  }

  const usedPrompts: string[] = [];
  const seenPrompts = new Set<string>();
  for (const entry of catalogEntries) {
    const pluginId = entry.moduleRef.split(":")[0];
    if (pluginId && usedPluginIds.has(pluginId) && entry.promptMd && !seenPrompts.has(pluginId)) {
      seenPrompts.add(pluginId);
      usedPrompts.push(entry.promptMd);
    }
  }

  // Format the current plan as readable text with explicit field labels
  const planLines = plan.map((s) => {
    const toolStr = s.tool ? ` tool="${s.tool}"` : "";
    return `- ${s.id}: [${s.type}]${toolStr} — ${s.description}`;
  });

  const pluginSection = usedPrompts.length > 0
    ? `## Plugin Instructions\n${usedPrompts.join("\n\n---\n\n")}`
    : "";

  const prompt = VALIDATOR_USER
    .replace("{{request}}", request)
    .replace("{{toolSpecs}}", toolSpecs)
    .replace("{{pluginInstructions}}", pluginSection)
    .replace("{{planLines}}", planLines.join("\n"));

  log.dev.debug("Validating plan (pass 2)", { toolStepCount: plan.filter((s) => s.type === "tool").length });

  const result = await generateObject({
    model: active.model,
    schema: planSchema,
    system: VALIDATOR_SYSTEM,
    prompt,
  });

  const validated = result.object.steps as PlanStep[];

  // Log differences if any
  const changed = validated.length !== plan.length ||
    validated.some((v, i) => {
      const orig = plan[i];
      return !orig || v.type !== orig.type || v.tool !== orig.tool;
    });

  if (changed) {
    const validatedSummaries = validated.map((s) => `${s.id}: ${s.type}${s.tool ? ` [${s.tool}]` : ""} — ${s.description}`);
    log.info(`Plan pass 2 revised: ${plan.length} → ${validated.length} step(s)`);
    log.dev.debug("Pass 2 details", { steps: validatedSummaries, plan: validated });
  } else {
    log.info("Plan pass 2: no changes needed");
  }

  return validated;
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
  prompt += `Each step below shows its type and tool reference. Preserve these values in your revised steps.\n`;
  for (const s of remainingSteps) {
    prompt += `- ${s.id}: type=${s.type}`;
    if (s.tool) prompt += `, tool="${s.tool}"`;
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

  const stepSummaries = steps.map((s) => `${s.id}: ${s.type}${s.tool ? ` [${s.tool}]` : ""} — ${s.description}`);
  log.info(`Re-plan generated: ${steps.length} step(s)`, { steps: steps.map((s) => s.description) });
  log.dev.debug("Re-plan details", { steps: stepSummaries, plan: steps });

  return steps;
}
