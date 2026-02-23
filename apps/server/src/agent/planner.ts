import { generateObject } from "ai";
import { z } from "zod";
import { getActiveProvider } from "../providers/llm.js";
import { createLogger } from "../logger/index.js";
import { loadPrompt } from "../prompts/index.js";
import type { PlanStep } from "@talos/shared/types";

const log = createLogger("planner");

const planSchema = z.object({
  steps: z.array(z.object({
    id: z.string().describe("Step identifier like step_1, step_2, etc."),
    type: z.enum(["tool", "think"]).describe("'tool' requires a module, 'think' is pure computation"),
    module: z.string().optional().describe("Module reference like 'google:gmail' — required for tool steps"),
    description: z.string().describe("What this step accomplishes"),
    depends_on: z.array(z.string()).optional().describe("Step IDs this step depends on for input data"),
  })),
});

const PLANNER_SYSTEM = loadPrompt("planner-system.md");

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
  const active = getActiveProvider();
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

  const stepSummaries = steps.map((s) => `${s.id}: ${s.type}${s.module ? ` [${s.module}]` : ""} — ${s.description}`);
  log.info(`Plan generated: ${steps.length} step(s)`, { steps: steps.map((s) => s.description) });
  log.dev.debug("Plan details", { steps: stepSummaries, plan: steps });

  return steps;
}
