import { describe, expect, it } from "vitest";
import { candidateKeys, coverageDiff, ledgerKeys } from "./coverage.ts";
import type { Disposition } from "./intake.ts";
import { getCaseBySlug } from "./load.ts";
import type { LoadedCase } from "./schema.ts";

const withDispositions = (loaded: LoadedCase, rows: Disposition[]): LoadedCase => ({
  ...loaded,
  dispositions: [...loaded.dispositions, ...rows],
});

describe("the coverage diff", () => {
  const geo = () => getCaseBySlug("megalithic-casting");

  it("a source the ledger carries is seen by identifier, however it is cited", () => {
    const c = geo();
    const shortland = c.sources.find((s) => s.id === "SRC-SHORTLAND-2006")!;
    expect(ledgerKeys(c).get("doi:10.1016/j.jas.2005.09.011")).toBe(shortland.id);
    const r = coverageDiff(
      [{ kind: "source", title: "Some other title entirely", url: "https://doi.org/10.1016/j.jas.2005.09.011" }],
      c,
    );
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0].via).toBe("ledger");
    expect(r.seen[0].record).toBe("SRC-SHORTLAND-2006");
    expect(r.novel).toHaveLength(0);
  });

  it("a retitled version of a known source is probable, never silently dropped or silently added", () => {
    const c = geo();
    const marcis = c.sources.find((s) => s.id === "SRC-MARCIS-2023")!;
    const r = coverageDiff([{ kind: "source", title: `${marcis.title} (corrected proof)` }], c);
    expect(r.novel).toHaveLength(0);
    expect(r.seen).toHaveLength(0);
    expect(r.probable[0].matches[0].id).toBe("SRC-MARCIS-2023");
  });

  it("a declined candidate is seen via its disposition, and the declined set travels with the result", () => {
    const c = withDispositions(geo(), [
      {
        key: "doi:10.9999/declined.1",
        kind: "source",
        disposition: "irrelevant",
        reason: "cement-industry paper with no bearing on any claim",
        reopenIf: "it reports an ancient-materials analysis",
        observed: "Modern slag cements",
        by: "triage-test",
        date: "2026-09-01",
      },
    ]);
    const r = coverageDiff([{ kind: "source", title: "Modern slag cements", doi: "10.9999/declined.1" }], c);
    expect(r.seen[0].via).toBe("disposition");
    expect(r.seen[0].disposition?.reason).toMatch(/cement-industry/);
    expect(r.declined.map((d) => d.key)).toContain("doi:10.9999/declined.1");
  });

  it("a later `in` row supersedes an earlier decline for the same key", () => {
    const c = withDispositions(geo(), [
      { key: "doi:10.9999/x", kind: "source", disposition: "blocked", reason: "paywalled", observed: "X", by: "r1", date: "2026-09-01" },
      { key: "doi:10.9999/x", kind: "source", disposition: "in", as: "SRC-MARCIS-2023", observed: "X", by: "r2", date: "2026-09-03" },
    ]);
    const r = coverageDiff([], c);
    expect(r.declined.find((d) => d.key === "doi:10.9999/x")).toBeUndefined();
  });

  it("propositions: an existing claim reworded is probable; a genuinely new one is novel", () => {
    const c = geo();
    const c001 = c.claims.find((k) => k.id === "GEO-C001")!;
    const reworded = c001.statement.replace("roughly", "about");
    const r = coverageDiff(
      [
        { kind: "claim", statement: reworded },
        { kind: "claim", statement: "The Colossi of Memnon quartzite carries a sodium silicate binder detectable by Raman spectroscopy." },
      ],
      c,
    );
    expect(r.probable).toHaveLength(1);
    expect(r.probable[0].matches[0].id).toBe("GEO-C001");
    expect(r.novel).toHaveLength(1);
  });

  it("candidate keys follow the kind", () => {
    expect(candidateKeys({ kind: "source", doi: "10.1234/a", url: "https://x.org/p" })).toEqual(["doi:10.1234/a", "url:x.org/p"]);
    expect(candidateKeys({ kind: "research", title: "Replicate the pounding-rate measurement" })).toEqual([
      "text:replicate the pounding rate measurement",
    ]);
    expect(candidateKeys({ kind: "claim" })).toEqual([]);
  });
});
