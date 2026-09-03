import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Node by default: the logic suites need no DOM, and spinning up jsdom for
    // every worker exceeds Vitest's fixed 60s worker-start timeout on Windows.
    // Component tests opt in with a `@vitest-environment jsdom` docblock.
    environment: "node",
    globals: true,
    // isolate must stay on: sharing the module graph across files breaks
    // per-file vi.mock, and the read tests silently lose their client mock.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20000,
  },
});
