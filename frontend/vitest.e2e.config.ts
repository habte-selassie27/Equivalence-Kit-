import { defineConfig } from "vitest/config";

/**
 * End-to-end tests run in Node (they drive a real browser) and need a built site.
 *
 * Run with: npm run test:e2e
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
