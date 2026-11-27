import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Databases start in containers: the first pull can take a while.
    hookTimeout: 180_000,
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The entries only hand @actions/core or the process to `run` and `cli`, which the tests call.
      exclude: ["src/index.ts", "src/bin.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
