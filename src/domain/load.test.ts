import { describe, expect, it } from "vitest";
import {
  extractClaimRefs,
  extractPlateRefs,
  parseArticle,
  parseInlines,
} from "./article";
import {
  catalogClaims,
  featuredClaims,
  getCaseBySlug,
  historyNewestFirst,
  lastContentUpdate,
  crossModelSummary,
  RATIFICATION_MIN_PANEL,
  ratification,
  survivingObjections,
  latestCheckPerModel,
  displayAssessment,
  latestAssessment,
  liveClaims,
  loadAllCases,
  loadSiteImages,
  recentChanges,
  sourceAdmissionErrors,
} from "./load";
import {
  assessmentFamily,
  assessmentLabels,
  assessmentStateCaptions,
  ClaimSchema,
  ConjectureSchema,
  EvidenceSchema,
  ImageSchema,
  SourceSchema,
} from "./schema";

describe("real content", () => {
  it("loads and passes all integrity checks", () => {
    const cases = loadAllCases();
    expect(cases.length).toBeGreaterThan(0);
    const geo = getCaseBySlug("megalithic-casting");
    expect(geo.record.id).toBe("GEO-001");
    expect(liveClaims(geo).length).toBeGreaterThanOrEqual(10);
    // Tombstones are kept but excluded from live views.
    expect(geo.claims.length).toBeGreaterThan(liveClaims(geo).length);
    expect(latestAssessment(geo)).not.toBeNull();
    // Every claim referenced by the article resolves.
    for (const id of extractClaimRefs(geo.overviewMarkdown)) {
      expect(liveClaims(geo).some((c) => c.id === id)).toBe(true);
    }
  });

  it("carries the bulk-imported geo catalog with honest provenance", () => {
    const geo = getCaseBySlug("megalithic-casting");
    const catalog = catalogClaims(geo);
    expect(catalog.length).toBe(80);
    expect(featuredClaims(geo).length).toBe(14);
    for (const c of catalog) {
      // One reversible run: a single runId stamped on every record.
      expect(c.origin.runId).toBe("geo-catalog-import-2026-08-22");
      expect(c.reviewState).toBe("ai_extracted");
      expect(c.sourceAnchor.locator.length).toBeGreaterThan(3);
      // T-number origin, always.
      expect(c.origin.ref).toMatch(/T-\d{3}/);
    }
    // Dedupe held: no catalog claim re-imports a T-number already carried
    // by a featured claim, the killed topic, or the tombstoned cluster.
    const excluded = [
      "T-001", "T-003", "T-004", "T-005", "T-012", "T-013", "T-014",
      "T-021", "T-034", "T-060", "T-072", "T-073", "T-077", "T-078",
      "T-087",
    ];
    for (const c of catalog) {
      const t = c.origin.ref.match(/T-\d{3}/)?.[0];
      expect(excluded).not.toContain(t);
    }
    // Confidentiality: neutrally-framed method topics never cite the
    // confidential source.
    const text = JSON.stringify(catalog);
    expect(text).not.toMatch(/hawke/i);
    expect(text).not.toMatch(/harmonic research/i);
  });

  it("every live case surfaces its latest change in the homepage feed", () => {
    // Regression: with a date-only sort and a hard cap, a burst of same-day
    // entries on one case evicted the vasocomputation launch entirely.
    const cases = loadAllCases();
    // Same sizing rule as the homepage: at least one slot per live case.
    const feed = recentChanges(cases, Math.max(4, cases.length));
    for (const c of cases) {
      const latest = historyNewestFirst(c.history)[0];
      expect(latest).toBeDefined();
      expect(
        feed.some(
          (e) => e.caseSlug === c.record.slug && e.change === latest?.change,
        ),
      ).toBe(true);
    }
    // Newest-first display order.
    for (let i = 1; i < feed.length; i++) {
      expect(feed[i - 1]!.date >= feed[i]!.date).toBe(true);
    }
  });

  it("article parses into blocks with claim refs", () => {
    const geo = getCaseBySlug("megalithic-casting");
    const blocks = parseArticle(geo.overviewMarkdown);
    expect(blocks.some((b) => b.kind === "heading")).toBe(true);
    const refs = extractClaimRefs(geo.overviewMarkdown);
    expect(refs.length).toBeGreaterThanOrEqual(8);
  });

  it("loads case and site images with valid licenses and files", () => {
    const geo = getCaseBySlug("megalithic-casting");
    const plates = geo.images.filter((i) => i.role === "plate");
    expect(plates.length).toBeGreaterThanOrEqual(3);
    // Every plate is real imagery with provenance — never generated.
    for (const p of plates) {
      expect(p.source).not.toBe("generated");
      expect(p.provenance?.sourceUrl).toMatch(/^https:/);
    }
    expect(loadSiteImages().length).toBeGreaterThanOrEqual(2);
    // Plate refs in the article resolve to actual plates.
    const plateIds = new Set(plates.map((p) => p.id));
    for (const ref of extractPlateRefs(geo.overviewMarkdown)) {
      expect(plateIds.has(ref)).toBe(true);
    }
  });
});

describe("recent-changes feed", () => {
  const entry = (date: string, change: string) => ({
    date,
    change,
    reason: "r",
    actor: "a",
    aiAssisted: false,
  });

  it("a busy case cannot evict another case's latest change", () => {
    const busy = {
      record: { title: "Busy", slug: "busy" },
      history: [
        entry("2026-08-22", "busy-1"),
        entry("2026-08-22", "busy-2"),
        entry("2026-08-22", "busy-3"),
        entry("2026-08-22", "busy-4"),
      ],
    };
    const fresh = {
      record: { title: "Fresh", slug: "fresh" },
      history: [entry("2026-08-22", "fresh launch")],
    };
    const feed = recentChanges([busy, fresh], 3);
    expect(feed.length).toBe(3);
    expect(feed.some((e) => e.change === "fresh launch")).toBe(true);
    // The busy case's own most recent entry (last appended) is there too.
    expect(feed.some((e) => e.change === "busy-4")).toBe(true);
  });

  it("lastContentUpdate uses newest content history, not lastReviewed", () => {
    const loaded = {
      record: { lastReviewed: "2026-08-22" },
      history: [
        entry("2026-08-22", "launch"),
        {
          ...entry("2026-08-23", "cover art regenerated"),
          kind: "housekeeping" as const,
        },
        { ...entry("2026-08-24", "inbox intake"), kind: "content" as const },
      ],
    };
    expect(lastContentUpdate(loaded)).toBe("2026-08-24");
  });

  it("lastContentUpdate ignores housekeeping and falls back to lastReviewed", () => {
    const loaded = {
      record: { lastReviewed: "2026-08-22" },
      history: [
        {
          ...entry("2026-08-23", "cover art regenerated"),
          kind: "housekeeping" as const,
        },
      ],
    };
    expect(lastContentUpdate(loaded)).toBe("2026-08-22");
  });

  it("orders same-date history entries newest-appended-first", () => {
    const sorted = historyNewestFirst([
      entry("2026-08-01", "old"),
      entry("2026-08-22", "first that day"),
      entry("2026-08-22", "second that day"),
    ]);
    expect(sorted.map((e) => e.change)).toEqual([
      "second that day",
      "first that day",
      "old",
    ]);
  });
});

describe("source admission rule", () => {
  const src = (id: string, background = false) => ({ id, background });
  const anchorClaim = (sourceId: string) => ({
    sourceAnchor: { sourceId, locator: "p. 1" },
  });

  it("rejects an uncited source without the background flag", () => {
    const errors = sourceAdmissionErrors([src("SRC-A")], [], []);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("SRC-A");
    expect(errors[0]).toContain("background: true");
  });

  it("accepts an uncited source marked background", () => {
    expect(sourceAdmissionErrors([src("SRC-A", true)], [], [])).toEqual([]);
  });

  it("accepts a source cited by an evidence record", () => {
    expect(
      sourceAdmissionErrors([src("SRC-A")], [{ sourceId: "SRC-A" }], []),
    ).toEqual([]);
  });

  it("accepts a source anchoring a claim", () => {
    expect(
      sourceAdmissionErrors([src("SRC-A")], [], [anchorClaim("SRC-A")]),
    ).toEqual([]);
  });

  it("accepts a source documenting a claim's genealogy", () => {
    const genealogyClaim = {
      genealogy: {
        firstKnown: "2016-11-03",
        originDescription: "anonymous forum post, later amplified",
        originSourceId: "SRC-A",
      },
    };
    expect(
      sourceAdmissionErrors([src("SRC-A")], [], [genealogyClaim]),
    ).toEqual([]);
    // And the honesty rule still cuts both ways.
    const errors = sourceAdmissionErrors([src("SRC-A", true)], [], [
      genealogyClaim,
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("remove background: true");
  });

  it("rejects a cited source still mislabeled background", () => {
    const errors = sourceAdmissionErrors(
      [src("SRC-A", true)],
      [{ sourceId: "SRC-A" }],
      [],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("remove background: true");
  });

  it("holds across all live content — the ledger carries no weightless sources", () => {
    for (const c of loadAllCases()) {
      expect(
        sourceAdmissionErrors(c.sources, c.evidence, c.claims),
      ).toEqual([]);
    }
  });
});

describe("schema rules", () => {
  const baseClaim = {
    id: "GEO-C999",
    tier: "featured",
    statement: "A test statement long enough to pass.",
    plainLanguage: "A plain language gloss long enough.",
    theme: "tool-marks",
    rung: "observation",
    claimType: "observation",
    importance: "supporting",
    reviewState: "ai_extracted",
    origin: {
      ref: "test",
      extractedBy: "test",
      runId: "test-run",
      date: "2026-01-01",
    },
    credibility: "unresolved",
    credibilitySummary: "none",
    diagnosticity: "low",
    diagnosticitySummary: "none",
    strongestObjection: "none",
  };

  const baseCatalogClaim = {
    id: "GEO-C998",
    tier: "catalog",
    statement: "A lightweight catalog statement long enough to pass.",
    theme: "tool-marks",
    rung: "observation",
    reviewState: "ai_extracted",
    origin: {
      ref: "geo catalog T-999",
      extractedBy: "test",
      runId: "test-run",
      date: "2026-01-01",
    },
    sourceAnchor: { locator: "Fóti Ch 1, pp ~14–17" },
  };

  it("rejected claims require a rejectionReason (tombstone rule)", () => {
    expect(() =>
      ClaimSchema.parse({ ...baseClaim, reviewState: "rejected" }),
    ).toThrow();
    expect(() =>
      ClaimSchema.parse({
        ...baseClaim,
        reviewState: "rejected",
        rejectionReason: "because",
      }),
    ).not.toThrow();
    // The tombstone rule applies to catalog-tier claims too.
    expect(() =>
      ClaimSchema.parse({ ...baseCatalogClaim, reviewState: "rejected" }),
    ).toThrow();
  });

  it("catalog claims validate without featured-level richness", () => {
    expect(() => ClaimSchema.parse(baseCatalogClaim)).not.toThrow();
    const parsed = ClaimSchema.parse(baseCatalogClaim);
    expect(parsed.tier).toBe("catalog");
  });

  it("catalog claims require a source anchor", () => {
    const { sourceAnchor: _drop, ...unanchored } = baseCatalogClaim;
    void _drop;
    expect(() => ClaimSchema.parse(unanchored)).toThrow();
    expect(() =>
      ClaimSchema.parse({ ...baseCatalogClaim, sourceAnchor: { locator: "" } }),
    ).toThrow();
  });

  it("claims of either tier may carry genealogy; malformed genealogy fails", () => {
    const genealogy = {
      firstKnown: "2016-11-03",
      originDescription: "anonymous forum post, later amplified by aggregators",
      originSourceId: "SRC-TEST",
    };
    expect(() =>
      ClaimSchema.parse({ ...baseClaim, genealogy }),
    ).not.toThrow();
    expect(() =>
      ClaimSchema.parse({ ...baseCatalogClaim, genealogy }),
    ).not.toThrow();
    // Partial dates are honest when only the year or month is known.
    for (const firstKnown of ["2016", "2016-11"]) {
      expect(() =>
        ClaimSchema.parse({
          ...baseCatalogClaim,
          genealogy: { ...genealogy, firstKnown },
        }),
      ).not.toThrow();
    }
    // A vibe is not a date; a fragment is not an origin account.
    expect(() =>
      ClaimSchema.parse({
        ...baseCatalogClaim,
        genealogy: { ...genealogy, firstKnown: "Nov 2016" },
      }),
    ).toThrow();
    expect(() =>
      ClaimSchema.parse({
        ...baseCatalogClaim,
        genealogy: { ...genealogy, originDescription: "4chan" },
      }),
    ).toThrow();
  });

  it("misframed and provenance_failure are open-family credibility states", () => {
    for (const credibility of ["misframed", "provenance_failure"] as const) {
      expect(() =>
        ClaimSchema.parse({ ...baseClaim, credibility }),
      ).not.toThrow();
      expect(assessmentFamily(credibility)).toBe("open");
      expect(assessmentLabels[credibility]).toBeTruthy();
      // Unfamiliar epistemic terms are explained in place.
      expect(assessmentStateCaptions[credibility]).toBeTruthy();
    }
  });

  it("sources default to an empty derivedFrom list", () => {
    const parsed = SourceSchema.parse({
      id: "SRC-TEST",
      title: "A test source",
      sourceType: "webpage",
      verification: "unverified",
    });
    expect(parsed.derivedFrom).toEqual([]);
    expect(
      SourceSchema.parse({
        id: "SRC-TEST",
        title: "A test source",
        sourceType: "webpage",
        verification: "unverified",
        derivedFrom: ["SRC-PARENT"],
      }).derivedFrom,
    ).toEqual(["SRC-PARENT"]);
  });

  it("promotion is a one-field edit that then demands the full workup", () => {
    // Flipping tier alone fails loudly: the validator lists the editorial
    // fields still missing. That failure is the promotion checklist.
    expect(() =>
      ClaimSchema.parse({ ...baseCatalogClaim, tier: "featured" }),
    ).toThrow();
    // Supplying the featured fields completes the promotion.
    expect(() =>
      ClaimSchema.parse({
        ...baseCatalogClaim,
        tier: "featured",
        plainLanguage: "A plain language gloss long enough.",
        claimType: "observation",
        importance: "supporting",
        credibility: "unresolved",
        credibilitySummary: "none yet",
        diagnosticity: "low",
        diagnosticitySummary: "none yet",
        strongestObjection: "none recorded yet",
      }),
    ).not.toThrow();
  });

  it("featured claims still require the full editorial fields", () => {
    const { plainLanguage: _pl, ...missingGloss } = baseClaim;
    void _pl;
    expect(() => ClaimSchema.parse(missingGloss)).toThrow();
  });

  it("HARD RULE: AI-generated images can never be plates", () => {
    const base = {
      id: "IMG-TEST-X",
      file: "/images/site/hero.jpg",
      alt: "a test image alt text",
      license: "test",
      credit: "test credit",
      prompt: "p",
      styleVersion: "style-v1",
      model: "m",
      plateNumber: 1,
      depicts: "something",
      provenance: {
        photographer: "someone",
        sourceUrl: "https://example.com",
      },
    };
    expect(() =>
      ImageSchema.parse({ ...base, role: "plate", source: "generated" }),
    ).toThrow(/never be plates/);
    expect(() =>
      ImageSchema.parse({ ...base, role: "plate", source: "commons" }),
    ).not.toThrow();
    expect(() =>
      ImageSchema.parse({ ...base, role: "cover", source: "generated" }),
    ).not.toThrow();
  });

  it("images without license or credit fail validation", () => {
    expect(() =>
      ImageSchema.parse({
        id: "IMG-TEST-Y",
        role: "cover",
        file: "/images/site/hero.jpg",
        alt: "some alt text here",
        source: "commons",
        license: "",
        credit: "",
      }),
    ).toThrow();
  });

  it("evidence requires direction and at least one claim", () => {
    expect(() =>
      EvidenceSchema.parse({
        id: "GEO-E999",
        title: "t",
        claimIds: [],
        sourceId: "SRC-X",
        direction: "supports",
        strength: "weak",
        sourceStatement: "s",
        reviewState: "ai_extracted",
        origin: baseClaim.origin,
      }),
    ).toThrow();
  });
});

describe("article parser", () => {
  it("parses claim refs, links, and emphasis", () => {
    const inlines = parseInlines(
      "Before [the claim]{claim=GEO-C001} and *em* and **strong** and [a link](https://example.com).",
    );
    expect(inlines).toContainEqual({
      kind: "claimRef",
      text: "the claim",
      claimId: "GEO-C001",
    });
    expect(inlines).toContainEqual({ kind: "em", text: "em" });
    expect(inlines).toContainEqual({ kind: "strong", text: "strong" });
    expect(inlines).toContainEqual({
      kind: "link",
      text: "a link",
      href: "https://example.com",
    });
  });

  it("rejects unsupported heading levels", () => {
    expect(() => parseArticle("# Top level")).toThrow();
  });
});

describe("ratification governance (stage 3)", () => {
  const mkDraft = (
    runId: string,
    date: string,
    verdict = "unresolved",
    loadBearing: string[] = [],
    claimVerdicts: Record<string, string> = {},
  ) => ({
    runId,
    model: "house/test",
    date,
    promptVersion: "t",
    humanReviewed: false,
    role: "draft" as const,
    caseAssessment: {
      verdict,
      loadBearing,
      weakestLinks: [],
      synthesis: "x".repeat(120),
    },
    claimAssessments: Object.entries(claimVerdicts).map(
      ([claimId, verdict]) => ({
        claimId,
        verdict,
        reasoning: "test reasoning",
        confidence: "moderate",
      }),
    ),
  });
  const mkCheck = (
    model: string,
    date: string,
    verdict = "unresolved",
    claimVerdicts: Record<string, string> = {},
  ) => ({
    ...mkDraft(`${date}-check-${model}`, date, verdict, [], claimVerdicts),
    model: `${model} (Vendor) — independent check`,
    role: "check" as const,
  });
  const caseWith = (
    runs: unknown[],
    history: { date: string; kind?: string }[] = [],
  ) =>
    ({
      assessmentRuns: runs,
      history: history.map((h) => ({
        date: h.date,
        kind: h.kind,
        change: "c",
        reason: "r",
        actor: "a",
        aiAssisted: true,
      })),
    }) as unknown as Parameters<typeof ratification>[0];
  const fiveChecks = (verdict: string, dissenters = 0, date = "2026-02-01") =>
    ["alpha", "beta", "gamma", "delta", "epsilon"].map((m, i) =>
      mkCheck(m, date, i < dissenters ? "mixed" : verdict),
    );

  it("no checks → unratified, and the reason says so", () => {
    const r = ratification(caseWith([mkDraft("d", "2026-01-01")]));
    expect(r?.status).toBe("unratified");
    expect(r?.reason).toMatch(/no independent model/);
  });

  it("a panel below the minimum cannot ratify", () => {
    const r = ratification(
      caseWith([
        mkDraft("d", "2026-01-01"),
        ...fiveChecks("unresolved").slice(0, RATIFICATION_MIN_PANEL - 1),
      ]),
    );
    expect(r?.status).toBe("unratified");
  });

  it("full agreement ratifies; one dissenter is tolerated; two are not", () => {
    const draft = mkDraft("d", "2026-01-01");
    expect(ratification(caseWith([draft, ...fiveChecks("unresolved")]))?.status).toBe(
      "ratified",
    );
    expect(
      ratification(caseWith([draft, ...fiveChecks("unresolved", 1)]))?.status,
    ).toBe("ratified");
    const two = ratification(caseWith([draft, ...fiveChecks("unresolved", 2)]));
    expect(two?.status).toBe("contested");
    expect(two?.reason).toMatch(/2 of 5 models dispute/);
  });

  it("content newer than the panel resets standing to unratified — never to ratified", () => {
    const r = ratification(
      caseWith(
        [mkDraft("d", "2026-01-01"), ...fiveChecks("unresolved")],
        [{ date: "2026-03-01" }],
      ),
    );
    expect(r?.status).toBe("unratified");
    expect(r?.staleSince).toBe("2026-03-01");
  });

  it("housekeeping history does not stale the panel", () => {
    const r = ratification(
      caseWith(
        [mkDraft("d", "2026-01-01"), ...fiveChecks("unresolved")],
        [{ date: "2026-03-01", kind: "housekeeping" }],
      ),
    );
    expect(r?.status).toBe("ratified");
  });

  it("a reconsideration cannot be ratified by the checks it engaged", () => {
    const engaged = fiveChecks("mixed"); // all five agree with the reconciled verdict
    const reconsider = {
      ...mkDraft("2026-02-02-reconsider-ab12", "2026-02-02", "mixed"),
      promptVersion: "aletheia-reconsider-v1",
      reconciles: engaged.map((r) => r.runId),
    };
    const r = ratification(caseWith([reconsider, ...engaged]));
    expect(r?.status).toBe("unratified");
    expect(r?.reason).toMatch(/fresh blind check/);
  });

  it("one blind check outside the reconciles stamp restores normal derivation, even same-day", () => {
    const engaged = fiveChecks("mixed").slice(0, 4);
    const reconsider = {
      ...mkDraft("2026-02-02-reconsider-ab12", "2026-02-02", "mixed"),
      promptVersion: "aletheia-reconsider-v1",
      reconciles: engaged.map((r) => r.runId),
    };
    const fresh = mkCheck("zeta", "2026-02-02", "mixed");
    const r = ratification(caseWith([reconsider, ...engaged, fresh]));
    expect(r?.status).toBe("ratified");
  });

  it("a pre-stamp reconsideration is fresh-checked only by a strictly later check", () => {
    const sameDay = fiveChecks("mixed", 0, "2026-02-02");
    const legacy = {
      ...mkDraft("2026-02-02-reconsider-cd34", "2026-02-02", "mixed"),
      promptVersion: "aletheia-reconsider-v1",
    };
    expect(ratification(caseWith([legacy, ...sameDay]))?.status).toBe(
      "unratified",
    );
    const later = fiveChecks("mixed", 0, "2026-02-03");
    expect(ratification(caseWith([legacy, ...later]))?.status).toBe("ratified");
  });

  it("an ordinary blind draft is unaffected by the reconsideration rule", () => {
    const draft = mkDraft("d", "2026-02-02"); // newer than the checks
    const r = ratification(caseWith([draft, ...fiveChecks("unresolved")]));
    expect(r?.status).toBe("ratified");
  });

  it("a load-bearing claim the panel rejects blocks ratification even with case-verdict agreement", () => {
    const draft = mkDraft("d", "2026-01-01", "unresolved", ["C1"], {
      C1: "well_supported",
    });
    const checks = ["alpha", "beta", "gamma", "delta", "epsilon"].map((m, i) =>
      mkCheck(m, "2026-02-01", "unresolved", {
        C1: i < 3 ? "contradicted" : "well_supported",
      }),
    );
    const r = ratification(caseWith([draft, ...checks]));
    expect(r?.status).toBe("contested");
    expect(r?.contestedLoadBearing).toEqual(["C1"]);
  });

  it("displayAssessment always shows the latest draft, stamped with its standing", () => {
    const shown = displayAssessment(
      caseWith([
        mkDraft("old", "2026-01-01", "mixed"),
        mkDraft("new", "2026-02-01"),
        ...fiveChecks("unresolved", 0, "2026-02-02"),
      ]) as unknown as Parameters<typeof displayAssessment>[0],
    );
    expect(shown?.run.runId).toBe("new");
    expect(shown?.ratification.status).toBe("ratified");
  });

  it("every live case derives a valid standing; checked cases have a full panel", () => {
    // A freshly imported case legitimately has zero check runs — it must
    // still derive a valid standing (unratified, with the reason saying no
    // model has checked it), and it stays visibly unratified until the
    // cross-model panel judges it. But once any check runs exist, a partial
    // panel is a pipeline defect: checks are produced as a full sweep.
    for (const c of loadAllCases()) {
      const shown = displayAssessment(c);
      expect(shown).not.toBeNull();
      expect(["ratified", "contested", "unratified"]).toContain(
        shown!.ratification.status,
      );
      const hasChecks = c.assessmentRuns.some((a) => a.role === "check");
      if (hasChecks) {
        expect(shown!.ratification.panel).toBeGreaterThanOrEqual(
          RATIFICATION_MIN_PANEL,
        );
      } else {
        expect(shown!.ratification.status).toBe("unratified");
      }
      expect(shown!.ratification.reason.length).toBeGreaterThan(10);
    }
  });

  it("every case carries a research priority", () => {
    for (const c of loadAllCases()) {
      expect(["high", "medium", "low"]).toContain(
        c.record.researchPriority.level,
      );
    }
  });

  it("conjectures require disconfirmers", () => {
    expect(() =>
      ConjectureSchema.parse({
        id: "GEO-J099",
        by: "x",
        date: "2026-08-23",
        statement: "something bold and specific",
        confidence: "high",
        rationale: "intuition, stated as such",
        predictedFindings: ["a finding"],
        disconfirmers: [],
      }),
    ).toThrow();
  });
});

describe("cross-model checks", () => {
  it("check runs never narrate; the draft still displays", () => {
    const orch = getCaseBySlug("orch-or");
    const checks = orch.assessmentRuns.filter((r) => r.role === "check");
    expect(checks.length).toBeGreaterThanOrEqual(4);
    const shown = displayAssessment(orch);
    // The newest draft-role run displays; checks never do, however new.
    expect(shown?.run.role).toBe("draft");
    const newestDraft = [...orch.assessmentRuns]
      .reverse()
      .find((r) => r.role !== "check");
    expect(shown?.run.runId).toBe(newestDraft?.runId);
  });

  it("concurrence summary reports agreement against the displayed run", () => {
    const orch = getCaseBySlug("orch-or");
    const s = crossModelSummary(orch);
    expect(s).not.toBeNull();
    expect(s!.models.length).toBeGreaterThanOrEqual(4);
    expect(s!.claimsCompared).toBeGreaterThanOrEqual(18);
    // Every compared claim lands in exactly one bucket.
    expect(s!.exact + s!.adjacent + s!.split).toBe(s!.claimsCompared);
    expect(s!.splitClaimIds.length).toBe(s!.split);
  });

  it("a same-day re-check wins the per-model tie, and the superseded run is not double-counted", () => {
    // Append-only means a re-checked case carries two runs per model with the
    // same date. The -r2 suffix convention must win the tie, and the panel
    // must count each vendor once — "10 independent models" from 5 vendors
    // was the original double-counting bug.
    const trn = getCaseBySlug("transients");
    const perModel = latestCheckPerModel(trn);
    const opusRuns = trn.assessmentRuns.filter(
      (r) => r.role === "check" && r.model.startsWith("Opus"),
    );
    if (opusRuns.length >= 2) {
      const shownOpus = perModel.filter((r) => r.model.startsWith("Opus"));
      expect(shownOpus).toHaveLength(1);
      // The winner must be the newest by (date, then runId) — the -rN
      // suffix only decides same-date ties; a later date beats any suffix.
      const expected = [...opusRuns].sort((a, b) =>
        a.date === b.date
          ? a.runId.localeCompare(b.runId)
          : a.date.localeCompare(b.date),
      ).at(-1)!;
      expect(shownOpus[0].runId).toBe(expected.runId);
    }
    const keys = perModel.map((r) => r.model.trim().split(/[\s,(]/)[0].toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("cases without check runs have no summary", () => {
    // All live cases now carry checks, so synthesize a checkless case.
    const orch = getCaseBySlug("orch-or");
    const checkless = {
      ...orch,
      assessmentRuns: orch.assessmentRuns.filter((r) => r.role !== "check"),
    };
    expect(crossModelSummary(checkless)).toBeNull();
  });
});

describe("surviving objections", () => {
  it("a ratified case's tolerated dissent is surfaced, not sanitized", () => {
    for (const c of loadAllCases()) {
      const shown = displayAssessment(c);
      if (!shown || shown.ratification.status !== "ratified") continue;
      const objections = survivingObjections(c, shown.run);
      // exactly the dissenters the ratification tolerated
      expect(objections.length).toBe(
        shown.ratification.panel - shown.ratification.agreeing,
      );
      for (const o of objections) {
        expect(o.verdict).not.toBe(shown.run.caseAssessment.verdict);
        expect(o.firstSentence.length).toBeGreaterThan(20);
        expect(o.firstSentence.length).toBeLessThanOrEqual(260);
        expect(o.seat).not.toMatch(/independent/);
      }
    }
  });
});
