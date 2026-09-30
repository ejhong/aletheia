import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The content is read once only where a process has said it cannot change
 * (the site's build). Everywhere else every read is fresh — the pipeline
 * writes content and reads it back in one process, and a held copy there
 * would be a stale ledger judged as current. So the default is what the
 * tests pin first.
 */
describe("reading the content once", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is off by default: every call is a fresh read, and nothing is frozen", async () => {
    vi.stubEnv("ALETHEIA_CONTENT_FROZEN", "");
    vi.resetModules();
    const { contentFrozen, readOnce } = await import("./frozen.ts");
    expect(contentFrozen()).toBe(false);
    let reads = 0;
    const load = () => ({ n: ++reads, list: [1, 2] });
    expect(readOnce("k", load).n).toBe(1);
    const second = readOnce("k", load);
    expect(second.n).toBe(2);
    second.list.push(3); // a fresh value is the caller's own
    expect(second.list).toEqual([1, 2, 3]);
  });

  it("the test run itself is not frozen, so the loader it exercises reads the files each time", async () => {
    const { contentFrozen } = await import("./frozen.ts");
    expect(contentFrozen()).toBe(false);
  });

  it("when the process says the content is frozen, each key is read once and what is held cannot be altered", async () => {
    vi.stubEnv("ALETHEIA_CONTENT_FROZEN", "1");
    vi.resetModules();
    const { contentFrozen, readOnce } = await import("./frozen.ts");
    expect(contentFrozen()).toBe(true);
    let reads = 0;
    const load = () => ({ n: ++reads, cases: [{ id: "X-002", claims: [{ id: "X-C001" }] }, { id: "X-001", claims: [] as { id: string }[] }] });
    const first = readOnce("cases", load);
    expect(readOnce("cases", load)).toBe(first);
    expect(reads).toBe(1);
    // Another key is another read.
    expect(readOnce("arbiter", load).n).toBe(2);
    // A page that altered a loaded record would alter it for every page after it: frozen, it fails instead.
    expect(() => first.cases.push({ id: "X-003", claims: [] })).toThrow(TypeError);
    expect(() => { first.cases[0].claims[0].id = "changed"; }).toThrow(TypeError);
    expect(() => first.cases.sort((a, b) => a.id.localeCompare(b.id))).toThrow(TypeError);
    expect(first.cases.map((c) => c.id)).toEqual(["X-002", "X-001"]);
    // Sorting a copy is what a page does instead.
    expect([...first.cases].sort((a, b) => a.id.localeCompare(b.id)).map((c) => c.id)).toEqual(["X-001", "X-002"]);
  });

  it("only the site's build asks for it", async () => {
    const fs = await import("node:fs");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toBe("ALETHEIA_CONTENT_FROZEN=1 next build");
    for (const [name, script] of Object.entries(pkg.scripts)) if (name !== "build") expect(script, name).not.toContain("ALETHEIA_CONTENT_FROZEN");
    // No workflow and no pipeline script sets it for a verb.
    for (const dir of [".github/workflows", "scripts", "src/pipeline"]) {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        if (f.isFile()) expect(fs.readFileSync(`${dir}/${f.name}`, "utf8"), `${dir}/${f.name}`).not.toContain("ALETHEIA_CONTENT_FROZEN");
      }
    }
  });
});
