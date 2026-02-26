import { pipeline } from "@xenova/transformers";
import { createLogger } from "../logger/index.js";
import { getLoadedPlugins } from "./loader.js";
import type { PluginRegistryEntry } from "./registry.js";

type Embedder = Awaited<ReturnType<typeof pipeline>>;

const log = createLogger("tool-registry");

export interface ToolSearchResult {
  toolRef: string;         // "obsidian:obsidian/search_for_snippet"
  pluginId: string;
  functionName: string;
  description: string;
  category: string;
  paramSummary: string[];
}

interface EmbeddedEntry {
  toolRef: string;
  pluginId: string;
  functionName: string;
  description: string;
  category: string;
  paramSummary: string[];
  embedding: Float32Array;
}

/** Cosine similarity between two vectors. */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class ToolRegistry {
  private embedder: Embedder | null = null;
  private entries: EmbeddedEntry[] = [];
  private initPromise: Promise<void> | null = null;

  /** Load the embedding model. Call once at startup. */
  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      log.info("Loading embedding model...");
      this.embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      log.info("Embedding model loaded");
    })();

    return this.initPromise;
  }

  /** Embed a single text string. Returns a normalized Float32Array. */
  private async embed(text: string): Promise<Float32Array> {
    if (!this.embedder) throw new Error("ToolRegistry not initialized — call initialize() first");

    // The feature-extraction pipeline returns a Tensor with { data: Float32Array }
    const output = await (this.embedder as (text: string, opts: Record<string, unknown>) => Promise<{ data: Float32Array }>)(
      text,
      { pooling: "mean", normalize: true },
    );
    return output.data;
  }

  /**
   * Re-index all registered plugins. Call after rebuildRegistry().
   * Reads from the passed registry entries (the existing in-memory registry).
   */
  async rebuild(registryEntries: PluginRegistryEntry[]): Promise<void> {
    if (!this.embedder) {
      await this.initialize();
    }

    const loadedPlugins = getLoadedPlugins();
    const newEntries: EmbeddedEntry[] = [];

    for (const entry of registryEntries) {
      const loaded = loadedPlugins.get(entry.pluginId);
      const pluginName = loaded?.manifest.name ?? entry.pluginId;

      // Find the module ref for this function
      let moduleRef = `${entry.pluginId}:${entry.pluginId}`;
      if (loaded?.manifest.modules) {
        for (const mod of loaded.manifest.modules) {
          if (mod.functions.includes(entry.functionName)) {
            moduleRef = `${entry.pluginId}:${mod.id}`;
            break;
          }
        }
      }

      const toolRef = `${moduleRef}/${entry.functionName}`;

      // Build embedding text from semantic fields
      const embeddingText = [
        pluginName,
        entry.functionName.replace(/_/g, " "),
        entry.description,
        entry.category,
        ...entry.paramSummary.map((p) => p.split(" — ")[0] ?? p),
      ].join(" ");

      const embedding = await this.embed(embeddingText);

      newEntries.push({
        toolRef,
        pluginId: entry.pluginId,
        functionName: entry.functionName,
        description: entry.description,
        category: entry.category,
        paramSummary: entry.paramSummary,
        embedding,
      });
    }

    this.entries = newEntries;
    log.dev.debug(`Tool registry rebuilt: ${newEntries.length} embedded entries`);
  }

  /** Semantic search for tools matching a natural-language query. */
  async search(query: string, maxResults = 8): Promise<ToolSearchResult[]> {
    if (this.entries.length === 0) return [];

    const queryEmbedding = await this.embed(query);

    const scored = this.entries.map((entry) => ({
      entry,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    // Filter out low-relevance results and sort by score
    const RELEVANCE_THRESHOLD = 0.25;
    return scored
      .filter((s) => s.score > RELEVANCE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((s) => ({
        toolRef: s.entry.toolRef,
        pluginId: s.entry.pluginId,
        functionName: s.entry.functionName,
        description: s.entry.description,
        category: s.entry.category,
        paramSummary: s.entry.paramSummary,
      }));
  }

  /** Number of indexed entries. */
  get size(): number {
    return this.entries.length;
  }
}

/** Singleton instance. */
export const toolRegistry = new ToolRegistry();
