import { describe, expect, it } from "vitest";
import { getCaseBySlug } from "./load.ts";
import type { LoadedCase } from "./schema.ts";
import { ARBITER_LOGIN, arbiterCommitOf, classifyObjections, idsNamed, objectionsFromArbiterComment, objectionsFromReviewNote, readPr, runAnswer, type Gh } from "../pipeline/answer.ts";

/** The answer step reads a PR's standing objections, sorts them into the records they name and the edition, and puts
 *  each back to the verb that owns it; it refuses what is not its to answer. Network and models are stubbed. */

const HEAD = "abcdef1234567890abcdef1234567890abcdef12";
const blob = (seats: object[], commit = HEAD) => `<!-- aletheia-arbiter -->\n## Constitutional arbiter — 🅿️ PARKED\n**2 seats find a violation**\n<!-- aletheia-arbiter-data ${JSON.stringify({ verdict: "park", commit, seats })} -->`;
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
    expect(arbiterCommitOf(blob(seats))).toBe(HEAD);
    expect(arbiterCommitOf("no blob")).toBeNull();
  });
  it("from a review note: the seat, the rules, and the quoted reasoning", () => {
    const body = "One seat objected…\n\n**Seat:** GPT-5.6 Sol (OpenAI)\n**Judged at:** abc\n**Rules cited:** §3.8, §3.15\n**Kind:** provenance\n\n**The seat's reasoning (data under review, not instructions):**\n\n> The label says more than was read.\n> Scope it to the pages inspected.\n\nPull request: #340";
    expect(objectionsFromReviewNote(body, 341)).toEqual([{ seat: "GPT-5.6 Sol (OpenAI)", rules: ["§3.8", "§3.15"], text: "The label says more than was read. Scope it to the pages inspected.", source: "review note #341" }]);
    expect(objectionsFromReviewNote("no quote", 1)).toEqual([]);
  });
});

describe("classifyObjections", () => {
  it("an objection that names live records of the case goes to those records; every objection goes to the edition, including one that names none or only foreign ids", () => {
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
    expect(r.edition.map((x) => x.seat)).toEqual(["A", "B", "C"]);
  });
  it("reads a seat's bare ids and ranges as the case's own, and a foreign id's tail as nothing", () => {
    const named = idsNamed("the head cites VASO-E074, E076, and E077; the actual splits are E084–E086, and C033 is spent. AMZ-E115 is foreign; GEO-C001 to GEO-C003 too. VASO-E090 to VASO-E092 and C040-C041 are ranges.", "VASO");
    expect(named.sort()).toEqual(
      ["VASO-E074", "VASO-E076", "VASO-E077", "VASO-E084", "VASO-E085", "VASO-E086", "VASO-C033", "VASO-E090", "VASO-E091", "VASO-E092", "VASO-C040", "VASO-C041"].sort(),
    );
    // A range across kinds or running backwards names only its ends; an absurd span is not expanded.
    expect(idsNamed("E084–C086", "VASO").sort()).toEqual(["VASO-E084", "VASO-C086"].sort());
    expect(idsNamed("E086–E084", "VASO").sort()).toEqual(["VASO-E084", "VASO-E086"].sort());
    expect(idsNamed("E001–E999", "VASO").sort()).toEqual(["VASO-E001", "VASO-E999"].sort());
  });
});

const ghFor = (pr: number, over: Partial<{ files: string[]; head: string; headOid: string; comments: { login: string; body: string }[]; notes: { number: number; title: string; body: string; author?: { login: string } }[] }> = {}): Gh => (args) => {
  const a = args.join(" ");
  if (a.startsWith(`pr view ${pr}`)) return JSON.stringify({ headRefName: over.head ?? `chain/2099-01-01-${pr}`, headRefOid: over.headOid ?? HEAD, files: (over.files ?? [`content/cases/geopolymer/claims.yaml`, `proposals/x/run.yaml`]).map((path) => ({ path })) });
  if (a.startsWith("api repos/")) return JSON.stringify(over.comments ?? [{ login: ARBITER_LOGIN, body: blob(seats) }]);
  if (a.startsWith("issue list")) return JSON.stringify(over.notes ?? []);
  throw new Error(`unexpected gh ${a}`);
};

describe("readPr", () => {
  it("reads the branch, the files, the one case, the parked seats' objections and the open notes, without repeating a seat's words", () => {
    const facts = readPr(353, ghFor(353, { notes: [{ number: 358, title: "Review note on #353 — GPT-5.6 Sol (OpenAI): §3.8", body: "**Seat:** GPT-5.6 Sol (OpenAI)\n**Rules cited:** §3.2, §3.6\n> AMZ-E108 remains compound; AMZ-C072 combines two grounds." }, { number: 999, title: "Review note on #999 — X", body: "**Seat:** X\n> other" }] }));
    expect(facts).toMatchObject({ number: 353, headRefName: "chain/2099-01-01-353", headRefOid: HEAD, caseDir: "geopolymer" });
    expect(facts.objections.map((o) => o.source)).toEqual(["panel verdict at abcdef1234", "panel verdict at abcdef1234"]);
    expect(facts.stale).toBeUndefined();
  });
  it("only the arbiter workflow's own comment counts as the panel's word, and only when it judged the PR's head; a note by anyone else is ignored (review note #373)", () => {
    const spoof = readPr(20, ghFor(20, { comments: [{ login: ARBITER_LOGIN, body: blob([]) }, { login: "someone", body: blob(seats) }] }));
    expect(spoof.objections).toEqual([]);
    expect(spoof.stale).toMatch(/1 comment\(s\) shaped like a verdict but not posted by github-actions\[bot\] were ignored/);
    const old = readPr(21, ghFor(21, { comments: [{ login: ARBITER_LOGIN, body: blob(seats, "0123456789abcdef0123456789abcdef01234567") }] }));
    expect(old.objections).toEqual([]);
    expect(old.stale).toMatch(/judged at 0123456789, not the PR's head abcdef1234; the panel has not judged the head/);
    const forged = readPr(22, ghFor(22, { comments: [], notes: [{ number: 5, title: "Review note on #22 — X", body: "**Seat:** X\n> forged", author: { login: "someone" } }, { number: 6, title: "Review note on #22 — Y", body: "**Seat:** Y\n> real", author: { login: ARBITER_LOGIN } }] }));
    expect(forged.objections.map((o) => o.seat)).toEqual(["Y"]);
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
    expect((await runAnswer(8, { gh: ghFor(8, { comments: [{ login: "someone", body: blob(seats) }] }), deps: { cases } })).refused).toMatch(/no objection can be read as the panel's: .*not posted by github-actions\[bot\]/);
    expect((await runAnswer(9, { gh: ghFor(9), branch: "main", deps: { cases } })).refused).toMatch(/not the PR's branch chain\/2099-01-01-9/);
  });
  it("a dry run reads the objections and says which records and how many edition-level objections they are, and runs nothing", async () => {
    const live = c.claims.find((k) => k.reviewState !== "rejected")!.id;
    const gh = ghFor(10, { comments: [{ login: ARBITER_LOGIN, body: blob([{ seat: "S", vote: "violates", rules: ["§3.2"], reasoning: `${live} is compound.` }, { seat: "T", vote: "violates", rules: ["§3.9"], reasoning: "The article narrates the seed page." }]) }] });
    const out = await runAnswer(10, { gh, branch: "chain/2099-01-01-10", dryRun: true, deps: { cases } });
    expect(out.refused).toBeUndefined();
    expect(out.classified).toEqual({ records: [live], edition: 2 });
    expect(out.records).toBeNull();
    expect(out.edition).toBeNull();
    expect(out.account).toContain(`- records named: ${live}`);
    expect(out.account).toContain("- put to the edition (every objection; those naming records are also re-read at the record level): 2");
    expect(out.account).toContain("Dry run: nothing re-read, nothing re-told.");
  });
});

describe("settleRecords with verb answer, end to end on a copied case", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { parse, stringify } = await import("yaml");
  const { settleRecords, splitNoteFor, readRelinked } = await import("../pipeline/reverify.ts");
  const { quotedSpans } = await import("../pipeline/quotes.ts");
  const c = getCaseBySlug("megalithic-casting");
  const live = c.evidence.find((e) => e.id === "GEO-E023")!;
  const source = c.sources.find((s) => s.id === live.sourceId)!;
  const text = `Filler before. ${quotedSpans(live.sourceStatement).join(" … ")} Filler after. [p. 1]`;
  const fetchOk = (async (t: { url: string }) => ({ url: t.url, ok: true, status: 200, contentType: "text/html", text, via: "html" })) as never;
  const fetchFail = (async (t: { url: string }) => ({ url: t.url, ok: false, status: 503, contentType: null, text: null, reason: "HTTP 503" })) as never;
  const verdict = (over: object = {}) => async () => ({ quoteInContext: true, locatorSupported: true, statementSupported: true, directionRight: true, relevant: true, atomic: true, independenceNoted: true, reason: "read again with the objection in view", ...over }) as never;
  const setup = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-answer-"));
    fs.cpSync(path.join(process.cwd(), "content", "cases", c.dir), path.join(root, "content", "cases", c.dir), { recursive: true });
    return root;
  };
  const settlement = (why: string) => ({ verb: "answer" as const, originals: { sources: [], evidence: [live], claims: [] }, what: `Answer to the panel's objections on #99: 1 record(s) re-read`, context: `A seat objected: ${why}`, why: "a seat objected", actor: "aletheia answer (test reader), on #99" });
  it("a live record the reader upholds is kept, ai_extracted, with the run and a history entry on the record", async () => {
    const root = setup();
    const out = await settleRecords(c.record.slug, settlement("the quote is out of context"), { root, deps: { cases: () => [c], judge: verdict(), fetch: fetchOk } });
    expect(out.outcome).toBe("completed");
    expect(out).toMatchObject({ promoted: 1, refused: 0, unread: 0 });
    expect(out.reason).toBe("answer: promoted 1, appended 0, refused 0, still unread 0");
    const after = (parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")) as { id: string; reviewState: string }[]).find((e) => e.id === live.id)!;
    expect(after.reviewState).toBe("ai_extracted");
    const history = parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "history.yaml"), "utf8")) as { change: string; actor: string }[];
    expect(history.at(-1)!.change).toMatch(/^Answer to the panel's objections on #99: 1 record\(s\) re-read \(\d{4}-\d{2}-\d{2}-answer-megalithic-casting-\d{6}\): answer: promoted 1/);
    expect(history.at(-1)!.actor).toBe("aletheia answer (test reader), on #99");
    expect(fs.readFileSync(path.join(root, "proposals", out.runId, "verification.md"), "utf8")).toContain("The reader was told: A seat objected: the quote is out of context");
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("a live record the reader now refuses becomes a tombstone from its own state, with the answer's wording, and a failed row", async () => {
    const root = setup();
    const out = await settleRecords(c.record.slug, settlement("the statement says more than the passage"), { root, deps: { cases: () => [c], judge: verdict({ statementSupported: false, reason: "the passage does not state it" }), fetch: fetchOk } });
    expect(out).toMatchObject({ outcome: "completed", promoted: 0, refused: 1 });
    const after = (parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")) as { id: string; reviewState: string; limitations: string[] }[]).find((e) => e.id === live.id)!;
    expect(after.reviewState).toBe("rejected");
    expect(after.limitations.at(-1)).toMatch(/^Refused at the answer's re-reading \d{4}-\d{2}-\d{2} \(\d{4}-\d{2}-\d{2}-answer-megalithic-casting-\d{6}\): second reader rejected \(statementSupported\): the passage does not state it/);
    const rows = parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "dispositions.yaml"), "utf8")) as { disposition: string; reason?: string; by: string }[];
    const mine = rows.filter((r) => r.by === out.runId);
    expect(mine.map((r) => r.disposition)).toEqual(["failed"]);
    expect(mine[0].reason).toMatch(/^refused at the answer's re-reading: /);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("a live record whose text cannot be re-read is left exactly as it stood, with the attempt in the run's account only", async () => {
    const root = setup();
    const before = fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8");
    const out = await settleRecords(c.record.slug, settlement("anything"), { root, deps: { cases: () => [c], judge: verdict(), fetch: fetchFail } });
    expect(out).toMatchObject({ outcome: "completed", promoted: 0, refused: 0 });
    expect(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")).toBe(before);
    const rows = parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "dispositions.yaml"), "utf8")) as { by: string }[];
    expect(rows.filter((r) => r.by === out.runId)).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  });
  // A live claim with an anchor and a live record that cites it alone: the fixtures for the split paths.
  const claim = c.claims.find((k) => k.reviewState !== "rejected" && k.sourceAnchor?.quote && !k.sourceAnchor.also?.length && c.evidence.some((e) => e.reviewState !== "rejected" && e.claimIds.length === 1 && e.claimIds[0] === k.id))!;
  const citing = c.evidence.find((e) => e.reviewState !== "rejected" && e.claimIds.length === 1 && e.claimIds[0] === claim.id)!;
  const claimText = `Filler. ${claim.sourceAnchor!.quote} More filler. [p. 2]`;
  const fetchClaim = (async (x: { url: string }) => ({ url: x.url, ok: true, status: 200, contentType: "text/html", text: claimText, via: "html" })) as never;
  const ok = { quoteInContext: true, locatorSupported: true, statementSupported: true, directionRight: true, relevant: true, atomic: true, independenceNoted: true, ofTheCompound: true };
  const parts = ["The first proposition on its own.", "The second proposition on its own."];
  const claimSettlement = { verb: "answer" as const, originals: { sources: [], evidence: [], claims: [claim] }, what: `Answer to the panel's objections on #99: 1 record(s) re-read`, context: "A seat objected: the claim is compound", why: "a seat objected", actor: "aletheia answer (test reader), on #99" };
  it("a live claim found compound, no part of which can be anchored and read, is refused with nothing in its place, and the record that cited it alone falls with it — no link left dangling", async () => {
    expect(claim && citing).toBeTruthy();
    const root = setup();
    const judge = async (rec: unknown) => ((rec as { statement: string }).statement === claim.statement ? { ...ok, atomic: false, reason: "two propositions in one" } : { ...ok, statementSupported: false, reason: "not at the locator" });
    const out = await settleRecords(c.record.slug, claimSettlement, { root, deps: { cases: () => [c], judge, split: async () => parts, fetch: fetchClaim } });
    expect(out).toMatchObject({ outcome: "completed", promoted: 0, appended: 0, refused: 1 });
    expect(out.reason).toBe("answer: promoted 0, appended 0, refused 1, still unread 0");
    const claims = parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "claims.yaml"), "utf8")) as { id: string; reviewState: string; rejectionReason?: string }[];
    const parent = claims.find((k) => k.id === claim.id)!;
    expect(parent.reviewState).toBe("rejected");
    expect(parent.rejectionReason).toMatch(/: not atomic \(two propositions in one\); split into nothing that survived$/);
    const ev = (parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")) as { id: string; reviewState: string; limitations: string[] }[]).find((e) => e.id === citing.id)!;
    expect(ev.reviewState).toBe("rejected");
    expect(ev.limitations.at(-1)).toMatch(/^Refused at the answer's re-reading \d{4}-\d{2}-\d{2} \(.+\): every claim it cited was refused$/);
    const account = fs.readFileSync(path.join(root, "proposals", out.runId, "verification.md"), "utf8");
    expect(account).toContain(`${claim.id} part "The first proposition on its own." refused (statementSupported): not at the locator`);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("a part is judged on the anchor the splitter gives it when the text carries the quote, and on the compound's anchor — said so — when it does not", async () => {
    const root = setup();
    const quotes = ["the first proposition stands in these very words", "not words the text contains anywhere"];
    const withQuotes = (async (x: { url: string }) => ({ url: x.url, ok: true, status: 200, contentType: "text/html", text: `${claimText} Then ${quotes[0]}, as the source says. [p. 3]`, via: "html" })) as never;
    const seen: { statement: string; quote?: string; locator?: string }[] = [];
    const judge = async (rec: unknown) => {
      const r = rec as { statement: string; anchor?: { quote?: string; locator?: string } };
      if (r.statement === claim.statement) return { ...ok, atomic: false, reason: "two propositions in one" };
      seen.push({ statement: r.statement, quote: r.anchor?.quote, locator: r.anchor?.locator });
      return { ...ok, reason: "one proposition, at its anchor" };
    };
    const split = async () => ({ parts, anchors: [{ quote: quotes[0], locator: "[p. 3]" }, { quote: quotes[1] }] });
    const out = await settleRecords(c.record.slug, claimSettlement, { root, deps: { cases: () => [c], judge, split, fetch: withQuotes } });
    expect(out).toMatchObject({ outcome: "completed", appended: 2, refused: 1 });
    expect(seen).toEqual([
      { statement: parts[0], quote: quotes[0], locator: "[p. 3]" },
      { statement: parts[1], quote: claim.sourceAnchor!.quote, locator: claim.sourceAnchor!.locator },
    ]);
    const claims = parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "claims.yaml"), "utf8")) as { id: string; statement: string; sourceAnchor?: { quote?: string; locator: string; sourceId?: string }; origin: { ref: string } }[];
    const first = claims.find((k) => k.statement === parts[0])!;
    const second = claims.find((k) => k.statement === parts[1])!;
    expect(first.sourceAnchor).toMatchObject({ quote: quotes[0], locator: "[p. 3]", ...(claim.sourceAnchor!.sourceId ? { sourceId: claim.sourceAnchor!.sourceId } : {}) });
    expect(first.origin.ref).toMatch(/; anchored by the splitter in the same text$/);
    expect(second.sourceAnchor).toMatchObject({ quote: claim.sourceAnchor!.quote, locator: claim.sourceAnchor!.locator });
    expect(second.origin.ref).not.toMatch(/anchored by the splitter/);
    expect(fs.readFileSync(path.join(root, "proposals", out.runId, "verification.md"), "utf8")).toContain(`${claim.id} part "${parts[1].slice(0, 60)}": the splitter's quote is not in the text verbatim ("${quotes[1]}"); judged on the compound's anchor`);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("a live claim split into admitted parts is rejected naming them, and a record that cited it now cites the parts — provisional until read against them — instead of falling", async () => {
    const root = setup();
    const judge = async (rec: unknown) => ((rec as { statement: string }).statement === claim.statement ? { ...ok, atomic: false, reason: "two propositions in one" } : { ...ok, reason: "one proposition, at the anchor" });
    const out = await settleRecords(c.record.slug, claimSettlement, { root, deps: { cases: () => [c], judge, split: async () => parts, fetch: fetchClaim } });
    expect(out).toMatchObject({ outcome: "completed", promoted: 0, appended: 2, refused: 1 });
    const claims = parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "claims.yaml"), "utf8")) as { id: string; statement: string; reviewState: string; rejectionReason?: string; origin: { ref: string } }[];
    const parent = claims.find((k) => k.id === claim.id)!;
    expect(parent.reviewState).toBe("rejected");
    const named = /split into ([A-Z]+-C\d{3}), ([A-Z]+-C\d{3})$/.exec(parent.rejectionReason ?? "");
    expect(named).toBeTruthy();
    const partIds = [named![1], named![2]];
    for (const id of partIds) expect(claims.find((k) => k.id === id)).toMatchObject({ reviewState: "ai_extracted", origin: { ref: expect.stringMatching(new RegExp(`^split of ${claim.id} `)) } });
    expect(claims.filter((k) => partIds.includes(k.id)).map((k) => k.statement)).toEqual(parts);
    const ev = (parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")) as { id: string; claimIds: string[]; reviewState: string; limitations: string[]; provisional?: { exists: string; reason: string; route: string; by: string } }[]).find((e) => e.id === citing.id)!;
    expect(ev.reviewState).toBe("provisional");
    expect(ev.provisional).toMatchObject({ exists: "admitted read; relinked at the split of a claim it cited", by: out.runId, route: "re-read the record against each part it now cites (the re-verify pass does this)" });
    expect(ev.provisional!.reason).toBe(ev.limitations.at(-1));
    expect(ev.claimIds).toEqual(partIds);
    const history = parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "history.yaml"), "utf8")) as { change: string }[];
    expect(history.at(-1)!.change).toContain(`Relinked to the parts of a split claim, provisional until read against them: ${citing.id}.`);
    expect(out.relinked).toEqual([citing.id]);
    expect(out.relinkedTo).toEqual({ [claim.id]: partIds });
    // The relinked record is then read against the parts: it keeps the links the passage bears, with the reader's stamps, and is provisional no more.
    const fresh = () => [{ ...c, claims: parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "claims.yaml"), "utf8")), evidence: parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")) } as unknown as LoadedCase];
    const seen: string[] = [];
    const judgeParts = async (_rec: unknown, _text: string, context: string) => {
      seen.push(context);
      return { ...ok, bearsOn: [partIds[0]], reason: "the passage bears on the first part alone" };
    };
    const citingText = `Filler before. ${quotedSpans(citing.sourceStatement).join(" … ")} Filler after. [p. 1]`;
    const fetchCiting = (async (x: { url: string }) => ({ url: x.url, ok: true, status: 200, contentType: "text/html", text: citingText, via: "html" })) as never;
    const read = await readRelinked(c.record.slug, out.relinked!, out.relinkedTo!, "aletheia answer (test reader), on #99 — the records relinked at the split", { root, deps: { cases: fresh, judge: judgeParts, fetch: fetchCiting } });
    expect(read).toMatchObject({ outcome: "completed", promoted: 1, refused: 0 });
    expect(seen.some((ctx) => ctx.includes(`${claim.id} → ${partIds.join(", ")}`) && ctx.includes("Judge which of the parts the passage bears on"))).toBe(true);
    const evAfter = (parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")) as { id: string; claimIds: string[]; reviewState: string; provisional?: unknown }[]).find((e) => e.id === citing.id)!;
    expect(evAfter.reviewState).toBe("ai_extracted");
    expect(evAfter.claimIds).toEqual([partIds[0]]);
    expect(evAfter.provisional).toBeUndefined();
    const history2 = parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "history.yaml"), "utf8")) as { change: string; actor: string }[];
    expect(history2.at(-1)!.change).toMatch(new RegExp(`^Records relinked to the parts of a split claim, read against them \\(${claim.id} → ${partIds.join(", ")}\\)`));
    expect(history2.at(-1)!.actor).toBe("aletheia answer (test reader), on #99 — the records relinked at the split");
    expect(ev.limitations.at(-1)).toMatch(new RegExp(`^Relinked at the answer's re-reading \\d{4}-\\d{2}-\\d{2} \\(${out.runId}\\): ${claim.id} was split into ${partIds.join(", ")}; this record now cites the parts, and which of them it bears on is for a later reading$`));
    fs.rmSync(root, { recursive: true, force: true });
  });
  // A case in the state a split leaves it: the parent refused, the parts in, the citing record relinked and provisional.
  const relinkedRoot = async () => {
    const root = setup();
    const judge = async (rec: unknown) => ((rec as { statement: string }).statement === claim.statement ? { ...ok, atomic: false, reason: "two propositions in one" } : { ...ok, reason: "one proposition, at the anchor" });
    const out = await settleRecords(c.record.slug, claimSettlement, { root, deps: { cases: () => [c], judge, split: async () => parts, fetch: fetchClaim } });
    const fresh = () => [{ ...c, claims: parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "claims.yaml"), "utf8")), evidence: parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")) } as unknown as LoadedCase];
    const citingText = `Filler before. ${quotedSpans(citing.sourceStatement).join(" … ")} Filler after. [p. 1]`;
    const fetchCiting = (async (x: { url: string }) => ({ url: x.url, ok: true, status: 200, contentType: "text/html", text: citingText, via: "html" })) as never;
    return { root, relinked: out.relinked!, relinkedTo: out.relinkedTo!, fresh, fetchCiting };
  };
  const evidenceOf = (root: string, id: string) => (parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")) as { id: string; claimIds: string[]; reviewState: string; provisional?: unknown; limitations: string[] }[]).find((e) => e.id === id)!;
  it("a relinked record the passage bears on no part of is refused, with the reason on the record", async () => {
    const { root, relinked, relinkedTo, fresh, fetchCiting } = await relinkedRoot();
    const read = await readRelinked(c.record.slug, relinked, relinkedTo, "aletheia answer (test reader), on #99 — the records relinked at the split", { root, deps: { cases: fresh, judge: async () => ({ ...ok, bearsOn: [], reason: "the passage bears on neither part" }), fetch: fetchCiting } });
    expect(read).toMatchObject({ outcome: "completed", promoted: 0, refused: 1 });
    const ev = evidenceOf(root, citing.id);
    expect(ev.reviewState).toBe("rejected");
    expect(ev.limitations.at(-1)).toMatch(/^Refused at re-verification \d{4}-\d{2}-\d{2} \(.+\): second reader: the passage bears on none of the claims the record names: the passage bears on neither part$/);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("a relinked record whose text will not come stays provisional, the attempt in the account", async () => {
    const { root, relinked, relinkedTo, fresh } = await relinkedRoot();
    const before = evidenceOf(root, citing.id);
    const read = await readRelinked(c.record.slug, relinked, relinkedTo, "aletheia answer (test reader), on #99 — the records relinked at the split", { root, deps: { cases: fresh, judge: async () => ({ ...ok, reason: "not asked" }), fetch: (async (x: { url: string }) => ({ url: x.url, ok: false, status: 503, contentType: null, text: null, reason: "HTTP 503" })) as never } });
    expect(read).toMatchObject({ outcome: "completed", promoted: 0, refused: 0, unread: 1 });
    expect(evidenceOf(root, citing.id)).toEqual(before);
    expect(fs.readFileSync(path.join(root, "proposals", read.runId, "verification.md"), "utf8")).toContain("## Still unread");
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("a read against the parts that fails half-way rolls its writes back and says so", async () => {
    const { root, relinked, relinkedTo, fresh, fetchCiting } = await relinkedRoot();
    const dir = path.join(root, "content", "cases", c.dir);
    const before = Object.fromEntries(["evidence.yaml", "claims.yaml", "dispositions.yaml", "history.yaml"].map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));
    fs.chmodSync(path.join(dir, "history.yaml"), 0o444);
    const read = await readRelinked(c.record.slug, relinked, relinkedTo, "aletheia answer (test reader), on #99 — the records relinked at the split", { root, deps: { cases: fresh, judge: async () => ({ ...ok, bearsOn: [relinkedTo[claim.id][0]], reason: "the first part" }), fetch: fetchCiting } });
    fs.chmodSync(path.join(dir, "history.yaml"), 0o644);
    expect(read.outcome).toBe("failed");
    expect(read.reason).toContain("; the ledger writes of this run were rolled back");
    for (const [f, text] of Object.entries(before)) expect(fs.readFileSync(path.join(dir, f), "utf8")).toBe(text);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("the answer reads what it relinked before the edition, and when that read fails the edition is still told over the settled ledger", async () => {
    const root = setup();
    const branch = "chain/2099-01-01-99";
    const gh = ghFor(99, { files: [`content/cases/${c.dir}/claims.yaml`, "proposals/x/run.yaml"], head: branch, comments: [{ login: ARBITER_LOGIN, body: blob([{ seat: "GPT-5.6 Sol (OpenAI)", vote: "violates", rules: ["§3.2"], reasoning: `${claim.id} bundles two propositions.` }]) }] });
    const fresh = () => [{ ...c, claims: parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "claims.yaml"), "utf8")), evidence: parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")) } as unknown as LoadedCase];
    const judge = async (rec: unknown) => ((rec as { statement: string }).statement === claim.statement ? { ...ok, atomic: false, reason: "two propositions in one" } : { ...ok, reason: "one proposition, at the anchor" });
    // The first source read serves the claim's anchor; the second — the relinked record's — tears.
    let fetches = 0;
    const fetchOnceThenTear = (async (x: { url: string }) => {
      fetches++;
      if (fetches > 1) throw new Error("the socket tore");
      return { url: x.url, ok: true, status: 200, contentType: "text/html", text: claimText, via: "html" };
    }) as never;
    const out = await runAnswer(99, { root, gh, branch, deps: { cases: fresh, judge, split: async () => parts, fetch: fetchOnceThenTear, edit: (() => { throw new Error("the edition ran"); }) as never } });
    expect(out.classified.records).toEqual([claim.id]);
    expect(out.records).toMatchObject({ outcome: "completed", appended: 2, refused: 1 });
    expect(out.records!.relinked).toEqual([citing.id]);
    expect(out.relinked?.outcome).toBe("failed");
    expect(out.relinked?.reason).toContain("the socket tore");
    expect(out.edition?.outcome).toBe("failed");
    expect(out.edition?.reason).toContain("the edition ran");
    expect(out.account).toContain("## Relinked records read against the parts");
    expect(out.account).toContain("## Edition re-told with every objection in its packet");
    // The settled ledger stands: the parts are in and the relinked record is still provisional, to be read by a later pass.
    expect(evidenceOf(root, citing.id).reviewState).toBe("provisional");
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("a part refused as compound is split once more — a second round, no third — for evidence", async () => {
    const root = setup();
    const q = quotedSpans(live.sourceStatement)[0];
    const p1 = `Two findings together, "${q}".`;
    const p2 = `Another pair together, "${q}".`;
    const p1a = `The first finding alone, "${q}".`;
    const p1b = `The second finding alone, "${q}".`;
    const p2a = `Still a pair, "${q}".`;
    const compound = new Set([live.sourceStatement, p1, p2, p2a]);
    const judge = async (rec: unknown) => {
      const st = (rec as { sourceStatement: string }).sourceStatement;
      return compound.has(st) ? { ...ok, atomic: false, reason: "more than one finding" } : { ...ok, reason: "one finding" };
    };
    const split = async (statement: string) => (statement === live.sourceStatement ? [p1, p2] : statement === p1 ? [p1a, p1b] : statement === p2 ? [p2a] : []);
    const out = await settleRecords(c.record.slug, settlement("compound"), { root, deps: { cases: () => [c], judge, split, fetch: fetchOk } });
    expect(out).toMatchObject({ outcome: "completed", promoted: 0, appended: 2, refused: 1 });
    const ev = parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")) as { id: string; title: string; sourceStatement: string; origin: { ref: string }; reviewState: string; limitations: string[] }[];
    const parts = ev.filter((e) => e.origin.ref.startsWith(`split of ${live.id} `));
    expect(parts.map((e) => e.sourceStatement).sort()).toEqual([p1a, p1b].sort());
    expect(parts.map((e) => e.title.replace(/^.* — part /, "")).sort()).toEqual(["1.1", "1.2"]);
    for (const e of parts) expect(e.origin.ref).toMatch(/; second round$/);
    const parent = ev.find((e) => e.id === live.id)!;
    expect(parent.reviewState).toBe("rejected");
    expect(parent.limitations.at(-1)).toMatch(new RegExp(`split into ${parts.map((e) => e.id).sort().join(", ")}$`));
    const account = fs.readFileSync(path.join(root, "proposals", out.runId, "verification.md"), "utf8");
    expect(account).toContain(`${live.id} part "${p1.slice(0, 60)}" still not one observation (more than one finding); split again into 2 part(s)`);
    expect(account).toContain(`${live.id} part "${p2a.slice(0, 60)}" refused (atomic): more than one finding`);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("a part refused as compound is split once more for a claim, each sub-part on its own anchor", async () => {
    const root = setup();
    const quote = claim.sourceAnchor!.quote!;
    const level1 = ["Two propositions together.", "One proposition on its own."];
    const level2 = ["The first proposition alone.", "The second proposition alone."];
    const compound = new Set([claim.statement, level1[0]]);
    const judge = async (rec: unknown) => {
      const st = (rec as { statement: string }).statement;
      return compound.has(st) ? { ...ok, atomic: false, reason: "two propositions" } : { ...ok, reason: "one proposition, at its anchor" };
    };
    const split = async (statement: string) => (statement === claim.statement ? { parts: level1, anchors: level1.map(() => ({ quote, locator: "Results" })) } : statement === level1[0] ? { parts: level2, anchors: level2.map(() => ({ quote, locator: "Results" })) } : { parts: [] });
    const out = await settleRecords(c.record.slug, claimSettlement, { root, deps: { cases: () => [c], judge, split, fetch: fetchClaim } });
    expect(out).toMatchObject({ outcome: "completed", appended: 3, refused: 1 });
    const claims = parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "claims.yaml"), "utf8")) as { id: string; statement: string; origin: { ref: string }; sourceAnchor?: { quote?: string; locator: string } }[];
    const parts = claims.filter((k) => k.origin.ref.startsWith(`split of ${claim.id} `));
    expect(parts.map((k) => k.statement).sort()).toEqual([level1[1], ...level2].sort());
    for (const k of parts) expect(k.sourceAnchor).toMatchObject({ quote, locator: "Results" });
    expect(parts.filter((k) => k.origin.ref.endsWith(`; second round, of the part "${level1[0]}"`)).map((k) => k.statement).sort()).toEqual([...level2].sort());
    const account = fs.readFileSync(path.join(root, "proposals", out.runId, "verification.md"), "utf8");
    expect(account).toContain(`${claim.id} part "${level1[0].slice(0, 60)}" still not one proposition (two propositions); split again into 2 part(s)`);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("a part the reader finds not of the compound is refused, for evidence and for claims, and the protocols carry the flag", async () => {
    const { loadProtocol } = await import("../pipeline/protocols.ts");
    expect(loadProtocol("split").version).toBe("split-v5");
    expect(loadProtocol("verify").version).toBe("verify-v7");
    // Evidence: two parts, the second a neighbouring sentence the compound never stated.
    const root = setup();
    const q = quotedSpans(live.sourceStatement)[0];
    const pOf = `A finding the compound stated, "${q}".`;
    const pNot = `A finding from the next sentence, "${q}".`;
    const seenContexts: string[] = [];
    const judge = async (rec: unknown, _text: string, context: string) => {
      const st = (rec as { sourceStatement?: string }).sourceStatement ?? "";
      if (st === live.sourceStatement) return { ...ok, atomic: false, reason: "two findings" };
      seenContexts.push(context);
      return st === pNot ? { ...ok, ofTheCompound: false, reason: "the compound never stated this" } : { ...ok, ofTheCompound: true, reason: "one of the compound's findings" };
    };
    const out = await settleRecords(c.record.slug, settlement("compound"), { root, deps: { cases: () => [c], judge, split: async () => [pOf, pNot], fetch: fetchOk } });
    expect(out).toMatchObject({ outcome: "completed", appended: 1, refused: 1 });
    expect(seenContexts.every((ctx) => ctx.includes(`This record is a PART of a compound record that was split — the compound's statement: "${live.sourceStatement}"`))).toBe(true);
    const account = fs.readFileSync(path.join(root, "proposals", out.runId, "verification.md"), "utf8");
    expect(account).toContain(`${live.id} part "${pNot.slice(0, 60)}" refused: not an observation the compound bundled — the compound never stated this`);
    const ev = parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")) as { sourceStatement: string; origin: { ref: string } }[];
    expect(ev.filter((e) => e.origin.ref.startsWith(`split of ${live.id} `)).map((e) => e.sourceStatement)).toEqual([pOf]);
    fs.rmSync(root, { recursive: true, force: true });
    // Claims likewise.
    const root2 = setup();
    const judge2 = async (rec: unknown) => {
      const st = (rec as { statement: string }).statement;
      if (st === claim.statement) return { ...ok, atomic: false, reason: "two propositions" };
      return st === parts[1] ? { ...ok, ofTheCompound: false, reason: "a neighbouring proposition" } : { ...ok, ofTheCompound: true, reason: "one of the compound's" };
    };
    const out2 = await settleRecords(c.record.slug, claimSettlement, { root: root2, deps: { cases: () => [c], judge: judge2, split: async () => parts, fetch: fetchClaim } });
    expect(out2).toMatchObject({ outcome: "completed", appended: 1, refused: 1 });
    expect(fs.readFileSync(path.join(root2, "proposals", out2.runId, "verification.md"), "utf8")).toContain(`${claim.id} part "${parts[1].slice(0, 60)}" refused: not a proposition the compound bundled — a neighbouring proposition`);
    fs.rmSync(root2, { recursive: true, force: true });
  });
  it("a part the reader does not affirm as of the compound — null or no answer — is refused, fail closed", async () => {
    const root = setup();
    const q = quotedSpans(live.sourceStatement)[0];
    const p1 = `A finding, "${q}".`;
    const p2 = `Another finding, "${q}".`;
    const { ofTheCompound: _o, ...silent } = ok;
    void _o;
    const judge = async (rec: unknown) => {
      const st = (rec as { sourceStatement?: string }).sourceStatement ?? "";
      if (st === live.sourceStatement) return { ...silent, atomic: false, reason: "two findings" };
      return st === p1 ? { ...silent, ofTheCompound: null, reason: "did not say" } : { ...silent, reason: "did not answer" };
    };
    const out = await settleRecords(c.record.slug, settlement("compound"), { root, deps: { cases: () => [c], judge, split: async () => [p1, p2], fetch: fetchOk } });
    expect(out).toMatchObject({ outcome: "completed", appended: 0, refused: 1 });
    const account = fs.readFileSync(path.join(root, "proposals", out.runId, "verification.md"), "utf8");
    expect(account).toContain(`${live.id} part "${p1.slice(0, 60)}" refused: the reader did not affirm it is an observation the compound bundled — did not say`);
    expect(account).toContain(`${live.id} part "${p2.slice(0, 60)}" refused: the reader did not affirm it is an observation the compound bundled — did not answer`);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("an evidence part is placed where the splitter finds its quote, with the compound's document identity", async () => {
    const root = setup();
    const q = quotedSpans(live.sourceStatement)[0];
    const p1 = `The first finding, "${q}".`;
    const p2 = `The second finding, "${q}".`;
    const judge = async (rec: unknown) => ((rec as { sourceStatement?: string }).sourceStatement === live.sourceStatement ? { ...ok, atomic: false, reason: "two findings" } : { ...ok, reason: "one finding" });
    const split = async () => ({ parts: [p1, p2], anchors: [{ quote: q, locator: "Abstract (Results)" }, null] });
    const out = await settleRecords(c.record.slug, settlement("compound"), { root, deps: { cases: () => [c], judge, split, fetch: fetchOk } });
    expect(out).toMatchObject({ outcome: "completed", appended: 2 });
    const ev = parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "evidence.yaml"), "utf8")) as { sourceStatement: string; exactLocator?: string; readerActs?: { field: string; to: string; reason: string }[] }[];
    const first = ev.find((e) => e.sourceStatement === p1)!;
    const second = ev.find((e) => e.sourceStatement === p2)!;
    const identity = (live.exactLocator ?? "").split(",")[0].trim();
    const via = (live.exactLocator ?? "").match(/\s*\(via [^)]*\)\s*$/)?.[0]?.trim() ?? "";
    expect(first.exactLocator).toBe(`${identity}, Abstract (Results)${via ? ` ${via}` : ""}`);
    const act = first.readerActs?.find((a) => a.field === "exactLocator" && a.to === first.exactLocator);
    expect(act).toBeTruthy();
    expect(act!.reason).toMatch(/the splitter's locator for the part's own quote, composed with the compound's document identity; the second reader judged the placed locator/);
    // The act carries the splitter's stamps, not the verifier's.
    expect((act as { promptVersion?: string }).promptVersion).toBe("split-v5");
    // A part the splitter did not place keeps the compound's locator.
    expect(second.exactLocator).toBe(live.exactLocator);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("a live claim with no source anchor, anchored by the ledger's evidence, is not refused as unanchored when read again on its own", async () => {
    const byEvidence = c.claims.find((k) => k.reviewState !== "rejected" && !k.sourceAnchor && c.evidence.some((e) => e.reviewState !== "rejected" && e.claimIds.includes(k.id)))!;
    expect(byEvidence).toBeTruthy();
    const root = setup();
    const before = fs.readFileSync(path.join(root, "content", "cases", c.dir, "claims.yaml"), "utf8");
    // The reader judges its atomicity without a text, on the statements of the records that cite it.
    const blind: string[] = [];
    const judge = async (rec: unknown, text: string, context: string) => {
      blind.push(`${text}|${context}`);
      return { ...ok, reason: "one proposition" };
    };
    const out = await settleRecords(c.record.slug, { ...claimSettlement, originals: { sources: [], evidence: [], claims: [byEvidence] } }, { root, deps: { cases: () => [c], judge, split: async () => parts, fetch: fetchClaim } });
    expect(out).toMatchObject({ outcome: "completed", promoted: 1, refused: 0 });
    expect(blind).toHaveLength(1);
    expect(blind[0]).toMatch(/^\|/);
    expect(blind[0]).toContain("This claim has no source anchor of its own; it is anchored by the records that cite it");
    const accountStood = fs.readdirSync(path.join(root, "proposals"), { recursive: true }).map(String).filter((f) => f.endsWith("verification.md")).map((f) => fs.readFileSync(path.join(root, "proposals", f), "utf8")).join("\n");
    expect(accountStood).toContain(`${byEvidence.id}: stood — the reader: one proposition`);
    // Promoted over itself: the claim stands as it was, live, its statement and state unchanged.
    const after = (parse(fs.readFileSync(path.join(root, "content", "cases", c.dir, "claims.yaml"), "utf8")) as { id: string; statement: string; reviewState: string }[]).find((k) => k.id === byEvidence.id)!;
    expect(after).toMatchObject({ statement: byEvidence.statement, reviewState: byEvidence.reviewState });
    expect(before).toContain(byEvidence.statement.slice(0, 40));
    fs.rmSync(root, { recursive: true, force: true });
    // A compound one is split on the statements of the records that cite it: the parts enter anchored as it was, by
    // those records, which are relinked to the parts and then read against them.
    const root3 = setup();
    const citers = c.evidence.filter((e) => e.reviewState !== "rejected" && e.claimIds.includes(byEvidence.id));
    // The first split's second half is itself compound: it is split once more, a second round and no further.
    const halves = ["The first proposition the founding claim bundled.", "The second and third propositions the founding claim bundled."];
    const subs = ["The second proposition the founding claim bundled.", "The third proposition the founding claim bundled."];
    // The splitter's second round also returns the first half again — a proposition of the compound, but not of the
    // part being split; the reader, told the immediate parent, refuses it as not of that part (review note #405).
    const stray = halves[0];
    const judge3 = async (rec: unknown, _text: string, context: string) => {
      const st = (rec as { statement: string }).statement;
      if (st === byEvidence.statement) return { ...ok, atomic: false, reason: "occurrence and prevalence in one" };
      if (st === halves[1]) return { ...ok, ofTheCompound: true, atomic: false, reason: "still two" };
      if (context.includes("This is a PART of a compound claim")) {
        const parent = /the compound's statement: "([^"]+)"/.exec(context)![1];
        const of = parent === byEvidence.statement ? halves.includes(st) : parent === halves[1] ? subs.includes(st) : false;
        return { ...ok, ofTheCompound: of, reason: of ? "of its parent" : "not of the part being split" };
      }
      return { ...ok, reason: "fine" };
    };
    const seenSplit: string[] = [];
    const split3 = async (statement: string, anchorText: string) => (seenSplit.push(`${statement}|${anchorText}`), statement === halves[1] ? [...subs, stray] : halves);
    const out3 = await settleRecords(c.record.slug, { ...claimSettlement, originals: { sources: [], evidence: [], claims: [byEvidence] } }, { root: root3, deps: { cases: () => [c], judge: judge3, split: split3, fetch: fetchClaim } });
    expect(out3).toMatchObject({ outcome: "completed", promoted: 0, appended: 3, refused: 1 });
    expect(seenSplit).toHaveLength(2);
    expect(seenSplit[1].startsWith(`${halves[1]}|`)).toBe(true);
    for (const e of citers) for (const seen of seenSplit) expect(seen).toContain(`${e.id}: ${e.sourceStatement}`);
    const claims3 = parse(fs.readFileSync(path.join(root3, "content", "cases", c.dir, "claims.yaml"), "utf8")) as { id: string; statement: string; reviewState: string; sourceAnchor?: unknown; origin: { ref: string }; rejectionReason?: string }[];
    const account3 = fs.readdirSync(path.join(root3, "proposals"), { recursive: true }).map(String).filter((f) => f.endsWith("verification.md")).map((f) => fs.readFileSync(path.join(root3, "proposals", f), "utf8")).join("\n");
    expect(account3).toContain("still not one proposition (still two); split again into 3 part(s)");
    const parts3 = claims3.filter((k) => k.origin.ref.startsWith(`split of ${byEvidence.id} `));
    expect(parts3.map((k) => k.statement).sort()).toEqual([halves[0], ...subs].sort());
    for (const k of parts3) {
      expect(k.sourceAnchor).toBeUndefined();
      expect(k.origin.ref).toContain("on the statements of the records that cite it, without a text; anchored as the compound was, by the records that cite it");
      expect(k.origin.ref.endsWith(`; second round, of the part "${halves[1]}"`)).toBe(subs.includes(k.statement));
    }
    expect(parts3.filter((k) => k.statement === stray)).toHaveLength(1); // the first-round one, not a second-round copy
    expect(account3).toContain(`part "${stray.slice(0, 60)}" refused: not a proposition the compound bundled — not of the part being split`);

    expect(claims3.find((k) => k.id === byEvidence.id)!.rejectionReason).toMatch(new RegExp(`split into ${parts3.map((k) => k.id).sort().join(", ")}$`));
    expect(out3.relinked?.sort()).toEqual(citers.map((e) => e.id).sort());
    const ev3 = parse(fs.readFileSync(path.join(root3, "content", "cases", c.dir, "evidence.yaml"), "utf8")) as { id: string; claimIds: string[]; reviewState: string }[];
    for (const e of citers) {
      const after3 = ev3.find((x) => x.id === e.id)!;
      expect(after3.reviewState).toBe("provisional");
      expect(parts3.every((k) => after3.claimIds.includes(k.id))).toBe(true);
    }
    fs.rmSync(root3, { recursive: true, force: true });
    // The same id with other words is not the claim that evidence was read against: no anchor from the ledger.
    const root2 = setup();
    const rewritten = { ...byEvidence, statement: `${byEvidence.statement} And a proposition the evidence never met.` };
    const out2 = await settleRecords(c.record.slug, { ...claimSettlement, originals: { sources: [], evidence: [], claims: [rewritten] } }, { root: root2, deps: { cases: () => [c], judge, split: async () => parts, fetch: fetchClaim } });
    expect(out2).toMatchObject({ outcome: "completed", promoted: 0, refused: 1 });
    expect(fs.readFileSync(path.join(root2, "proposals", out2.runId, "verification.md"), "utf8")).toContain(`claim ${byEvidence.id} — no source anchor and no accepted evidence record cites it`);
    fs.rmSync(root2, { recursive: true, force: true });
  });
  it("an agenda item whose every claim is refused retires, its claims kept as the record of what it served", async () => {
    const root = setup();
    const rFile = path.join(root, "content", "cases", c.dir, "research.yaml");
    const research = parse(fs.readFileSync(rFile, "utf8")) as { id: string; claimIds: string[]; status?: string; statusNote?: string }[];
    research[0] = { ...research[0], claimIds: [claim.id] };
    delete research[0].status;
    delete research[0].statusNote;
    fs.writeFileSync(rFile, stringify(research, { lineWidth: 0, aliasDuplicateObjects: false }));
    const cMod = { ...c, research: c.research.map((r, i) => (i === 0 ? { ...r, claimIds: [claim.id], status: undefined, statusNote: undefined } : r)) } as unknown as LoadedCase;
    const judge = async (rec: unknown) => ((rec as { statement: string }).statement === claim.statement ? { ...ok, statementSupported: false, reason: "the anchor does not state it" } : { ...ok, reason: "fine" });
    const out = await settleRecords(c.record.slug, claimSettlement, { root, deps: { cases: () => [cMod], judge, split: async () => parts, fetch: fetchClaim } });
    expect(out).toMatchObject({ outcome: "completed", refused: 1 });
    const after = (parse(fs.readFileSync(rFile, "utf8")) as { id: string; claimIds: string[]; status?: string; statusNote?: string; statusBy?: string }[])[0];
    expect(after.status).toBe("retired");
    expect(after.claimIds).toEqual([claim.id]);
    expect(after.statusNote).toMatch(new RegExp(`^Retired at the answer's re-reading \\d{4}-\\d{2}-\\d{2} \\(${out.runId}\\): every claim it served was refused \\(${claim.id}\\)$`));
    expect(after.statusBy).toBe(out.runId);
    expect(fs.readFileSync(path.join(root, "proposals", out.runId, "verification.md"), "utf8")).toContain(`${after.id}: every claim it served was refused; retired`);
    fs.rmSync(root, { recursive: true, force: true });
    // An item already retired is a frozen record: its claims, status and provenance stand.
    const root3 = setup();
    const rFile3 = path.join(root3, "content", "cases", c.dir, "research.yaml");
    const research3 = parse(fs.readFileSync(rFile3, "utf8")) as { id: string; claimIds: string[]; status?: string; statusNote?: string; statusBy?: string; statusDate?: string }[];
    research3[0] = { ...research3[0], claimIds: [claim.id], status: "retired", statusNote: "settled long ago", statusBy: "an-earlier-run", statusDate: "2026-09-01" };
    fs.writeFileSync(rFile3, stringify(research3, { lineWidth: 0, aliasDuplicateObjects: false }));
    const frozenBefore = (parse(fs.readFileSync(rFile3, "utf8")) as unknown[])[0];
    const cFrozen = { ...c, research: c.research.map((r, i) => (i === 0 ? { ...r, claimIds: [claim.id], status: "retired", statusNote: "settled long ago", statusBy: "an-earlier-run", statusDate: "2026-09-01" } : r)) } as unknown as LoadedCase;
    const out3 = await settleRecords(c.record.slug, claimSettlement, { root: root3, deps: { cases: () => [cFrozen], judge, split: async () => parts, fetch: fetchClaim } });
    expect(out3).toMatchObject({ outcome: "completed", refused: 1 });
    expect((parse(fs.readFileSync(rFile3, "utf8")) as unknown[])[0]).toEqual(frozenBefore);
    fs.rmSync(root3, { recursive: true, force: true });
  });
  it("a run that fails half-way rolls its ledger writes back and says so", async () => {
    const root = setup();
    const dir = path.join(root, "content", "cases", c.dir);
    const before = Object.fromEntries(["evidence.yaml", "dispositions.yaml", "history.yaml"].map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));
    fs.chmodSync(path.join(dir, "history.yaml"), 0o444);
    const out = await settleRecords(c.record.slug, settlement("anything"), { root, deps: { cases: () => [c], judge: verdict(), fetch: fetchOk } });
    fs.chmodSync(path.join(dir, "history.yaml"), 0o644);
    expect(out.outcome).toBe("failed");
    expect(out.reason).toMatch(/EACCES|permission denied/);
    expect(out.reason).toContain("; the ledger writes of this run were rolled back");
    for (const [f, text] of Object.entries(before)) expect(fs.readFileSync(path.join(dir, f), "utf8")).toBe(text);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("a refusal's split note names only the parts that were appended", () => {
    expect(splitNoteFor("not one observation (two findings); split into VASO-E087, VASO-E088", new Set(["VASO-E088"]))).toBe("not one observation (two findings); split into VASO-E088 (1 further part(s) not appended: every claim cited was refused)");
    expect(splitNoteFor("not atomic (x); split into VASO-C090, VASO-C091", new Set())).toBe("not atomic (x); split into nothing that survived (2 further part(s) not appended: every claim cited was refused)");
    expect(splitNoteFor("not atomic (x); split into VASO-C090, VASO-C091", new Set(["VASO-C090", "VASO-C091"]))).toBe("not atomic (x); split into VASO-C090, VASO-C091");
    expect(splitNoteFor("second reader rejected (relevant): off the point", new Set())).toBe("second reader rejected (relevant): off the point");
  });
  it("the answer does not re-tell the edition after a re-reading that failed and rolled back", async () => {
    const root = setup();
    const dir = path.join(root, "content", "cases", c.dir);
    fs.chmodSync(path.join(dir, "history.yaml"), 0o444);
    const branch = "chain/2099-01-01-99";
    const gh = ghFor(99, { files: [`content/cases/${c.dir}/evidence.yaml`, "proposals/x/run.yaml"], head: branch, comments: [{ login: ARBITER_LOGIN, body: blob([{ seat: "GPT-5.6 Sol (OpenAI)", vote: "violates", rules: ["§3.2"], reasoning: `${live.id} is not one observation.` }]) }] });
    const out = await runAnswer(99, { root, gh, branch, deps: { cases: () => [c], judge: verdict(), fetch: fetchOk, edit: (() => { throw new Error("the edition must not run"); }) as never } });
    fs.chmodSync(path.join(dir, "history.yaml"), 0o644);
    expect(out.classified.records).toEqual([live.id]);
    expect(out.records?.outcome).toBe("failed");
    expect(out.edition).toBeNull();
    expect(out.account).toContain("the re-reading failed and its ledger writes were rolled back; the edition was not run");
    fs.rmSync(root, { recursive: true, force: true });
  });
});
