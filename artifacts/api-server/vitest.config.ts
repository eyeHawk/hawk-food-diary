import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Run tests sequentially to avoid port/state conflicts
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
  resolve: {
    // Allow vitest to resolve TypeScript path aliases used in source files
    conditions: ["node"],
  },
});
