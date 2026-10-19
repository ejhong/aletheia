import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse as parseYaml, stringify } from "yaml";

/**
 * Opening a case: the operator writes the ledger and editions/new.yaml (with assessments/new.yaml), and the stamp
 * makes the case's first edition — no predecessor, the question stated, the history begun. Run through the CLI in a
 * scratch root, as the operator runs it.
 */

const repo = process.cwd();
let root: string;
const caseDir = () => path.join(root, "content", "cases", "opening-test");
const write = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(path.join(caseDir(), file)), { recursive: true });
  fs.writeFileSync(path.join(caseDir(), file), typeof value === "string" ? value : stringify(value));
};
const run = (...args: string[]) =>
  execFileSync(process.execPath, [path.join(repo, "scripts", "site.ts"), ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, OPERATOR_MODEL: "claude-opus-5-5", OPERATOR_PROMPT_VERSION: "charter@test", SESSION_RUN_ID: "session-test" },
    stdio: ["ignore", "pipe", "pipe"],
  });

const origin = { ref: "test", extractedBy: "test", runId: "session-test", date: "2099-01-01" };

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-open-"));
  fs.cpSync(path.join(repo, "config"), path.join(root, "config"), { recursive: true });
  write("case.yaml", {
    id: "OPN-001",
    slug: "opening-test",
    title: "An opening",
    subtitle: "Does a case open with its first edition stamped by the engine?",
    domain: "Test",
    status: "active",
    summary: "A case written to be opened.",
    themes: { main: "Main" },
    editors: ["test"],
    lastReviewed: "2099-01-01",
  });
  write("sources.yaml", [{ id: "SRC-OPN-A", title: "A source", sourceType: "webpage", url: "https://example.org/a", verification: "ai_verified" }]);
  write("claims.yaml", [
    {
      id: "OPN-C001",
      statement: "The source states the thing this case is about.",
      theme: "main",
      rung: "observation",
      reviewState: "ai_extracted",
      sourceAnchor: { locator: "the page", quote: "the thing", sourceId: "SRC-OPN-A" },
      origin,
    },
  ]);
  write("evidence.yaml", [
    {
      id: "OPN-E001",
      title: "The source states it",
      claimIds: ["OPN-C001"],
      sourceId: "SRC-OPN-A",
      direction: "supports",
      strength: "moderate",
      sourceStatement: '"the thing this case is about"',
      reviewState: "ai_extracted",
      origin,
    },
  ]);
  write("research.yaml", []);
  write("history.yaml", [{ date: "2099-01-01", change: "Ledger written.", reason: "To be opened.", actor: "test", aiAssisted: true }]);
  write("editions/new.yaml", {
    rationale: "The case opens: its question, its accounts and the one claim it rests on.",
    question: "Does the source say the thing?",
    accounts: ["It does, as the record shows.", "It does not, read another way."],
    featuredClaimIds: ["OPN-C001"],
    article: "The source says the thing [it says]{claim=OPN-C001}, and this edition is the first telling of it.",
  });
  const treatment = {
    plainLanguage: "The source says it in so many words.",
    importance: "headline",
    diagnosticity: "moderate",
    diagnosticitySummary: "It favours the first account.",
    strongestObjection: "One source.",
    whatWouldChangeOurMind: ["A second reading of the page."],
  };
  write("assessments/new.yaml", {
    caseAssessment: {
      verdict: "provisionally_supported",
      loadBearing: ["OPN-C001"],
      weakestLinks: ["OPN-C001"],
      synthesis: "One source states the thing directly; nothing in the ledger contradicts it, and nothing independent corroborates it yet, so the judgment leans and no more.",
      steelman: "The strongest argument the other way is that a single page can be misread and has not been read twice.",
    },
    claimAssessments: [{ claimId: "OPN-C001", verdict: "provisionally_supported", reasoning: "Stated by the source.", confidence: "moderate", treatment }],
  });
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("opening a case", () => {
  it("stamps the first edition with no predecessor, and the case loads", () => {
    const out = run("stamp", "opening-test");
    expect(out).toMatch(/edition-/);
    const editions = fs.readdirSync(path.join(caseDir(), "editions"));
    expect(editions).toHaveLength(1);
    const edition = parseYaml(fs.readFileSync(path.join(caseDir(), "editions", editions[0]), "utf8"));
    expect(edition.previous).toBeNull();
    expect(edition.question).toBe("Does the source say the thing?");
    expect(edition.assessment.runId).toMatch(/-operator-/);
    expect(edition.rationale).toMatch(/the case's first edition/);
    expect(fs.existsSync(path.join(caseDir(), "editions", "new.yaml"))).toBe(false);
    const history = parseYaml(fs.readFileSync(path.join(caseDir(), "history.yaml"), "utf8"));
    expect(history.at(-1).change).toMatch(/^Opened the case/);
    // Loaded again under every rule, an edition now required.
    expect(JSON.parse(run("status", "--json")).cases.map((c: { slug: string }) => c.slug)).toContain("opening-test");
  });
});
