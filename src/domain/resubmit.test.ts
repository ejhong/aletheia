import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import type { Disposition, Proposal } from "./intake.ts";
import { textKey } from "./keys.ts";
import { getCaseBySlug } from "./load.ts";
import type { LoadedCase } from "./schema.ts";
import { blockedAtVerification, nextAction } from "./schedule.ts";
import { readProposal } from "./runs.ts";
import { buildResubmission, keysOf, planResubmission, resubmitBlocked } from "../pipeline/resubmit.ts";
import { runReverify } from "../pipeline/reverify.ts";
import { appendDispositions, writeProposal } from "../pipeline/store.ts";
import type { VerifyOptions, VerifyOutcome } from "../pipeline/verify.ts";

/** Records that verification blocked — never entered, their proposal still holding them — are proposed again under
 *  fresh ids and read by the ordinary verify verb; legacy title-keyed rows are settled beside them; the scheduler asks
 *  for the pass. Dates are pinned to 2099 so the content the fixtures borrow never overtakes them. */

const DRAFT = "2099-01-01-draft-megalithic-casting-000000";
const REF = `proposals/${DRAFT}`;
const VERIFIED_BY = "2099-01-01-verify-megalithic-casting-000100";
const origin = { ref: "report 2099-01-01-report-megalithic-casting-000000", extractedBy: "drafter-model", runId: DRAFT, date: "2099-01-01" };
const ev = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, title: `Evidence ${id}`, claimIds: ["GEO-C900"], sourceId: "SRC-BOOK-2099", direction: "supports", strength: "weak", sourceStatement: `The text says "${id} holds"`, limitations: [], reviewState: "ai_extracted", origin, ...extra }) as never;
const cl = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, statement: `Claim ${id} states one specific proposition.`, theme: "casting", rung: "observation", parentClaimIds: [], dependsOnClaimIds: [], reviewState: "ai_extracted", origin, sourceAnchor: { locator: "[p. 1]", quote: `${id} holds`, sourceId: "SRC-BOOK-2099" }, ...extra }) as never;
const src = (id: string) => ({ id, title: `Source ${id}`, sourceType: "book", verification: "unverified", authors: [], reliabilityNotes: [], background: false, url: `https://example.org/${id}` }) as never;
const row = (over: Partial<Disposition>): Disposition =>
  ({ key: "text:x", kind: "evidence", disposition: "blocked", reason: "the Internet Archive did not serve the OCR text", route: "obtain the OCR text and re-run verify", observed: "x", by: VERIFIED_BY, date: "2099-01-01", proposal: REF, ...over }) as Disposition;

const oldProposal = (c: LoadedCase): Proposal => ({
  runId: DRAFT, date: "2099-01-01", case: c.record.slug, producer: "draft", model: "drafter-model", promptVersion: "draft-v9", basis: { ledgerHash: c.ledgerHash },
  rationale: "The first pass read the book and proposed these.", report: `proposals/2099-01-01-report-megalithic-casting-000000/report.md`,
  adds: {
    sources: [src("SRC-BOOK-2099")],
    claims: [cl("GEO-C900"), cl("GEO-C901"), cl("GEO-C902")],
    evidence: [ev("GEO-E900"), ev("GEO-E901", { claimIds: ["GEO-C901", "GEO-C902"] }), ev("GEO-E902", { claimIds: ["GEO-C902"] }), ev("GEO-E903", { sourceId: "SRC-NEVER" })],
    research: [], images: [],
  },
  corrections: [], dispositions: [],
});

/** The rows verify wrote on the first pass: the source entered, C901 entered as its own id, C902 was refused, the rest blocked — E900 under the legacy title-only key. */
const firstPassRows = (): Disposition[] => [
  row({ key: "url:example.org/SRC-BOOK-2099", kind: "source", disposition: "in", as: "SRC-BOOK-2099", observed: "Source SRC-BOOK-2099", reason: undefined }),
  row({ key: textKey("Claim GEO-C901 states one specific proposition.")!, kind: "claim", disposition: "in", as: "GEO-C801", observed: "Claim GEO-C901 states one specific proposition.", reason: undefined }),
  row({ key: textKey("Claim GEO-C902 states one specific proposition.")!, kind: "claim", disposition: "failed", reason: "second reader rejected the anchor", observed: "Claim GEO-C902 states one specific proposition." }),
  row({ key: textKey("Claim GEO-C900 states one specific proposition.")!, kind: "claim", observed: "Claim GEO-C900 states one specific proposition." }),
  row({ key: textKey("Evidence GEO-E900")!, observed: "Evidence GEO-E900" }),
  row({ key: textKey(`Evidence GEO-E901 The text says "GEO-E901 holds"`)!, observed: "Evidence GEO-E901" }),
  row({ key: textKey("Evidence GEO-E902")!, observed: "Evidence GEO-E902" }),
  row({ key: textKey("Evidence GEO-E903")!, observed: "Evidence GEO-E903" }),
];

/** The case with the first pass's rows as its whole disposition ledger (the real case's rows name proposals that are not under the test root), the entered claim under its ledger id GEO-C801, the entered source. */
const withRows = (c: LoadedCase, rows: Disposition[]): LoadedCase => ({ ...c, claims: [...c.claims, cl("GEO-C801", { origin: { ...origin, runId: VERIFIED_BY } })], sources: [...c.sources, src("SRC-BOOK-2099")], dispositions: rows });

describe("keysOf", () => {
  it("names every key a record may be filed under: title and statement, then the title alone, for evidence; identifier then title for a source", () => {
    expect(keysOf("evidence", ev("GEO-E900"))).toEqual([textKey(`Evidence GEO-E900 The text says "GEO-E900 holds"`), textKey("Evidence GEO-E900")]);
    expect(keysOf("source", src("SRC-BOOK-2099"))).toEqual(["url:example.org/SRC-BOOK-2099", "title:source src book 2099", textKey("Source SRC-BOOK-2099")]);
    expect(keysOf("claim", cl("GEO-C900"))).toEqual([textKey("Claim GEO-C900 states one specific proposition.")]);
  });
});

describe("planResubmission", () => {
  const c = getCaseBySlug("megalithic-casting");
  it("takes the blocked records a proposal still holds, under either key form, and leaves settled ones and missing proposals alone", () => {
    const rows = [...firstPassRows(), row({ key: "text:a lead nobody opened", kind: "evidence", by: DRAFT, proposal: "proposals/2099-01-01-draft-gone-000000", observed: "a lead" })];
    const plan = planResubmission({ dispositions: rows }, (ref) => (ref === REF ? oldProposal(c) : null));
    expect(plan.notes).toEqual(["proposals/2099-01-01-draft-gone-000000: blocked rows name it but it is not on disk; nothing to re-submit"]);
    const items = plan.batches.get(REF)!;
    expect(items.map((i) => `${i.kind}:${i.record.id}`)).toEqual(["claim:GEO-C900", "evidence:GEO-E900", "evidence:GEO-E901", "evidence:GEO-E902", "evidence:GEO-E903"]);
    expect(items.find((i) => i.record.id === "GEO-E900")!.row.key).toBe(textKey("Evidence GEO-E900"));
  });
  it("a record admitted since under its canonical key is settled even when its legacy row still says blocked", () => {
    const rows = [...firstPassRows(), row({ key: textKey(`Evidence GEO-E900 The text says "GEO-E900 holds"`)!, disposition: "in", as: "GEO-E010", observed: "Evidence GEO-E900", reason: undefined, date: "2099-01-02" })];
    const plan = planResubmission({ dispositions: rows }, () => oldProposal(c));
    expect(plan.batches.get(REF)!.map((i) => i.record.id)).not.toContain("GEO-E900");
  });
});

describe("buildResubmission", () => {
  const c = getCaseBySlug("megalithic-casting");
  it("re-keys against the ledger, cites entered claims by their ledger ids, drops refused ones, skips what cannot enter, and keeps the drafter's stamps with the lineage", () => {
    const loaded = withRows(c, firstPassRows());
    const items = planResubmission(loaded, () => oldProposal(c)).batches.get(REF)!;
    const built = buildResubmission(loaded, REF, oldProposal(c), items, { runId: "2099-01-02-reverify-megalithic-casting-000000", date: "2099-01-02" });
    const p = built.proposal;
    expect(p.producer).toBe("reverify");
    // Written by code, under its own protocol; the drafter stays on each record's origin.
    expect(p.model).toBeNull();
    expect(p.promptVersion).toBe("resubmit-v1");
    expect(p.basis.ledgerHash).toBe(loaded.ledgerHash);
    expect(p.report).toMatch(/re-submission 2099-01-02-reverify-megalithic-casting-000000 of records blocked at verification/);
    expect(p.adds.sources).toEqual([]);
    // The claim gets the ledger's next free id; nothing in the ledger or the batch collides.
    const [claim] = p.adds.claims;
    expect(claim.id).toMatch(/^GEO-C\d{3}$/);
    expect(c.claims.some((k) => k.id === claim.id)).toBe(false);
    expect(claim.origin).toEqual({ ...origin, ref: `${origin.ref}; re-submitted from ${REF} (was GEO-C900; blocked 2099-01-01: the Internet Archive did not serve the OCR text)` });
    expect(built.renamed).toContainEqual({ kind: "claim", from: "GEO-C900", to: claim.id });
    const ids = Object.fromEntries(p.adds.evidence.map((e) => [e.origin.ref.match(/was (GEO-E\d+)/)![1], e]));
    expect(Object.keys(ids).sort()).toEqual(["GEO-E900", "GEO-E901"]);
    expect(ids["GEO-E900"].claimIds).toEqual([claim.id]);
    expect(ids["GEO-E901"].claimIds).toEqual(["GEO-C801"]);
    expect(new Set(p.adds.evidence.map((e) => e.id)).size).toBe(2);
    expect(p.adds.evidence.every((e) => /^GEO-E\d{3}$/.test(e.id) && !c.evidence.some((x) => x.id === e.id))).toBe(true);
    expect(built.skipped.map((s) => `${s.id}: ${s.reason}`)).toEqual([
      "GEO-E902: none of the claims it cited (GEO-C902) entered or is re-submitted",
      "GEO-E903: its source SRC-NEVER never entered",
    ]);
  });
});

describe("resubmitBlocked and the reverify verb", () => {
  const c = getCaseBySlug("megalithic-casting");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-resubmit-"));
  const caseDir = path.join(root, "content", "cases", c.dir);
  fs.mkdirSync(caseDir, { recursive: true });
  fs.writeFileSync(path.join(caseDir, "dispositions.yaml"), "[]\n");
  const loaded = withRows(c, firstPassRows());
  writeProposal(oldProposal(c), root);
  const seen: string[] = [];
  /** A verify that admits everything it is handed and writes the rows verify would. */
  const verify = async (runId: string, opts: VerifyOptions = {}): Promise<VerifyOutcome> => {
    const p = readProposal(runId, opts.root)!;
    seen.push(runId);
    const rows: Disposition[] = [
      ...p.adds.claims.map((k) => ({ key: textKey(k.statement)!, kind: "claim" as const, disposition: "in" as const, as: k.id, observed: k.statement, by: "2099-01-02-verify-megalithic-casting-000200", date: "2099-01-02", proposal: `proposals/${runId}` })),
      ...p.adds.evidence.map((e) => ({ key: textKey(`${e.title} ${e.sourceStatement}`)!, kind: "evidence" as const, disposition: "in" as const, as: e.id, observed: e.title, by: "2099-01-02-verify-megalithic-casting-000200", date: "2099-01-02", proposal: `proposals/${runId}` })),
    ];
    appendDispositions(c.dir, rows, opts.root);
    return { outcome: "completed", runId: "2099-01-02-verify-megalithic-casting-000200", reason: "wrote everything", accepted: { sources: 0, evidence: p.adds.evidence.length, claims: p.adds.claims.length, research: 0 }, rejected: 0 };
  };
  it("writes the re-submission proposal under its own run, hands it to verify, settles the legacy rows and refuses what could not be re-submitted", async () => {
    const out = await resubmitBlocked(c.record.slug, { root, now: () => new Date("2099-01-02T00:00:00Z"), deps: { cases: () => [loaded], verify } });
    expect(out.notes).toEqual([]);
    expect(out.runs).toHaveLength(1);
    const [r] = out.runs;
    expect(seen).toEqual([r.runId]);
    expect(r).toMatchObject({ from: REF, verifyRunId: "2099-01-02-verify-megalithic-casting-000200", records: 3, skipped: 2, admitted: 3, rejected: 0, outcome: "completed" });
    expect(r.reason).toMatch(/re-submitted 3 record\(s\) from proposals\/2099-01-01-draft-megalithic-casting-000000 as verify 2099-01-02-verify-megalithic-casting-000200: admitted 3, rejected 0; 1 legacy row\(s\) settled/);
    expect(out.admitted).toBe(3);
    const written = readProposal(r.runId, root)!;
    expect(written.producer).toBe("reverify");
    expect(written.adds.claims).toHaveLength(1);
    expect(written.adds.evidence).toHaveLength(2);
    expect(fs.existsSync(path.join(root, "proposals", r.runId, "resubmission.md"))).toBe(true);
    const runRecord = parseYaml(fs.readFileSync(path.join(root, "proposals", r.runId, "run.yaml"), "utf8")) as { model: string | null; promptVersion: string };
    expect(runRecord).toMatchObject({ model: null, promptVersion: "resubmit-v1" });
    const rows = parseYaml(fs.readFileSync(path.join(caseDir, "dispositions.yaml"), "utf8")) as Disposition[];
    // E900's legacy title-only row is settled with a mirror of verify's admission; E901 was already canonically keyed.
    const legacy = rows.find((x) => x.key === textKey("Evidence GEO-E900") && x.by === r.runId)!;
    expect(legacy).toMatchObject({ disposition: "in", kind: "evidence", proposal: REF, date: "2099-01-02" });
    expect(legacy.as).toMatch(/^GEO-E\d{3}$/);
    expect(legacy.reason).toMatch(/^settled with the row under text:/);
    expect(rows.filter((x) => x.by === r.runId && x.disposition === "in")).toHaveLength(1);
    // What could not be re-submitted is refused under its own key, so it is not planned again every pass.
    const refused = rows.filter((x) => x.by === r.runId && x.disposition === "failed").map((x) => `${x.key}|${x.reason}`);
    expect(refused).toEqual([
      `${textKey(`Evidence GEO-E902 The text says "GEO-E902 holds"`)}|not re-submitted (${r.runId}): none of the claims it cited (GEO-C902) entered or is re-submitted`,
      `${textKey(`Evidence GEO-E903 The text says "GEO-E903 holds"`)}|not re-submitted (${r.runId}): its source SRC-NEVER never entered`,
    ]);
  });
  it("a dry run plans and writes nothing; the verb reports the re-submission beside the provisional pass", async () => {
    const root2 = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-resubmit-dry-"));
    fs.mkdirSync(path.join(root2, "content", "cases", c.dir), { recursive: true });
    writeProposal(oldProposal(c), root2);
    const before = fs.readdirSync(path.join(root2, "proposals")).length;
    const out = await runReverify(c.record.slug, { root: root2, dryRun: true, now: () => new Date("2099-01-03T00:00:00Z"), deps: { cases: () => [loaded] } });
    expect(out.outcome).toBe("dry-run");
    expect(out.promoted).toBe(0);
    expect(out.resubmitted).toHaveLength(1);
    expect(out.resubmitted![0]).toMatchObject({ outcome: "dry-run", records: 3, skipped: 2, admitted: 0 });
    expect(out.reason).toMatch(/no provisional records; would re-submit 3 record\(s\) from proposals\/2099-01-01-draft-megalithic-casting-000000 \(2 skipped\); nothing written/);
    // Only run records were added: no proposal.yaml for the re-submission, no ledger rows.
    const dirs = fs.readdirSync(path.join(root2, "proposals"));
    expect(dirs.length).toBe(before + 2);
    for (const d of dirs) if (d !== DRAFT) expect(fs.existsSync(path.join(root2, "proposals", d, "proposal.yaml"))).toBe(false);
    expect(fs.existsSync(path.join(root2, "content", "cases", c.dir, "dispositions.yaml"))).toBe(false);
    fs.rmSync(root2, { recursive: true, force: true });
  });
});

describe("the scheduler counts records blocked at verification", () => {
  const c = getCaseBySlug("megalithic-casting");
  it("asks for a re-verify when a case holds them, names the count, and treats a pass that admitted something as not empty", () => {
    const loaded = withRows(c, firstPassRows());
    expect(blockedAtVerification(loaded)).toBe(5);
    expect(blockedAtVerification({ dispositions: [row({ by: DRAFT })] })).toBe(0);
    // Rule 3b: after the editions owed and the panels due, before a new report — so a case with a stale panel is checked first.
    const pick = nextAction([loaded], [], "2099-01-02");
    if (pick.verb === "reverify") expect(pick.reason).toMatch(/5 record\(s\) blocked at verification await re-submission/);
    else expect(["edition", "check"]).toContain(pick.verb);
    expect(nextAction([{ ...loaded, dispositions: [] }], [], "2099-01-02").verb).not.toBe("reverify");
    const run = (notes: string, date = "2099-01-02") => ({ runId: `${date}-reverify-megalithic-casting-000000`, verb: "reverify" as const, case: c.record.slug, date, model: "m", promptVersion: "verify-v6", inputHash: null, outcome: "completed" as const, cost: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 }, notes });
    const asks = (notes: string, today: string) => { const p = nextAction([loaded], [run(notes)], today); return p.verb === "reverify" ? true : (expect(["edition", "check"]).toContain(p.verb), null); };
    // A pass that admitted something keeps the seven-day cadence; one that admitted nothing doubles it.
    expect(asks("re-submitted 3 record(s) from proposals/x as verify y: admitted 3, rejected 0", "2099-01-09")).not.toBe(false);
    expect(nextAction([loaded], [run("re-submitted 3 record(s) from proposals/x as verify y: admitted 0, rejected 3")], "2099-01-09").verb).not.toBe("reverify");
    expect(asks("re-submitted 3 record(s) from proposals/x as verify y: admitted 0, rejected 3", "2099-01-16")).not.toBe(false);
  });
});
