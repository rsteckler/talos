import type { CatalogModel } from "@talos/shared/types";
import type { schema } from "../db/index.js";

type ProviderRow = typeof schema.providers.$inferSelect;

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
};

const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOpenAI(baseUrl: string, apiKey: string): Promise<CatalogModel[]> {
  const res = await fetchWithTimeout(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { data: { id: string }[] };
  return json.data.map((m) => ({ modelId: m.id, displayName: m.id }));
}

async function fetchAnthropic(baseUrl: string, apiKey: string): Promise<CatalogModel[]> {
  const models: CatalogModel[] = [];
  let afterId: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = new URL(`${baseUrl}/models`);
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);

    const res = await fetchWithTimeout(url.toString(), {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`);

    const json = (await res.json()) as {
      data: { id: string; display_name: string }[];
      has_more: boolean;
      last_id?: string;
    };

    for (const m of json.data) {
      models.push({ modelId: m.id, displayName: m.display_name });
    }

    if (!json.has_more || !json.last_id) break;
    afterId = json.last_id;
  }

  return models;
}

async function fetchGoogle(baseUrl: string, apiKey: string): Promise<CatalogModel[]> {
  const res = await fetchWithTimeout(`${baseUrl}/models?key=${apiKey}`, {});
  if (!res.ok) throw new Error(`Google API error: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    models: {
      name: string;
      displayName: string;
      supportedGenerationMethods?: string[];
    }[];
  };
  return json.models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => ({
      modelId: m.name.replace(/^models\//, ""),
      displayName: m.displayName,
    }));
}

async function fetchOpenRouter(baseUrl: string, apiKey: string): Promise<CatalogModel[]> {
  const res = await fetchWithTimeout(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenRouter API error: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { data: { id: string; name: string }[] };
  return json.data.map((m) => ({ modelId: m.id, displayName: m.name }));
}

export async function fetchModelCatalog(provider: ProviderRow): Promise<CatalogModel[]> {
  const baseUrl = provider.baseUrl || DEFAULT_BASE_URLS[provider.type] || "";
  const apiKey = provider.apiKey;

  let models: CatalogModel[];
  switch (provider.type) {
    case "openai":
      models = await fetchOpenAI(baseUrl, apiKey);
      break;
    case "anthropic":
      models = await fetchAnthropic(baseUrl, apiKey);
      break;
    case "google":
      models = await fetchGoogle(baseUrl, apiKey);
      break;
    case "openrouter":
      models = await fetchOpenRouter(baseUrl, apiKey);
      break;
    default:
      throw new Error(`Unsupported provider type: ${provider.type}`);
  }

  models.sort((a, b) => a.modelId.localeCompare(b.modelId));
  return models;
}
