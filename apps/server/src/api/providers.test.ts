import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, createTestApp } from "../test/setup.js";

const mockDb = { db: null as unknown, schema: null as unknown };
vi.mock("../db/index.js", () => mockDb);

// Mock the knownModels module (seedModels depends on it)
vi.mock("../providers/knownModels.js", () => ({
  KNOWN_MODELS: {
    openai: [
      { modelId: "gpt-4o", displayName: "GPT-4o" },
    ],
    anthropic: [],
    google: [],
    openrouter: [],
  } as Record<string, { modelId: string; displayName: string }[]>,
}));

// Mock catalogFetcher (used by catalog route)
vi.mock("../providers/catalogFetcher.js", () => ({
  fetchModelCatalog: vi.fn().mockResolvedValue([
    { modelId: "gpt-4o", displayName: "GPT-4o" },
  ]),
}));

const { providerRouter } = await import("./providers.js");

let request: ReturnType<typeof createTestApp>["request"];
let close: ReturnType<typeof createTestApp>["close"];

beforeEach(() => {
  const testDb = createTestDb();
  mockDb.db = testDb.db;
  mockDb.schema = testDb.schema;
  const testApp = createTestApp(providerRouter);
  request = testApp.request;
  close = testApp.close;
});

afterEach(() => {
  close();
});

function createProvider(overrides?: Record<string, unknown>) {
  return request("/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test Provider",
      type: "openai",
      apiKey: "sk-test-key-123",
      ...overrides,
    }),
  });
}

describe("GET /api/providers", () => {
  it("returns empty array initially", async () => {
    const res = await request("/api/providers");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});

describe("POST /api/providers", () => {
  it("creates a provider and seeds models", async () => {
    const res = await createProvider();
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.name).toBe("Test Provider");
    expect(body.data.type).toBe("openai");
    // API key should NOT be in the response (toProviderResponse strips it)
    expect(body.data.apiKey).toBeUndefined();

    // Check that models were seeded
    const modelsRes = await request(`/api/providers/${body.data.id}/models`);
    const modelsBody = await modelsRes.json();
    expect(modelsBody.data).toHaveLength(1);
    expect(modelsBody.data[0].modelId).toBe("gpt-4o");
  });

  it("rejects invalid type", async () => {
    const res = await createProvider({ type: "invalid" });
    expect(res.status).toBe(400);
  });

  it("rejects missing name", async () => {
    const res = await createProvider({ name: "" });
    expect(res.status).toBe(400);
  });

  it("rejects missing apiKey", async () => {
    const res = await createProvider({ apiKey: "" });
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/providers/:id", () => {
  it("updates provider name", async () => {
    const createRes = await createProvider();
    const { id } = (await createRes.json()).data;

    const res = await request(`/api/providers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.name).toBe("Updated Name");
  });

  it("returns 404 for non-existent provider", async () => {
    const res = await request("/api/providers/nonexistent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/providers/:id", () => {
  it("deletes an existing provider", async () => {
    const createRes = await createProvider();
    const { id } = (await createRes.json()).data;

    const res = await request(`/api/providers/${id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);

    // Verify it's gone
    const listRes = await request("/api/providers");
    const listBody = await listRes.json();
    expect(listBody.data).toHaveLength(0);
  });

  it("returns 404 for non-existent provider", async () => {
    const res = await request("/api/providers/nonexistent", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/providers/:id/models", () => {
  it("returns models for a provider", async () => {
    const createRes = await createProvider();
    const { id } = (await createRes.json()).data;

    const res = await request(`/api/providers/${id}/models`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it("returns 404 for non-existent provider", async () => {
    const res = await request("/api/providers/nonexistent/models");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/providers/:id/models/refresh", () => {
  it("re-seeds models for a provider", async () => {
    const createRes = await createProvider();
    const { id } = (await createRes.json()).data;

    const res = await request(`/api/providers/${id}/models/refresh`, { method: "POST" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });
});

describe("GET /api/models/active", () => {
  it("returns null when no active model", async () => {
    const res = await request("/api/models/active");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.model).toBeNull();
    expect(body.data.provider).toBeNull();
  });
});

describe("PUT /api/models/active", () => {
  it("sets a model as active by modelId", async () => {
    const createRes = await createProvider();
    const provider = (await createRes.json()).data;

    // Get the seeded model
    const modelsRes = await request(`/api/providers/${provider.id}/models`);
    const models = (await modelsRes.json()).data;
    const modelId = models[0].id;

    const res = await request("/api/models/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.model.isDefault).toBe(true);
    expect(body.data.provider.id).toBe(provider.id);
  });

  it("sets a model as active by catalog model (create-on-fly)", async () => {
    const createRes = await createProvider();
    const provider = (await createRes.json()).data;

    const res = await request("/api/models/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: provider.id,
        catalogModelId: "gpt-4o-mini",
        displayName: "GPT-4o Mini",
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.model.modelId).toBe("gpt-4o-mini");
    expect(body.data.model.isDefault).toBe(true);
  });

  it("returns 404 for non-existent model", async () => {
    const res = await request("/api/models/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });
});
