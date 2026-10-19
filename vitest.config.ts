import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Pin the project root to this directory. Without this, vitest walks up
// past the package (e.g. out of a linked git worktree) and resolves paths —
// including process.cwd() for the content loader — against the wrong tree.
const root = fileURLToPath(new URL(".", import.meta.url));

// Tests that use this engine's first site's own cases as fixtures run where
// those cases are. A second site running the engine (its code pulled
// unchanged, docs/DESIGN.md) has other cases; the engine's logic is tested
// where the fixtures live, and every site's own content is tested by its
// loader and its build. The probe is a case directory, never the site's
// name, which the second site's sync rewrites.
const FIXTURE_CASE = path.join(root, "content", "cases", "geopolymer");
const CONTENT_FIXTURE_TESTS = [
  "src/domain/activity.test.ts",
  "src/domain/evidenceTombstones.test.ts",
  "src/domain/intake.test.ts",
  "src/domain/load.test.ts",
  "src/domain/operations.test.ts",
  "src/domain/panel.test.ts",
  "src/domain/record.test.ts",
  "src/domain/recordLinks.test.ts",
  "src/domain/resources.test.ts",
  "src/domain/view.test.ts",
  "src/engine/check.test.ts",
];

export default defineConfig({
  root,
  test: {
    dir: root,
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ...(fs.existsSync(FIXTURE_CASE) ? [] : CONTENT_FIXTURE_TESTS)],
    // The real-content tests load every case, and a single test that assembles
    // editions on that content ran 5.9 s on the CI runner (#238, 2026-09-09) —
    // past vitest's 5 s default, so a green change failed CI and auto-merge
    // waited on a re-run. Twenty seconds is headroom for the runner, not for
    // slower code: a test that needs it is still worth asking about.
    testTimeout: 20_000,
  },
});
