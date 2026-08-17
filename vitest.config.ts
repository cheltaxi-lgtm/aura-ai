import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/invariants/**/*.{test,spec}.ts"],
    setupFiles: ["tests/invariants/db/setup-env.ts"],
    reporters: ["default", "json"],
    outputFile: {
      json: "tests/invariants/.vitest-report.json",
    },
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // DB suites share one pool + migrate mutex; avoid parallel bootstrap races.
    // NOTE: isolate:false is NOT an option — unit files vi.mock("@/lib/db")
    // while integration files need the real module; a shared registry breaks
    // the mocks (session-fk-guard hits the real DB).
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
