import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["apps/server/src/**/*.test.ts", "plugins/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "apps/server/src/api/**/*.ts",
        "apps/server/src/agent/**/*.ts",
        "plugins/**/index.ts",
      ],
      exclude: ["**/*.test.ts"],
      reportsDirectory: "./coverage",
      reporter: ["text", "html"],
    },
    // Tests that share an in-memory DB must run sequentially within a file,
    // but separate test files can run in parallel since each creates its own DB.
    fileParallelism: true,
  },
  root: "../..",
});
