import { generateObject, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { getProviderForRole } from "../providers/llm.js";
import { createLogger } from "../logger/index.js";
import { loadPrompt } from "../prompts/index.js";
import { getLoadedPlugins, filterPromptForAudience } from "../plugins/loader.js";
import { toolRegistry } from "../plugins/tool-registry.js";
import type { ToolSearchResult } from "../plugins/tool-registry.js";
import type { PlanStep } from "@talos/shared/types";

const log = createLogger("planner");

const planSchema = z.object({
  steps: z.array(z.object({
    id: z.string().describe("Step identifier like step_1, step_2, etc."),
    type: z.enum(["tool", "think"]).describe("'tool' requires a tool reference, 'think' is pure computation"),
    tool: z.string().optional().describe("Module ref + function name joined by '/', e.g. 'obsidian:obsidian/search_for_snippet'. Required for tool steps, omit for think steps."),
    description: z.string().describe("What this step accomplishes"),
    depends_on: z.array(z.string()).optional().describe("Step IDs this step depends on for input data"),
    success_criteria: z.string().optional().describe("How to verify this step solved what was asked. Be specific to the user's request."),
    requires_smart_model: z.boolean().optional().describe("Set true for complex analysis/synthesis/reasoning. Leave false for simple data retrieval."),
  })),
});

const PLANNER_SYSTEM = loadPrompt("planner-system.md");
const REPLANNER_SYSTEM = loadPrompt("replanner-system.md");

const MAX_FIND_TOOLS_CALLS = 3;
const MAX_PLANNER_STEPS = 8;

/**
 * Generate a structured plan for executing a multi-step request.
 * Uses an agentic loop: the planner searches for tools via find_tools,
 * then submits a plan via submit_plan. Pass 2 validates data flow.
 * @param pluginPrompts - prompt.md content from plugins (workflow instructions for the planner)
 */
export async function generatePlan(
  request: string,
  pluginPrompts?: string[],
): Promise<{ steps: PlanStep[]; discoveredTools: Map<string, ToolSearchResult> }> {
  const active = getProviderForRole("planner");
  if (!active) {
    throw new Error("No active model configured");
  }

  log.user.high("Generating plan...");

  // Accumulate discovered tools across find_tools calls
  const discoveredTools = new Map<string, ToolSearchResult>();
  let findToolsCount = 0;
  let submittedPlan: PlanStep[] | null = null;

  const tools = {
    find_tools: {
      description: "Search for available tools by describing what action you need to perform. Returns matching tools with their references, descriptions, and parameters. You may call this up to 3 times to discover all the tools you need.",
      inputSchema: z.object({
        query: z.string().describe("Natural language description of the action you need, e.g. 'search grocery store', 'send email', 'get directions'"),
      }),
      execute: async (args: { query: string }) => {
        findToolsCount++;
        const isLast = findToolsCount >= MAX_FIND_TOOLS_CALLS;

        log.user.high("Searching for tools...");
        log.info("Searching for tools", { query: args.query, searchNumber: findToolsCount });

        const results = await toolRegistry.search(args.query, 8);

        // Accumulate into discovered set
        for (const r of results) {
          discoveredTools.set(r.toolRef, r);
        }

        log.dev.debug("Tools discovered", { count: results.length, tools: results.map(r => r.toolRef) });

        const formatted = results.map((r) => {
          const params = r.paramSummary.length > 0 ? `\n  Parameters: ${r.paramSummary.join(", ")}` : "";
          return `- ${r.toolRef}: ${r.description}${params}`;
        }).join("\n");

        // Include plugin workflow instructions for newly discovered plugins
        const loadedPlugins = getLoadedPlugins();
        const newPrompts: string[] = [];
        const seenPlugins = new Set<string>();
        for (const r of results) {
          if (!seenPlugins.has(r.pluginId)) {
            seenPlugins.add(r.pluginId);
            const loaded = loadedPlugins.get(r.pluginId);
            if (loaded?.promptMd) {
              newPrompts.push(filterPromptForAudience(loaded.promptMd, "planner"));
            }
          }
        }
        const promptSection = newPrompts.length > 0
          ? `\n\n## Plugin workflow instructions\n${newPrompts.join("\n\n---\n\n")}`
          : "";

        const note = isLast
          ? "\n\nThis is your last search. Submit your plan now using submit_plan."
          : `\n\nYou have ${MAX_FIND_TOOLS_CALLS - findToolsCount} search(es) remaining. Search again if needed, or submit your plan.`;

        return `Found ${results.length} tool(s):\n${formatted || "(none)"}${promptSection}${note}`;
      },
    },
    submit_plan: {
      description: "Submit your final plan. Every tool step must reference a toolRef discovered via find_tools.",
      inputSchema: planSchema,
      execute: async (args: z.infer<typeof planSchema>) => {
        // Validate every tool step references a discovered tool
        const invalidSteps: string[] = [];
        for (const step of args.steps) {
          if (step.type === "tool") {
            if (!step.tool) {
              invalidSteps.push(`${step.id}: missing tool reference`);
            } else if (!discoveredTools.has(step.tool)) {
              invalidSteps.push(`${step.id}: tool "${step.tool}" was not found via find_tools`);
            }
          }
        }

        if (invalidSteps.length > 0) {
          return `Plan rejected — invalid tool references:\n${invalidSteps.join("\n")}\n\nUse find_tools to discover valid tool references, then resubmit.`;
        }

        submittedPlan = args.steps as PlanStep[];
        return "Plan accepted.";
      },
    },
  };

  let prompt = `User request: ${request}`;

  if (pluginPrompts && pluginPrompts.length > 0) {
    prompt += `\n\n## Plugin workflow instructions\n\n${pluginPrompts.join("\n\n---\n\n")}`;
  }

  await generateText({
    model: active.model,
    system: PLANNER_SYSTEM,
    tools,
    prompt,
    stopWhen: stepCountIs(MAX_PLANNER_STEPS),
  });

  if (!submittedPlan) {
    throw new Error("Planner did not submit a plan");
  }

  const steps: PlanStep[] = submittedPlan;
  const stepSummaries = steps.map((s) => `${s.id}: ${s.type}${s.tool ? ` [${s.tool}]` : ""} — ${s.description}`);
  log.info(`Plan generated: ${steps.length} step(s)`, { steps: steps.map((s) => s.description) });
  log.dev.debug("Plan details", { steps: stepSummaries, plan: steps, discoveredTools: discoveredTools.size });

  return { steps, discoveredTools };
}

export interface StepOutcome {
  id: string;
  description: string;
  status: "complete" | "skipped" | "error";
  result?: unknown;
  error?: string;
}

/**
 * Format discovered tools as a mini-catalog for the replanner.
 */
function formatDiscoveredTools(discoveredTools: Map<string, ToolSearchResult>): string {
  if (discoveredTools.size === 0) return "";

  const lines: string[] = [];
  for (const [, tool] of discoveredTools) {
    const params = tool.paramSummary.length > 0 ? ` [${tool.paramSummary.join(", ")}]` : "";
    lines.push(`- ${tool.toolRef}: ${tool.description}${params}`);
  }
  return lines.join("\n");
}

/**
 * Re-plan remaining steps after a step was skipped or errored.
 * Uses the planner role model to generate a revised set of steps.
 */
export async function replanRemainingSteps(
  request: string,
  discoveredTools: Map<string, ToolSearchResult>,
  completedSteps: StepOutcome[],
  remainingSteps: PlanStep[],
  triggerStep: StepOutcome,
  pluginPrompts?: string[],
): Promise<PlanStep[]> {
  const active = getProviderForRole("planner");
  if (!active) {
    throw new Error("No active model configured");
  }

  const toolCatalog = formatDiscoveredTools(discoveredTools);

  let prompt = `## Original Request\n${request}\n\n`;
  prompt += `## Available Tools\n${toolCatalog}\n\n`;

  if (pluginPrompts && pluginPrompts.length > 0) {
    prompt += `## Plugin workflow instructions\n\n${pluginPrompts.join("\n\n---\n\n")}\n\n`;
  }

  prompt += `## Completed Steps\n`;
  for (const s of completedSteps) {
    const maxResultLen = s.status === "error" ? 2000 : 500;
    const resultStr = s.result != null ? JSON.stringify(s.result).slice(0, maxResultLen) : "(no output)";
    prompt += `- ${s.id} [${s.status}]: ${s.description}\n  Result: ${resultStr}\n`;
  }

  prompt += `\n## Trigger Event\n`;
  prompt += `Step ${triggerStep.id} [${triggerStep.status}]: ${triggerStep.description}\n`;
  if (triggerStep.error) {
    prompt += `Error: ${triggerStep.error}\n`;
  }
  if (triggerStep.result != null) {
    prompt += `Result: ${JSON.stringify(triggerStep.result).slice(0, 2000)}\n`;
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
