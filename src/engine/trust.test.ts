import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml, stringify } from "yaml";
import { guardSession } from "./operator.ts";
import { quoteCheck } from "./quotecheck.ts";
import { isFounderFile, reviewPacket, runReview } from "./review.ts";

/**
 * The trust boundary (review of #463, 2026-10-19: all four reviewers held the rebuild because its gate ran the code
 * of the change it judged, with the keys present). A change is data to the gate: the review and the quote check read
 * it through git at the commit under review and run none of it; a change to the gate's own files, the instructions
 * or the configuration is held for the founder; an operator session's work is checked by main's code before any of
 * it is published; and the workflows give no code a session wrote a key it does not already hold.
 */

const git = (root: string, ...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** A repository whose `main` holds `base` and whose `pr` branch adds `head` on top; the working tree is left at main. */
function repo(base: Record<string, string>, head: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trust-"));
  const write = (files: Record<string, string>) => {
    for (const [f, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      fs.writeFileSync(path.join(root, f), text);
    }
  };
  git(root, "init", "-q", "-b", "main");
  write(base);
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  git(root, "checkout", "-q", "-b", "pr");
  write(head);
  git(root, "add", ".");
  git(root, "commit", "-qm", "head");
  git(root, "checkout", "-q", "main");
  return root;
}

const caseFiles = (claims: object[], evidence: object[] = []) => ({
  "content/cases/x/case.yaml": stringify({ title: "Case X", subtitle: "q" }),
  "content/cases/x/claims.yaml": stringify(claims),
  "content/cases/x/evidence.yaml": stringify(evidence),
  "content/cases/x/sources.yaml": stringify([{ id: "SRC-A", title: "A", url: "https://example.test/a", sourceType: "report" }]),
});

describe("the review reads the change through git", () => {
  it("builds its packet from the commit under review, whatever the working tree holds", () => {
    const root = repo(caseFiles([{ id: "X-C001", statement: "The base's claim." }]), caseFiles([{ id: "X-C001", statement: "The base's claim." }, { id: "X-C002", statement: "A claim only the change holds." }]));
    const { packet, files } = reviewPacket({ root, base: "main", head: "pr", title: "t", body: "" });
    expect(files.map((f) => f.file)).toEqual(["content/cases/x/claims.yaml"]);
    expect(packet).toMatch(/A claim only the change holds/);
    // The working tree is main's: the packet came from git.
    expect(fs.readFileSync(path.join(root, "content/cases/x/claims.yaml"), "utf8")).not.toMatch(/only the change holds/);
  });

  it("holds a change to a founder's file without asking any reviewer", async () => {
    const root = repo({ "config/models.yaml": "review: {seats: [a, b, c]}\n" }, { "config/models.yaml": "review: {seats: [a]}\n" });
    const r = await runReview({
      root,
      base: "main",
      head: "pr",
      title: "t",
      body: "",
      siteName: "s",
      call: async () => {
        throw new Error("no reviewer may be asked");
      },
    });
    expect(r.tally.outcome).toBe("hold");
    expect(r.tally.harms).toEqual([expect.objectContaining({ kind: "founder_files", where: "config/models.yaml" })]);
    expect(r.commit).toBe(git(root, "rev-parse", "pr").trim());
  });

  it("names the founder's files: the constitution, the kill switch, the configuration, the instructions and the gate", () => {
    for (const f of ["AGENTS.md", "CLAUDE.md", "governance/operation.yaml", "config/budget.yaml", "config/models.yaml", ".github/workflows/review.yml", "protocols/review-v1.md", "operator/charter.md", "src/engine/review.ts", "src/engine/quotecheck.ts", "src/engine/operator.ts"]) {
      expect(isFounderFile(f), f).toBe(true);
    }
    for (const f of ["content/cases/x/claims.yaml", "runs/r/log.md", "src/engine/read.ts", "app/page.tsx", "docs/DESIGN.md", "governance/reviews/pr-1.yaml"]) {
      expect(isFounderFile(f), f).toBe(false);
    }
  });
});

describe("the quote check reads the change through git", () => {
  it("finds a fabricated quotation in the commit under review, with the working tree at main", async () => {
    const root = repo(caseFiles([]), caseFiles([], [{ id: "X-E001", sourceId: "SRC-A", sourceStatement: 'The source says "a sentence the source never contains".', reviewState: "ai_extracted" }]));
    const r = await quoteCheck({ base: "main", head: "pr", root, read: async () => ({ text: "The source says something else entirely." }), resolve: async () => [] });
    expect(r.failures.map((f) => f.record)).toEqual(["X-E001"]);
  });
});

describe("the session guard", () => {
  const read = (files: Record<string, object>) => (f: string) => (files[f] ? stringify(files[f]) : null);
  it("refuses what only the founder or the engine writes", () => {
    const problems = guardSession(
      [
        { status: "M", file: "AGENTS.md" },
        { status: "M", file: "config/budget.yaml" },
        { status: "M", file: "protocols/check-v2.md" },
        { status: "M", file: ".github/workflows/operator.yml" },
        { status: "A", file: "governance/spend/r.yaml" },
        { status: "A", file: "governance/reviews/pr-9.yaml" },
        { status: "A", file: "content/cases/x/assessments/2099-01-01-check-gpt.yaml" },
        { status: "A", file: "content/cases/x/assessments/2099-01-01-operator-000000.yaml" },
        { status: "M", file: "content/cases/x/editions/edition-2099-01-01-000000.yaml" },
        { status: "A", file: "runs/another-run/log.md" },
        { status: "A", file: "runs/this-run/run.yaml" },
        { status: "A", file: "runs/this-run/trace.yaml" },
      ],
      read({
        "content/cases/x/assessments/2099-01-01-check-gpt.yaml": { role: "check" },
        "content/cases/x/assessments/2099-01-01-operator-000000.yaml": { role: "draft", humanReviewed: true },
      }),
      "this-run",
    );
    expect(problems).toHaveLength(12);
  });
  it("lets the session's own work through", () => {
    const problems = guardSession(
      [
        { status: "M", file: "content/cases/x/claims.yaml" },
        { status: "M", file: "content/cases/x/history.yaml" },
        { status: "A", file: "content/cases/x/assessments/2099-01-01-operator-000000.yaml" },
        { status: "A", file: "content/cases/x/editions/edition-2099-01-01-000000.yaml" },
        { status: "A", file: "runs/this-run/log.md" },
        { status: "M", file: "src/engine/read.ts" },
      ],
      read({ "content/cases/x/assessments/2099-01-01-operator-000000.yaml": { role: "draft", humanReviewed: false } }),
      "this-run",
    );
    expect(problems).toEqual([]);
  });
});

// ------------------------------------------------------------------ the workflows

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string>; "working-directory"?: string };
type Job = { permissions?: Record<string, string>; steps: Step[] };
const workflow = (name: string) => parseYaml(fs.readFileSync(path.join(process.cwd(), ".github", "workflows", name), "utf8")) as { on: Record<string, unknown>; jobs: Record<string, Job> };
const secretsIn = (x: unknown) => [...JSON.stringify(x).matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);

describe("the workflows hold the boundary", () => {
  it("the review runs main's code and never checks the change out", () => {
    const w = workflow("review.yml");
    expect(Object.keys(w.on)).toEqual(["pull_request_target"]);
    const steps = w.jobs.review.steps;
    const checkouts = steps.filter((s) => s.uses?.startsWith("actions/checkout"));
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0].with).toMatchObject({ ref: "${{ github.event.pull_request.base.ref }}", "persist-credentials": false });
    for (const s of steps) expect(s.run ?? "", s.name).not.toMatch(/git (checkout|switch|worktree)|pull_request\.head\.(sha|ref)/);
    expect(steps.find((s) => s.name?.startsWith("The change"))?.run).toMatch(/fetch .*refs\/remotes\/pr\/head/);
    expect(steps.find((s) => s.name?.startsWith("Every quoted passage"))?.run).toMatch(/check-quotes .*--head refs\/remotes\/pr\/head/);
    // The quote check's hold is written by main's code with its machine record, so the planner answers it (2026-10-28).
    expect(steps.find((s) => s.name?.startsWith("Every quoted passage"))?.run).toMatch(/check-quotes .*--hold-comment review\.md/);
    for (const s of steps) expect(s.run ?? "", s.name).not.toMatch(/echo .*site-review/);
    expect(steps.find((s) => s.name === "The reviewers read the change")?.run).toMatch(/review .*--head refs\/remotes\/pr\/head/);
  });

  it("the session holds the operator's key and a token that can only read", () => {
    const w = workflow("operator.yml");
    for (const job of Object.values(w.jobs)) for (const s of job.steps.filter((x) => x.uses?.startsWith("actions/checkout"))) expect(s.with?.["persist-credentials"]).toBe(false);
    expect(w.jobs.session.permissions).toEqual({ contents: "read" });
    expect(secretsIn(w.jobs.session)).toEqual(["ANTHROPIC_API_KEY"]);
    // The instructions and the first message come from main, written before the session.
    expect(JSON.stringify(w.jobs.plan)).toMatch(/operator\/charter\.md/);
    expect(JSON.stringify(w.jobs.session)).not.toMatch(/operator\/charter\.md|scripts\/site\.ts" kickoff|site\.ts "\$\{args/);
  });

  it("after the session, only main's code runs, and each key is in the one step that needs it", () => {
    const publish = workflow("operator.yml").jobs.publish;
    for (const s of publish.steps) {
      expect(s.run ?? "", s.name).not.toMatch(/(^|[^/])scripts\/site\.ts/);
      if (/\bnpm\b|\bnpx\b/.test(s.run ?? "")) expect(s["working-directory"], s.name).toBe("trusted");
    }
    for (const s of publish.steps.filter((x) => /site\.ts/.test(x.run ?? ""))) expect(s.run, s.name).toMatch(/node \.\.\/trusted\/scripts\/site\.ts/);
    const withSecret = (k: string) => publish.steps.filter((s) => secretsIn(s).includes(k)).map((s) => s.name);
    expect(withSecret("MAINTENANCE_PAT")).toEqual(["The pull request"]);
    for (const k of ["OPENAI_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY", "VENICE_API_KEY", "ANTHROPIC_API_KEY"]) expect(withSecret(k), k).toEqual(["The panel, when the session asks for it"]);
    expect(publish.steps.find((s) => s.name === "The session's work, checked by main's code")?.run).toMatch(/guard-session/);
  });

  it("the session's trace never leaves its machine: main's script digests it there, and main's code checks the digest", () => {
    const w = workflow("operator.yml");
    const session = w.jobs.session.steps;
    const run = session.find((s) => s.name === "The session")?.run ?? "";
    expect(run).toMatch(/--output-format stream-json --verbose/);
    expect(run).toMatch(/> "\$T\/trace\.jsonl"/);
    // Nothing uploaded holds it: the trace is written outside session/, and no upload takes the whole of the machine's temp.
    for (const job of Object.values(w.jobs)) {
      for (const s of job.steps.filter((x) => x.uses?.startsWith("actions/upload-artifact"))) expect(String(s.with?.path), job === w.jobs.plan ? "plan" : "session").not.toMatch(/trace\.jsonl|runner\.temp \}\}\/?$/);
    }
    // The script is main's, copied into the plan before the session; the session's machine runs that copy, not its tree's.
    expect(w.jobs.plan.steps.find((s) => s.name === "What this session is for")?.run).toMatch(/cp src\/engine\/trace\.ts plan\/trace\/src\/engine\//);
    expect(session.find((s) => s.name === "What the session did, as a digest")?.run).toMatch(/node "\$T\/plan\/trace\/scripts\/session-trace\.ts" "\$T\/trace\.jsonl" "\$T\/session\/digest\.json"/);
    expect(w.jobs.publish.steps.find((s) => s.name === "What the session did, from its trace")?.run).toMatch(/node \.\.\/trusted\/scripts\/site\.ts session-trace --digest \.\.\/session\/digest\.json/);
    // The script the plan copies imports nothing of the engine but the digest itself, so the copy runs alone.
    const imports = (f: string) => [...fs.readFileSync(path.join(process.cwd(), f), "utf8").matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports("scripts/session-trace.ts").filter((m) => !m.startsWith("node:"))).toEqual(["../src/engine/trace.ts"]);
    expect(imports("src/engine/trace.ts")).toEqual([]);
  });
});
