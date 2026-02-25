/**
 * Parse a combined tool reference like "obsidian:obsidian/search_for_snippet"
 * into its constituent parts.
 */
export function parseToolRef(tool: string): { module: string; pluginId: string; toolName: string } {
  const slashIdx = tool.indexOf("/");
  if (slashIdx === -1) throw new Error(`Invalid tool reference "${tool}" — expected "module/function" format`);
  const module = tool.slice(0, slashIdx);
  const toolName = tool.slice(slashIdx + 1);
  const pluginId = module.split(":")[0]!;
  return { module, pluginId, toolName };
}
