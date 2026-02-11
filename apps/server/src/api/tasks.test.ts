import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, createTestApp } from "../test/setup.js";

const mockDb = { db: null as unknown, schema: null as unknown };
vi.mock("../db/index.js", () => mockDb);

// Mock the scheduler (tasks.ts imports it for scheduling)
vi.mock("../scheduler/index.js", () => ({
  scheduler: {
    scheduleTask: vi.fn(),
    rescheduleTask: vi.fn(),
    unscheduleTask: vi.fn(),
    isTaskRunning: vi.fn().mockReturnValue(false),
  },
  executeTask: vi.fn().mockResolvedValue(undefined),
}));

const { taskRouter } = await import("./tasks.js");

let request: ReturnType<typeof createTestApp>["request"];
let close: ReturnType<typeof createTestApp>["close"];

beforeEach(() => {
  const testDb = createTestDb();
  mockDb.db = testDb.db;
  mockDb.schema = testDb.schema;
  const testApp = createTestApp(taskRouter);
  request = testApp.request;
  close = testApp.close;
});

afterEach(() => {
  close();
});

function createTask(overrides?: Record<string, unknown>) {
  return request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test Task",
      trigger_type: "manual",
      trigger_config: "{}",
      action_prompt: "Do something",
      ...overrides,
    }),
  });
}

describe("GET /api/tasks", () => {
  it("returns empty array initially", async () => {
    const res = await request("/api/tasks");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});

describe("POST /api/tasks", () => {
  it("creates a task", async () => {
    const res = await createTask();
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.name).toBe("Test Task");
    expect(body.data.trigger_type).toBe("manual");
    expect(body.data.is_active).toBe(true);
  });

  it("rejects missing name", async () => {
    const res = await createTask({ name: "" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid trigger_type", async () => {
    const res = await createTask({ trigger_type: "invalid" });
    expect(res.status).toBe(400);
  });

  it("stores tools as JSON", async () => {
    const res = await createTask({ tools: ["tool-a", "tool-b"] });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.tools).toBe('["tool-a","tool-b"]');
  });
});

describe("GET /api/tasks/:id", () => {
  it("returns a task with runs", async () => {
    const createRes = await createTask();
    const task = (await createRes.json()).data;

    const res = await request(`/api/tasks/${task.id}`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.id).toBe(task.id);
    expect(body.data.runs).toEqual([]);
  });

  it("returns 404 for non-existent task", async () => {
    const res = await request("/api/tasks/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/tasks/:id", () => {
  it("updates a task", async () => {
    const createRes = await createTask();
    const task = (await createRes.json()).data;

    const res = await request(`/api/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Task" }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.name).toBe("Updated Task");
  });

  it("returns 404 for non-existent task", async () => {
    const res = await request("/api/tasks/nonexistent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("deletes a task", async () => {
    const createRes = await createTask();
    const task = (await createRes.json()).data;

    const res = await request(`/api/tasks/${task.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    // Verify it's gone
    const getRes = await request(`/api/tasks/${task.id}`);
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for non-existent task", async () => {
    const res = await request("/api/tasks/nonexistent", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/tasks/:id/run", () => {
  it("triggers a manual task run", async () => {
    const createRes = await createTask();
    const task = (await createRes.json()).data;

    const res = await request(`/api/tasks/${task.id}/run`, { method: "POST" });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.message).toBe("Task execution started");
  });

  it("returns 404 for non-existent task", async () => {
    const res = await request("/api/tasks/nonexistent/run", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/tasks/:id/runs", () => {
  it("returns empty runs for a task with no history", async () => {
    const createRes = await createTask();
    const task = (await createRes.json()).data;

    const res = await request(`/api/tasks/${task.id}/runs`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("returns 404 for non-existent task", async () => {
    const res = await request("/api/tasks/nonexistent/runs");
    expect(res.status).toBe(404);
  });
});
