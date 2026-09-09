import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pin the project root to this directory. Without this, vitest walks up
// past the package (e.g. out of a linked git worktree) and resolves paths —
// including process.cwd() for the content loader — against the wrong tree.
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  test: {
    dir: root,
    include: ["src/**/*.test.ts"],
    // The real-content tests load every case, and a single test that assembles
    // editions on that content ran 5.9 s on the CI runner (#238, 2026-09-09) —
    // past vitest's 5 s default, so a green change failed CI and auto-merge
    // waited on a re-run. Twenty seconds is headroom for the runner, not for
    // slower code: a test that needs it is still worth asking about.
    testTimeout: 20_000,
  },
});
