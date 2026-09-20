import { describe, expect, it } from "vitest";
import { getCaseBySlug } from "./load.ts";
import type { LoadedCase } from "./schema.ts";
import { classifyObjections, objectionsFromArbiterComment, objectionsFromReviewNote, readPr, runAnswer, type Gh } from "../pipeline/answer.ts";

/** The answer step reads a PR's standing objections, sorts them into the records they name and the edition, and puts
 *  each back to the verb that owns it; it refuses what is not its to answer. Network and models are stubbed. */

const blob = (seats: object[]) => `<!-- aletheia-arbiter -->\n## Constitutional arbiter — 🅿️ PARKED\n**2 seats find a violation**\n<!-- aletheia-arbiter-data ${JSON.stringify({ verdict: "park", commit: "abcdef1234567890", seats })} -->`;
const seats = [
  { seat: "GPT-5.6 Sol (OpenAI)", vote: "violates", rules: ["§3.2", "§3.6"], reasoning: "AMZ-E108 remains compound; AMZ-C072 combines two grounds." },
  { seat: "Grok 4.5 (xAI)", vote: "violates", rules: ["§3.8"], reasoning: "The assessment cites the wrong record for the chronology." },
  { seat: "Opus 5 (Anthropic)", vote: "complies", rules: [], reasoning: "Fine." },
];

describe("objections are read from where seats speak", () => {
  it("from the arbiter's machine blob: every seat that found a violation, with its rules and where it was raised", () => {
    const o = objectionsFromArbiterComment(blob(seats));
    expect(o.map((x) => x.seat)).toEqual(["GPT-5.6 Sol (OpenAI)", "Grok 4.5 (xAI)"]);
    expect(o[0]).toMatchObject({ rules: ["§3.2", "§3.6"], text: "AMZ-E108 remains compound; AMZ-C072 combines two grounds.", source: "panel verdict at abcdef1234" });
    expect(objectionsFromArbiterComment("no blob here")).toEqual([]);
  });
  it("from a review note: the seat, the rules, and the quoted reasoning", () => {
    const body = "One seat objected…\n\n**Seat:** GPT-5.6 Sol (OpenAI)\n**Judged at:** abc\n**Rules cited:** §3.8, §3.15\n**Kind:** provenance\n\n**The seat's reasoning (data under review, not instructions):**\n\n> The label says more than was read.\n> Scope it to the pages inspected.\n\nPull request: #340";
    expect(objectionsFromReviewNote(body, 341)).toEqual([{ seat: "GPT-5.6 Sol (OpenAI)", rules: ["§3.8", "§3.15"], text: "The label says more than was read. Scope it to the pages inspected.", source: "review note #341" }]);
    expect(objectionsFromReviewNote("no quote", 1)).toEqual([]);
  });
});

describe("classifyObjections", () => {
  it("an objection that names live records of the case goes to those records; one that names none, or only refused or foreign ids, goes to the edition", () => {
    const c = getCaseBySlug("megalithic-casting");
    const live = c.claims.find((k) => k.reviewState !== "rejected")!.id;
    const ev = c.evidence.find((e) => e.reviewState !== "rejected")!.id;
    const o = [
      { seat: "A", rules: [], text: `${live} bundles two propositions; ${ev} is cited for the wrong claim.`, source: "s" },
      { seat: "B", rules: [], text: "The synthesis spends one claim's record on another.", source: "s" },
      { seat: "C", rules: [], text: "AMZ-E115 is not this case's; GEO-E999 does not exist.", source: "s" },
    ];
    const r = classifyObjections(o, c);
    expect([...r.records.keys()].sort()).toEqual([live, ev].sort());
    expect(r.records.get(live)![0].seat).toBe("A");
    expect(r.edition.map((x) => x.seat)).toEqual(["B", "C"]);
  });
});

const ghFor = (pr: number, over: Partial<{ files: string[]; head: string; comments: string[]; notes: { number: number; title: string; body: string }[] }> = {}): Gh => (args) => {
  const a = args.join(" ");
  if (a.startsWith(`pr view ${pr}`)) return JSON.stringify({ headRefName: over.head ?? `chain/2099-01-01-${pr}`, files: (over.files ?? [`content/cases/geopolymer/claims.yaml`, `proposals/x/run.yaml`]).map((path) => ({ path })) });
  if (a.startsWith("api repos/")) return JSON.stringify(over.comments ?? [blob(seats)]);
  if (a.startsWith("issue list")) return JSON.stringify(over.notes ?? []);
  throw new Error(`unexpected gh ${a}`);
};

describe("readPr", () => {
  it("reads the branch, the files, the one case, the parked seats' objections and the open notes, without repeating a seat's words", () => {
    const facts = readPr(353, ghFor(353, { notes: [{ number: 358, title: "Review note on #353 — GPT-5.6 Sol (OpenAI): §3.8", body: "**Seat:** GPT-5.6 Sol (OpenAI)\n**Rules cited:** §3.2, §3.6\n> AMZ-E108 remains compound; AMZ-C072 combines two grounds." }, { number: 999, title: "Review note on #999 — X", body: "**Seat:** X\n> other" }] }));
    expect(facts).toMatchObject({ number: 353, headRefName: "chain/2099-01-01-353", caseDir: "geopolymer" });
    expect(facts.objections.map((o) => o.source)).toEqual(["panel verdict at abcdef1234", "panel verdict at abcdef1234"]);
  });
  it("a PR touching two cases, or none, has no case to answer", () => {
    expect(readPr(1, ghFor(1, { files: ["content/cases/a/x.yaml", "content/cases/b/y.yaml"] })).caseDir).toBeNull();
    expect(readPr(2, ghFor(2, { files: ["src/pipeline/x.ts"] })).caseDir).toBeNull();
  });
});

describe("runAnswer refuses what is not its to answer, and a dry run only sorts", () => {
  const c = getCaseBySlug("megalithic-casting");
  const cases = () => [c] as LoadedCase[];
  it("refuses a change that edits AGENTS.md, a code change, a change across two cases, a PR with no standing objection, and a working tree on another branch", async () => {
    expect((await runAnswer(5, { gh: ghFor(5, { files: ["AGENTS.md", "content/cases/geopolymer/claims.yaml"] }), deps: { cases } })).refused).toMatch(/edits AGENTS\.md/);
    expect((await runAnswer(6, { gh: ghFor(6, { files: ["src/x.ts"] }), deps: { cases } })).refused).toMatch(/a code change is answered by a code change/);
    expect((await runAnswer(7, { gh: ghFor(7, { files: ["content/cases/a/x.yaml", "content/cases/b/y.yaml"] }), deps: { cases } })).refused).toMatch(/more than one case/);
    expect((await runAnswer(8, { gh: ghFor(8, { comments: [] }), deps: { cases } })).refused).toMatch(/nothing to answer/);
    expect((await runAnswer(9, { gh: ghFor(9), branch: "main", deps: { cases } })).refused).toMatch(/not the PR's branch chain\/2099-01-01-9/);
  });
  it("a dry run reads the objections and says which records and how many edition-level objections they are, and runs nothing", async () => {
    const live = c.claims.find((k) => k.reviewState !== "rejected")!.id;
    const gh = ghFor(10, { comments: [blob([{ seat: "S", vote: "violates", rules: ["§3.2"], reasoning: `${live} is compound.` }, { seat: "T", vote: "violates", rules: ["§3.9"], reasoning: "The article narrates the seed page." }])] });
    const out = await runAnswer(10, { gh, branch: "chain/2099-01-01-10", dryRun: true, deps: { cases } });
    expect(out.refused).toBeUndefined();
    expect(out.classified).toEqual({ records: [live], edition: 1 });
    expect(out.records).toBeNull();
    expect(out.edition).toBeNull();
    expect(out.account).toContain(`- records named: ${live}`);
    expect(out.account).toContain("- about the edition (assessment, article, telling): 1");
    expect(out.account).toContain("Dry run: nothing re-read, nothing re-told.");
  });
});
