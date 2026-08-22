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
  },
});
