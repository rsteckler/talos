import { generateObject } from "ai";
import { z } from "zod";
import { getActiveProvider } from "../providers/llm.js";
import { createLogger } from "../logger/index.js";
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

const PLANNER_SYSTEM = `You are a task planner. Given a user request and a list of available tool modules, produce a minimal plan to accomplish the request.

## Step Types

- **tool**: Requires a module reference. The executor will load that module's tools and let an LLM use them to accomplish the step.
- **think**: No tools needed. The executor will use an LLM to do pure computation — sorting, filtering, summarizing, formatting, or combining data from previous steps.

## Module References

Each module in the catalog is listed with a backtick-quoted reference like \`google:gmail\` or \`obsidian:obsidian\`.
For tool steps, the "module" field MUST be set to one of these exact references. Do NOT use display names.

## Rules

1. Use the fewest steps possible. If one tool step can accomplish the whole request, use one step.
2. Each tool step's "module" field must be an exact module reference from the catalog (e.g. "google:gmail", NOT "Gmail").
3. Think steps are for processing data between tool steps (sorting, filtering, formatting, etc.). Do NOT use a think step if the result can be returned directly from a tool step.
4. Steps can depend on previous steps via depends_on. A step only runs after its dependencies complete.
5. Keep descriptions concise but specific — they guide the executor LLM.
6. If the request only needs one module, create a single tool step — no think step needed.`;

/**
 * Generate a structured plan for executing a multi-step request.
 * Uses the active provider's model with structured output.
 */
export async function generatePlan(
  request: string,
  moduleCatalog: string,
): Promise<PlanStep[]> {
  const active = getActiveProvider();
  if (!active) {
    throw new Error("No active model configured");
  }

  log.dev.debug("Generating plan", { request, moduleCount: moduleCatalog.split("\n").length });

  const result = await generateObject({
    model: active.model,
    schema: planSchema,
    system: PLANNER_SYSTEM,
    prompt: `Available modules:\n${moduleCatalog}\n\nUser request: ${request}`,
  });

  const steps = result.object.steps as PlanStep[];

  log.dev.debug("Plan generated", { stepCount: steps.length, steps: steps.map((s) => `${s.id}: ${s.type}${s.module ? ` [${s.module}]` : ""} — ${s.description}`) });

  return steps;
}
