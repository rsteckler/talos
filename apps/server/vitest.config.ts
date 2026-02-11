import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/api/**/*.ts", "src/agent/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "html"],
    },
    // Tests that share an in-memory DB must run sequentially within a file,
    // but separate test files can run in parallel since each creates its own DB.
    fileParallelism: true,
  },
});
