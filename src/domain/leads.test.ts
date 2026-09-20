import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Disposition } from "./intake.ts";
import { blockedLeads, isProducerBlocked } from "./leads.ts";
import { getCaseBySlug } from "./load.ts";
import { nextAction } from "./schedule.ts";
import type { LoadedCase } from "./schema.ts";
import { composeLeadsReport, leadQuery, rankHits, runLeads, settleLeads, type LeadOutcome } from "../pipeline/leads.ts";
import type { IndexedResult } from "../pipeline/resolve.ts";
import { retrievalTargets } from "../pipeline/draft.ts";

/** The leads pass: works a producer named and could not open are asked of the indexes, oldest first; what agrees is
 *  resolved, what may be the work is a candidate, the rest is said to be unresolved; the drafter reads the report as
 *  any other; verification settles a lead's own row by locator. Dates are pinned to 2099 so live content never
 *  overtakes the fixtures. */

const row = (over: Partial<Disposition>): Disposition =>
  ({ key: "text:x", kind: "source", disposition: "blocked", reason: "no text", observed: "x", by: "2099-01-01-draft-megalithic-casting-000000", date: "2099-01-01", ...over }) as Disposition;

describe("which rows are leads", () => {
  it("a producer's blocked row is a lead; a verifier's blocked row, a settled row, a research row are not; the latest row per key decides, oldest lead first", () => {
    expect(isProducerBlocked(row({}))).toBe(true);
    expect(isProducerBlocked(row({ by: "2099-01-01-inbox-megalithic-casting-000000" }))).toBe(true);
    expect(isProducerBlocked(row({ by: "2099-01-01-verify-megalithic-casting-000000" }))).toBe(false);
    expect(isProducerBlocked(row({ by: "2099-01-01-reverify-megalithic-casting-000000" }))).toBe(false);
    expect(isProducerBlocked(row({ disposition: "failed" }))).toBe(false);
    expect(isProducerBlocked(row({ kind: "research" }))).toBe(false);
    const rows = [
      row({ key: "text:b", date: "2099-01-03" }),
      row({ key: "text:a", date: "2099-01-02" }),
      row({ key: "text:a", date: "2099-01-04", disposition: "in", as: "SRC-X", by: "2099-01-04-verify-megalithic-casting-000000" }),
      row({ key: "text:c", date: "2099-01-01" }),
    ];
    expect(blockedLeads({ dispositions: rows }).map((r) => r.key)).toEqual(["text:c", "text:b"]);
  });
});

describe("leadQuery", () => {
  it("reads the work out of a drafter's row as producers write it: the quoted lead, its parenthetical authors and year, and the tail that says why it was not opened", () => {
    const q = leadQuery(row({ key: "text:report fascia densification research stecco", observed: "Report: 'Fascia densification research (Stecco, Carla) — no OpenAlex result close enough'. Essay p. 3 attributes the distinction to Carla Stecco's group in Padua.", reopenIf: "A primary Stecco-group paper is retrieved.", route: "Search the Padua group's publications." }));
    expect(q.title).toBe("Fascia densification research");
    expect(q.authors).toEqual(["Carla Stecco"]);
    expect(q.year).toBeNull();
    expect(q.query).toBe("Fascia densification research Carla Stecco");
    expect(q.firstBlocked).toEqual({ date: "2099-01-01", by: "2099-01-01-draft-megalithic-casting-000000", reopenIf: "A primary Stecco-group paper is retrieved.", route: "Search the Padua group's publications." });
    const dated = leadQuery(row({ observed: "Report: 'Tweet thread on vasocomputation and Buddhist enlightenment (Johnson, Michael Edward, 2024) — no OpenAlex result'. Essay p. 11 shows a screenshot." }));
    expect(dated.title).toBe("Tweet thread on vasocomputation and Buddhist enlightenment");
    expect(dated.authors).toEqual(["Michael Edward Johnson"]);
    expect(dated.year).toBe(2024);
    const bare = leadQuery(row({ observed: "Engelbach 1922, The Aswan obelisk, with some remarks on the ancient engineering. Six records were blocked at verification." }));
    expect(bare.title).toBe("Engelbach 1922, The Aswan obelisk, with some remarks on the ancient engineering.");
    expect(leadQuery(row({ observed: "short" })).title).toBeNull();
  });
});

const hit = (over: Partial<IndexedResult>): IndexedResult =>
  ({ title: "t", publication_year: 2013, doi: null, authorships: [], open_access: { oa_url: null }, url: "https://example.org/x", identifier: "url:example.org/x", via: "OpenAlex", ...over }) as IndexedResult;

describe("rankHits", () => {
  const lead = leadQuery(row({ observed: "Report: 'Fascial components of the myofascial pain syndrome (Stecco, 2013) — no OpenAlex result close enough'." }));
  it("resolves a hit that agrees on the title, the year and an author, says what agreed, and lists near titles as candidates", () => {
    const hits = [
      hit({ title: "Fascial components of the myofascial pain syndrome", publication_year: 2013, authorships: [{ author: { display_name: "Antonio Stecco" } }], url: "https://example.org/stecco2013.pdf", identifier: "doi:10.1007/s11916-013-0352-9", doi: "https://doi.org/10.1007/s11916-013-0352-9", via: "Semantic Scholar" }),
      hit({ title: "Fascial densification: a hyaluronan story", publication_year: 2014, authorships: [{ author: { display_name: "Carla Stecco" } }], url: "https://example.org/dens.pdf", identifier: "url:example.org/dens.pdf" }),
      hit({ title: "Something about knees", publication_year: 2013, url: "https://example.org/knees", identifier: "url:example.org/knees" }),
    ];
    const r = rankHits(lead, hits);
    expect(r.resolved?.url).toBe("https://example.org/stecco2013.pdf");
    expect(r.resolved?.doi).toBe("10.1007/s11916-013-0352-9");
    expect(r.resolved?.checks).toEqual(["title containment 1 (at or above the 0.7 threshold)", "year 2013 exact", 'author surname "stecco" found in the index\'s "Antonio Stecco"']);
    expect(r.candidates.map((c) => c.url)).toEqual(["https://example.org/dens.pdf"]);
  });
  it("a lead that gave a year the hit contradicts is not resolved, only a candidate at best", () => {
    const r = rankHits(lead, [hit({ title: "Fascial components of the myofascial pain syndrome", publication_year: 2001, authorships: [{ author: { display_name: "A. Stecco" } }] })]);
    expect(r.resolved).toBeNull();
    expect(r.candidates).toHaveLength(1);
  });
});

describe("runLeads", () => {
  const c = getCaseBySlug("megalithic-casting");
  const leads = [
    row({ key: "text:report fascial components stecco 2013", observed: "Report: 'Fascial components of the myofascial pain syndrome (Stecco, 2013) — no OpenAlex result close enough'.", date: "2099-01-01", reopenIf: "the paper is retrieved", route: "Springer" }),
    row({ key: "text:report cortical smudging moseley", observed: "Report: 'Cortical smudging in chronic pain (Moseley) — no OpenAlex result close enough'.", date: "2099-01-02" }),
    row({ key: "text:nothing", observed: "short", date: "2099-01-03" }),
  ];
  const loaded = { ...c, dispositions: leads } as LoadedCase;
  const search = async (q: string): Promise<IndexedResult[]> =>
    /Fascial/.test(q) ? [hit({ title: "Fascial components of the myofascial pain syndrome", publication_year: 2013, authorships: [{ author: { display_name: "Antonio Stecco" } }], url: "https://example.org/stecco2013.pdf", identifier: "doi:10.1007/s11916-013-0352-9", doi: "https://doi.org/10.1007/s11916-013-0352-9", via: "Semantic Scholar" })] : [];
  const fetch = (async (t: { url: string }) => ({ url: t.url, ok: true, status: 200, contentType: "application/pdf", text: "The fascial components … ".repeat(40), via: "open-access PDF" })) as never;
  it("tries the open leads oldest first, resolves what agrees, says what did not, writes a report the drafter reads and a leads file, and reports its counts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-leads-"));
    const out = await runLeads(c.record.slug, { root, now: undefined, deps: { cases: () => [loaded], search, fetch } } as never);
    expect(out.outcome).toBe("completed");
    expect(out).toMatchObject({ tried: 3, resolved: 1, opened: 1, candidates: 0, unresolved: 2 });
    expect(out.reason).toBe("leads: tried 3 of 3, resolved 1, opened 1, candidates 0, unresolved 2");
    const report = fs.readFileSync(out.reportFile!, "utf8");
    expect(report).toMatch(/^<!-- Leads reopened/);
    expect(report).toContain("## Lead 1: Report: 'Fascial components of the myofascial pain syndrome (Stecco, 2013) — no OpenAlex result close enough'.");
    expect(report).toContain("- key: `text:report fascial components stecco 2013` (source)");
    expect(report).toContain("### Resolved");
    expect(report).toMatch(/→ https:\/\/example\.org\/stecco2013\.pdf — Semantic Scholar; title containment 1 .*; text retrieved \(\d+ characters, open-access PDF\)/);
    expect(report).toContain("### Still unresolved");
    expect(report).toContain("- the indexes returned nothing");
    expect(report).toContain("- the row names no work to search for");
    // The drafter's retrieval targets are the documents the pass opened.
    expect(retrievalTargets(report).map((t) => t.url)).toEqual(["https://example.org/stecco2013.pdf"]);
    const json = JSON.parse(fs.readFileSync(path.join(root, "proposals", out.runId, "leads.json"), "utf8")) as LeadOutcome[];
    expect(json.map((o) => o.key)).toEqual(["text:report fascial components stecco 2013", "text:report cortical smudging moseley", "text:nothing"]);
    expect(fs.existsSync(path.join(root, "proposals", out.runId, "run.yaml"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("rests when the case has no open leads, and a dry run names what it would try without searching", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-leads-dry-"));
    const none = await runLeads(c.record.slug, { root, deps: { cases: () => [{ ...c, dispositions: [] } as LoadedCase], search } });
    expect(none.outcome).toBe("rested");
    const dry = await runLeads(c.record.slug, { root, dryRun: true, deps: { cases: () => [loaded], search: async () => { throw new Error("must not search"); } } });
    expect(dry.outcome).toBe("dry-run");
    expect(dry.reason).toMatch(/would try 3 of 3 open lead\(s\)/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("settleLeads", () => {
  it("writes a lead's row `in` when an admitted source is the document resolved or offered for it, by URL or DOI, and nothing otherwise", () => {
    const outcomes = [
      { key: "text:lead a", kind: "source", observed: "Report: 'A'.", title: "A", authors: [], year: null, query: "A", firstBlocked: { date: "2099-01-01", by: "d" }, resolved: { title: "A paper", authors: [], year: 2013, url: "https://example.org/a.pdf", doi: "10.1007/a-paper", identifier: "doi:10.1007/a-paper", via: "OpenAlex", similarity: 1, checks: ["title containment 1 (at or above the 0.7 threshold)"], text: { chars: 100, via: "pdf" } }, candidates: [] },
      { key: "text:lead b", kind: "source", observed: "Report: 'B'.", title: "B", authors: [], year: null, query: "B", firstBlocked: { date: "2099-01-01", by: "d" }, resolved: null, candidates: [{ title: "B maybe", authors: [], year: null, url: "https://example.org/b", doi: null, identifier: "url:example.org/b", via: "Internet Archive", similarity: 0.5, checks: ["title containment 0.5 (below the 0.7 threshold)"] }] },
      { key: "text:lead c", kind: "source", observed: "Report: 'C'.", title: "C", authors: [], year: null, query: "C", firstBlocked: { date: "2099-01-01", by: "d" }, resolved: null, candidates: [], unresolved: "nothing" },
    ] as unknown as LeadOutcome[];
    const admitted = [
      { id: "SRC-A-2013", url: "https://doi.org/10.1007/a-paper", identifier: "doi:10.1007/a-paper" },
      { id: "SRC-B-2000", url: "https://www.example.org/b/", identifier: "" },
      { id: "SRC-Z", url: "https://example.org/z", identifier: "" },
    ];
    const rows = settleLeads(outcomes, admitted as never, { runId: "2099-01-02-verify-megalithic-casting-000000", date: "2099-01-02", proposal: "proposals/2099-01-02-draft-megalithic-casting-000000", leadsRunId: "2099-01-02-leads-megalithic-casting-000000" });
    expect(rows.map((r) => `${r.key} → ${r.disposition}:${r.as}`)).toEqual(["text:lead a → in:SRC-A-2013", "text:lead b → in:SRC-B-2000"]);
    expect(rows[0].reason).toMatch(/^the lead, reopened by 2099-01-02-leads-megalithic-casting-000000, resolved to this source \(OpenAlex; title containment 1/);
  });
});

describe("the scheduler asks for a leads pass", () => {
  const c = getCaseBySlug("megalithic-casting");
  const leads = [1, 2, 3].map((i) => row({ key: `text:lead ${i}`, observed: `Report: 'Lead ${i} (Someone, 2001) — no OpenAlex result'.`, date: "2099-01-01" }));
  const loaded = { ...c, dispositions: leads } as LoadedCase;
  const run = (notes: string, date = "2099-01-02") => ({ runId: `${date}-leads-megalithic-casting-000000`, verb: "leads" as const, case: c.record.slug, date, model: null, promptVersion: "leads-v1", inputHash: null, outcome: "completed" as const, cost: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 }, notes });
  it("when a case holds three or more open leads, after the editions owed and the panels due, on a cadence that doubles after each pass that opened nothing", () => {
    const pick = nextAction([loaded], [], "2099-01-02");
    if (pick.verb === "leads") expect(pick.reason).toMatch(/^3 lead\(s\) a producer named and could not open await the indexes$/);
    else expect(["edition", "check"]).toContain(pick.verb);
    expect(nextAction([{ ...loaded, dispositions: leads.slice(0, 2) }], [], "2099-01-02").verb).not.toBe("leads");
    // A pass that opened something keeps the seven-day cadence; one that opened nothing doubles it.
    expect(nextAction([loaded], [run("leads: tried 3 of 3, resolved 0, opened 0, candidates 0, unresolved 3")], "2099-01-09").verb).not.toBe("leads");
    const later = nextAction([loaded], [run("leads: tried 3 of 3, resolved 0, opened 0, candidates 0, unresolved 3")], "2099-01-16");
    if (later.verb === "leads") expect(later.reason).toMatch(/1 pass\(es\) opened nothing, so the cadence is 14 days/);
    else expect(["edition", "check"]).toContain(later.verb);
    // A pass that opened something is half done until drafted (rule 1 comes first); once drafted, the cadence is seven days.
    const soon = nextAction([loaded], [run("leads: tried 3 of 3, resolved 1, opened 1, candidates 0, unresolved 2")], "2099-01-09");
    expect(soon).toMatchObject({ verb: "draft", from: "2099-01-02-leads-megalithic-casting-000000" });
  });
  it("a completed leads pass that opened something and was never drafted is half done: the draft comes next", () => {
    const opened = run("leads: tried 3 of 3, resolved 1, opened 1, candidates 0, unresolved 2");
    expect(nextAction([loaded], [opened], "2099-01-03")).toMatchObject({ case: c.record.slug, verb: "draft", from: opened.runId });
    const empty = run("leads: tried 3 of 3, resolved 0, opened 0, candidates 0, unresolved 3");
    expect(nextAction([loaded], [empty], "2099-01-03").verb).not.toBe("draft");
  });
});

describe("composeLeadsReport", () => {
  it("names candidates with their checks and the unresolved with what was tried", () => {
    const outcomes = [{ key: "text:k", kind: "source", observed: "Report: 'K'.", title: "K", authors: [], year: null, query: "K", firstBlocked: { date: "2099-01-01", by: "d", route: "ask the library" }, resolved: null, candidates: [{ title: "K maybe", authors: ["A. Person"], year: 2010, url: "https://example.org/k", doi: null, identifier: "url:example.org/k", via: "Europe PMC", similarity: 0.5, checks: ["title containment 0.5 (below the 0.7 threshold)"] }] }] as unknown as LeadOutcome[];
    const r = composeLeadsReport("megalithic-casting", "2099-01-02-leads-megalithic-casting-000000", "2099-01-02", outcomes, 5);
    expect(r).toContain("1 lead(s) tried of 5 open");
    expect(r).toContain("### Candidates (confirm from the text)");
    expect(r).toContain("- K maybe (A. Person, 2010) → https://example.org/k — Europe PMC; title containment 0.5 (below the 0.7 threshold)");
    expect(r).toContain("route: ask the library");
  });
});
