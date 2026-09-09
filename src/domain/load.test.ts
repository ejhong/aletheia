import { describe, expect, it } from "vitest";
import { seatKey } from "../lib/seat-key.mjs";
import {
  extractClaimRefs,
  extractPlateRefs,
  parseArticle,
  parseInlines,
} from "./article.ts";
import { adoptedAssessment, currentEdition, latestAssessment } from "./editions.ts";
import { checksStale, crossModelSummary, RATIFICATION_MIN_PANEL, ratification, runStaleness, survivingObjections, latestCheckPerModel, displayAssessment, withinOneStep } from "./standing.ts";
import { claimAnchorErrors, editionErrors, getCaseBySlug, liveClaims, loadAllCases, loadSiteImages, sourceAdmissionErrors } from "./load.ts";
import { historyNewestFirst, lastContentUpdate, recentChanges } from "./history.ts";
import { assessmentHash, canonicalJson, ledgerHash, sha256Hex } from "./hash.ts";
import { caseView, findClaimView, reviewCoverage } from "./view.ts";
import {
  assessmentFamily,
  assessmentLabels,
  assessmentStateCaptions,
  AssessmentRunSchema,
  CLAIM_ANCHOR_REQUIRED_FROM,
  ClaimSchema,
  EditionSchema,
  EvidenceSchema,
  ImageSchema,
  SourceSchema,
  STEELMAN_REQUIRED_FROM,
  steelmanRequirementError,
  type LoadedCase,
} from "./schema.ts";

describe("real content", () => {
  it("loads and passes all integrity checks", () => {
    const cases = loadAllCases();
    expect(cases.length).toBeGreaterThan(0);
    const geo = getCaseBySlug("megalithic-casting");
    expect(geo.record.id).toBe("GEO-001");
    expect(geo.dir).toBe("geopolymer");
    expect(liveClaims(geo).length).toBeGreaterThanOrEqual(10);
    // Tombstones are kept but excluded from live views.
    expect(geo.claims.length).toBeGreaterThan(liveClaims(geo).length);
    expect(latestAssessment(geo)).not.toBeNull();
    // Every claim referenced by the current edition's article resolves.
    for (const id of extractClaimRefs(currentEdition(geo).article)) {
      expect(liveClaims(geo).some((c) => c.id === id)).toBe(true);
    }
  });

  it("the migrated geo catalog rides the ledger backlog with honest provenance", () => {
    const geo = getCaseBySlug("megalithic-casting");
    const view = caseView(geo);
    // The migration's eighty are all still here; an edition may since have
    // featured some of them, and later intake adds behind them with its own run ids.
    expect(geo.claims.filter((c) => c.origin.runId === "geo-catalog-import-2026-08-22")).toHaveLength(80);
    const migrated = view.catalog.filter(({ claim }) => claim.origin.runId === "geo-catalog-import-2026-08-22");
    expect(view.featured.length).toBe(currentEdition(geo).featuredClaimIds.length);
    for (const { claim: c, treatment, verdict } of migrated) {
      // One reversible run: a single runId stamped on every record.
      expect(c.origin.runId).toBe("geo-catalog-import-2026-08-22");
      expect(c.reviewState).toBe("ai_extracted");
      expect(c.sourceAnchor?.locator.length).toBeGreaterThan(3);
      // T-number origin, always; and no judgment until an edition features it.
      expect(c.origin.ref).toMatch(/T-\d{3}/);
      expect(treatment).toBeNull();
      expect(verdict).toBeNull();
    }
    // Dedupe held: no catalog claim re-imports a T-number already carried
    // by a featured claim, the killed topic, or the tombstoned cluster.
    const excluded = [
      "T-001", "T-003", "T-004", "T-005", "T-012", "T-013", "T-014",
      "T-021", "T-034", "T-060", "T-072", "T-073", "T-077", "T-078",
      "T-087",
    ];
    for (const { claim: c } of view.catalog) {
      const t = c.origin.ref.match(/T-\d{3}/)?.[0];
      expect(excluded).not.toContain(t);
    }
    // Confidentiality: neutrally-framed method topics never cite the
    // confidential source.
    const text = JSON.stringify(view.catalog.map((c) => c.claim));
    expect(text).not.toMatch(/hawke/i);
    expect(text).not.toMatch(/harmonic research/i);
  });

  it("every featured claim carries a full treatment and a verdict from the adopted assessment", () => {
    for (const loaded of loadAllCases()) {
      const view = caseView(loaded);
      expect(view.featured.length).toBeGreaterThan(0);
      expect(view.featured.map((c) => c.claim.id)).toEqual(
        view.edition.featuredClaimIds,
      );
      for (const c of view.featured) {
        expect(c.verdict).not.toBeNull();
        expect(c.treatment?.plainLanguage.length).toBeGreaterThan(10);
        expect(["headline", "major", "supporting"]).toContain(c.treatment?.importance);
      }
      // The dossier header came across from case.yaml into the assessment.
      expect(view.header.whatIsClaimed?.length).toBeGreaterThan(20);
      expect(view.header.whereDisagreementLives?.length).toBeGreaterThan(20);
      expect(view.header.whatWouldSettleIt?.length).toBeGreaterThan(20);
      expect(["high", "medium", "low"]).toContain(view.header.researchPriority?.level);
      // Claim records carry nothing evaluative.
      for (const c of loaded.claims) {
        expect(c).not.toHaveProperty("credibility");
        expect(c).not.toHaveProperty("tier");
        expect(c).not.toHaveProperty("importance");
      }
    }
  });

  it("every case's first edition is the migration, adopting a transfer that asserts nothing new", () => {
    for (const loaded of loadAllCases()) {
      const ed = loaded.editions[0];
      expect(ed.previous).toBeNull();
      const run = loaded.assessmentRuns.find((r) => r.runId === ed.assessment?.runId)!;
      expect(run.migratedFrom).toBeTruthy();
      expect(run.role).toBe("draft");
      // The transferred draft exists and shares the case verdict.
      const source = loaded.assessmentRuns.find((r) => r.runId === run.migratedFrom)!;
      expect(source).toBeDefined();
      expect(source.caseAssessment.verdict).toBe(run.caseAssessment.verdict);
      expect(source.caseAssessment.loadBearing).toEqual(run.caseAssessment.loadBearing);
      // The edition records the ledger it was written against; where the
      // ledger has since moved, the case's changelog says so and a new
      // edition is due (runEdition compares these two hashes).
      expect(ed.basis.ledgerHash).toMatch(/^[a-f0-9]{64}$/);
      if (ed.basis.ledgerHash !== loaded.ledgerHash) {
        expect(loaded.history.some((h) => h.date >= ed.date && h.kind === "content")).toBe(true);
      }
      expect(ed.assessment?.hash).toBe(assessmentHash(run));
    }
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
    const article = currentEdition(geo).article;
    const blocks = parseArticle(article);
    expect(blocks.some((b) => b.kind === "heading")).toBe(true);
    const refs = extractClaimRefs(article);
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
    for (const ref of extractPlateRefs(currentEdition(geo).article)) {
      expect(plateIds.has(ref)).toBe(true);
    }
  });

  it("findClaimView locates a claim in its case, featured or not", () => {
    const cases = loadAllCases();
    const featured = findClaimView(cases, "GEO-C001");
    expect(featured?.view.featured).toBe(true);
    expect(featured?.view.treatment).not.toBeNull();
    expect(featured?.caseView.loaded.record.slug).toBe("megalithic-casting");
    const geoCase = cases.find((c) => c.record.slug === "megalithic-casting")!;
    const unfeatured = geoCase.claims.find((c) => c.reviewState !== "rejected" && !currentEdition(geoCase).featuredClaimIds.includes(c.id))!;
    const backlog = findClaimView(cases, unfeatured.id);
    expect(backlog?.view.featured).toBe(false);
    expect(backlog?.view.treatment).toBeNull();
    expect(findClaimView(cases, "NOPE-C000")).toBeNull();
    expect(reviewCoverage(featured!.caseView).total).toBe(currentEdition(featured!.caseView.loaded).featuredClaimIds.length);
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
    statement: "A test statement long enough to pass.",
    theme: "tool-marks",
    rung: "observation",
    claimType: "observation",
    reviewState: "ai_extracted",
    origin: {
      ref: "test",
      extractedBy: "test",
      runId: "test-run",
      date: "2026-01-01",
    },
  };

  const anchoredClaim = {
    id: "GEO-C998",
    statement: "A lightweight anchored statement long enough to pass.",
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
  });

  it("a claim is a proposition with anchors — nothing evaluative validates on it", () => {
    const parsed = ClaimSchema.parse(anchoredClaim);
    expect(parsed.parentClaimIds).toEqual([]);
    expect(parsed.claimType).toBeUndefined();
    // Evaluative fields are not part of the record (Zod strips unknown
    // keys, so the schema is the guard that they never round-trip).
    const stripped = ClaimSchema.parse({ ...baseClaim, credibility: "unresolved", tier: "featured" });
    expect(stripped).not.toHaveProperty("credibility");
    expect(stripped).not.toHaveProperty("tier");
  });

  it("a malformed source anchor fails", () => {
    expect(() =>
      ClaimSchema.parse({ ...anchoredClaim, sourceAnchor: { locator: "" } }),
    ).toThrow();
  });

  it("the anchoring rule binds claims from the cutoff, not history", () => {
    const old = { ...baseClaim, origin: { ...baseClaim.origin, date: "2026-09-07" } };
    const fresh = { ...baseClaim, id: "GEO-C997", origin: { ...baseClaim.origin, date: CLAIM_ANCHOR_REQUIRED_FROM } };
    const parsed = [old, fresh].map((c) => ClaimSchema.parse(c));
    const errors = claimAnchorErrors(parsed, []);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("GEO-C997");
    // An evidence record citing it satisfies the rule; so does a source anchor.
    expect(claimAnchorErrors(parsed, [{ claimIds: ["GEO-C997"] }])).toEqual([]);
    expect(
      claimAnchorErrors([ClaimSchema.parse({ ...fresh, sourceAnchor: { locator: "p. 3" } })], []),
    ).toEqual([]);
    // Tombstones are exempt.
    expect(
      claimAnchorErrors(
        [ClaimSchema.parse({ ...fresh, reviewState: "rejected", rejectionReason: "x" })],
        [],
      ),
    ).toEqual([]);
  });

  it("claims may carry genealogy; malformed genealogy fails", () => {
    const genealogy = {
      firstKnown: "2016-11-03",
      originDescription: "anonymous forum post, later amplified by aggregators",
      originSourceId: "SRC-TEST",
    };
    expect(() =>
      ClaimSchema.parse({ ...anchoredClaim, genealogy }),
    ).not.toThrow();
    // Partial dates are honest when only the year or month is known.
    for (const firstKnown of ["2016", "2016-11"]) {
      expect(() =>
        ClaimSchema.parse({
          ...anchoredClaim,
          genealogy: { ...genealogy, firstKnown },
        }),
      ).not.toThrow();
    }
    // A vibe is not a date; a fragment is not an origin account.
    expect(() =>
      ClaimSchema.parse({
        ...anchoredClaim,
        genealogy: { ...genealogy, firstKnown: "Nov 2016" },
      }),
    ).toThrow();
    expect(() =>
      ClaimSchema.parse({
        ...anchoredClaim,
        genealogy: { ...genealogy, originDescription: "4chan" },
      }),
    ).toThrow();
  });

  it("misframed and provenance_failure are open-family credibility states", () => {
    for (const credibility of ["misframed", "provenance_failure"] as const) {
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

  it("a treatment is complete or absent — the featured checklist lives on the assessment", () => {
    const run = {
      runId: "2026-09-08-auto-test",
      model: "test",
      date: "2026-09-08",
      promptVersion: "test",
      humanReviewed: false,
      caseAssessment: {
        verdict: "unresolved",
        loadBearing: [],
        weakestLinks: [],
        synthesis: "s".repeat(120),
        steelman: "A specific unanswered proponent argument, stated at honest length.",
      },
      claimAssessments: [
        { claimId: "GEO-C001", verdict: "unresolved", reasoning: "r", confidence: "low" },
      ],
    };
    expect(() => AssessmentRunSchema.parse(run)).not.toThrow();
    const partial = {
      ...run,
      claimAssessments: [{ ...run.claimAssessments[0], treatment: { plainLanguage: "A gloss long enough." } }],
    };
    expect(() => AssessmentRunSchema.parse(partial)).toThrow();
    const full = {
      ...run,
      claimAssessments: [
        {
          ...run.claimAssessments[0],
          treatment: {
            plainLanguage: "A gloss long enough.",
            importance: "supporting",
            diagnosticity: "low",
            diagnosticitySummary: "none yet",
            strongestObjection: "none recorded yet",
          },
        },
      ],
    };
    expect(AssessmentRunSchema.parse(full).claimAssessments[0].treatment?.whatWouldChangeOurMind).toEqual([]);
  });

  it("an edition is strict: hashes are digests, featured ids are unique, the article is real", () => {
    const hex = "a".repeat(64);
    const edition = {
      runId: "edition-2026-09-08-test",
      date: "2026-09-08",
      model: "test",
      promptVersion: "test",
      rationale: "a test edition, long enough",
      basis: { ledgerHash: hex, inputsHash: hex },
      previous: null,
      assessment: { runId: "r", hash: hex },
      featuredClaimIds: ["GEO-C001"],
      article: "x".repeat(50),
    };
    expect(EditionSchema.parse(edition).cruxOrder).toEqual([]);
    expect(() => EditionSchema.parse({ ...edition, featuredClaimIds: ["GEO-C001", "GEO-C001"] })).toThrow();
    expect(() => EditionSchema.parse({ ...edition, basis: { ledgerHash: "nope", inputsHash: hex } })).toThrow();
    expect(() => EditionSchema.parse({ ...edition, extra: true })).toThrow();
    expect(() => EditionSchema.parse({ ...edition, assessment: null })).not.toThrow();
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

describe("hashes", () => {
  it("canonical JSON is key-order independent and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }] })).toBe(
      canonicalJson({ a: [{ d: 2 }], b: 1 }),
    );
    expect(sha256Hex("x")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("the ledger hash changes when a record changes and not when key order does", () => {
    const geo = getCaseBySlug("megalithic-casting");
    const slice = {
      claims: geo.claims,
      evidence: geo.evidence,
      sources: geo.sources,
      research: geo.research,
      studies: geo.studies,
      images: geo.images,
    };
    expect(ledgerHash(slice)).toBe(geo.ledgerHash);
    const moved = { ...slice, claims: [...slice.claims].reverse() };
    expect(ledgerHash(moved)).not.toBe(geo.ledgerHash); // order of records is content
    const edited = {
      ...slice,
      claims: slice.claims.map((c, i) => (i === 0 ? { ...c, statement: c.statement + "!" } : c)),
    };
    expect(ledgerHash(edited)).not.toBe(geo.ledgerHash);
  });
});

describe("edition integrity", () => {
  const geo = () => getCaseBySlug("megalithic-casting");

  it("live content passes", () => {
    for (const c of loadAllCases()) expect(editionErrors(c)).toEqual([]);
  });

  it("an edited adopted assessment breaks the edition's hash", () => {
    const c = geo();
    const run = adoptedAssessment(c)!;
    const tampered = {
      ...c,
      assessmentRuns: c.assessmentRuns.map((r) =>
        r.runId === run.runId
          ? { ...r, caseAssessment: { ...r.caseAssessment, verdict: "established" as const } }
          : r,
      ),
    };
    const errors = editionErrors(tampered);
    expect(errors.some((e) => /no longer matches the recorded hash/.test(e))).toBe(true);
  });

  it("a featured claim without a treatment, an unknown featured id, and a check run adopted all fail", () => {
    const c = geo();
    const ed = currentEdition(c);
    const run = adoptedAssessment(c)!;
    const noTreatment = {
      ...c,
      assessmentRuns: c.assessmentRuns.map((r) =>
        r.runId === run.runId
          ? { ...r, claimAssessments: r.claimAssessments.map(({ treatment: _t, ...rest }) => { void _t; return rest; }) }
          : r,
      ),
    };
    // Hash changes too, so filter to the treatment complaint.
    expect(editionErrors(noTreatment).some((e) => /carries no treatment/.test(e))).toBe(true);
    const unknown = { ...c, editions: [{ ...ed, featuredClaimIds: [...ed.featuredClaimIds, "GEO-C000"] }] };
    expect(editionErrors(unknown).some((e) => /unknown or rejected claim GEO-C000/.test(e))).toBe(true);
    const check = c.assessmentRuns.find((r) => r.role === "check")!;
    const adoptsCheck = {
      ...c,
      editions: [{ ...ed, assessment: { runId: check.runId, hash: assessmentHash(check) } }],
    };
    expect(editionErrors(adoptsCheck).some((e) => /adopts a check run/.test(e))).toBe(true);
  });

  it("plates survive: a successor that drops a predecessor's plate fails; a broken chain fails", () => {
    const c = geo();
    const ed = currentEdition(c);
    const plateless = ed.article.replace(/^\{plate:[^}]+\}$/gm, "");
    const successor = {
      ...ed,
      runId: "edition-2026-09-09-test",
      date: "2026-09-09",
      previous: ed.runId,
      article: plateless,
    };
    const errors = editionErrors({ ...c, editions: [ed, successor] });
    expect(errors.some((e) => /drops plate/.test(e))).toBe(true);
    const orphan = editionErrors({ ...c, editions: [ed, { ...successor, article: ed.article, previous: "edition-nope" }] });
    expect(orphan.some((e) => /unknown predecessor/.test(e))).toBe(true);
    expect(editionErrors({ ...c, editions: [] })[0]).toMatch(/missing editions/);
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
    // Seats are keyed by the vendor in the parenthetical (seatKey), so each
    // synthetic model gets its own vendor.
    model: `${model} (Vendor-${model}) — independent check`,
    role: "check" as const,
  });
  const HEX = "0".repeat(64);
  /**
   * A case fixture whose current edition adopts `adopt` (default: the first
   * draft-role run) — the edition is what makes a draft the displayed one.
   */
  const caseWith = (
    runs: unknown[],
    history: { date: string; kind?: string }[] = [],
    adopt?: string,
    ledger = "ledger-a",
  ) => {
    const drafts = (runs as { runId: string; role?: string }[]).filter((r) => r.role !== "check");
    const adopted = adopt ?? drafts[0]?.runId;
    return {
      record: { slug: "fixture" },
      ledgerHash: sha256Hex(ledger),
      assessmentRuns: runs,
      editions: [
        {
          runId: "edition-fixture",
          date: "2026-01-01",
          model: "t",
          promptVersion: "t",
          rationale: "fixture edition",
          basis: { ledgerHash: HEX, inputsHash: HEX },
          previous: null,
          assessment: adopted ? { runId: adopted, hash: HEX } : null,
          featuredClaimIds: [],
          cruxOrder: [],
          article: "x".repeat(40),
        },
      ],
      history: history.map((h) => ({
        date: h.date,
        kind: h.kind,
        change: "c",
        reason: "r",
        actor: "a",
        aiAssisted: true,
      })),
    } as unknown as LoadedCase;
  };
  const fiveChecks = (verdict: string, dissenters = 0, date = "2026-02-01") =>
    ["alpha", "beta", "gamma", "delta", "epsilon"].map((m, i) =>
      mkCheck(m, date, i < dissenters ? "contradicted" : verdict), // two steps from "unresolved": a dispute, not a neighbour
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
    expect(two?.reason).toMatch(/2 of 5 models place the case verdict more than one step away/);
  });

  it("a verdict one step away concurs; two steps away disputes (§3.15, amendment of 2026-09-09)", () => {
    const draft = mkDraft("d", "2026-01-01");
    // unresolved between weakly supported and mixed: five different words, one judgment
    const near = ["unresolved", "mixed", "mixed", "weakly_supported", "presently_untestable"].map((v, i) => mkCheck(["a", "b", "c", "d", "e"][i], "2026-02-01", v));
    const r = ratification(caseWith([draft, ...near]));
    expect(r?.status).toBe("ratified");
    expect(r?.agreeing).toBe(5);
    expect(r?.reason).toMatch(/within one step/);
    // contradicted and provisionally supported are two steps from unresolved
    const far = ["contradicted", "provisionally_supported", "unresolved", "unresolved", "unresolved"].map((v, i) => mkCheck(["a", "b", "c", "d", "e"][i], "2026-02-01", v));
    expect(ratification(caseWith([draft, ...far]))?.status).toBe("contested");
    expect(withinOneStep("presently_untestable", "unresolved")).toBe(true);
    expect(withinOneStep("weakly_supported", "unresolved")).toBe(true);
    expect(withinOneStep("mixed", "unresolved")).toBe(true);
    expect(withinOneStep("provisionally_supported", "unresolved")).toBe(false);
    expect(withinOneStep("contradicted", "unresolved")).toBe(false);
    expect(withinOneStep("well_supported", "established")).toBe(true);
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

  it("displayAssessment shows the ADOPTED draft — a newer unadopted draft cannot change the verdict beneath the essay", () => {
    const runs = [
      mkDraft("old", "2026-01-01", "mixed"),
      mkDraft("new", "2026-02-01", "contradicted"), // two steps from the panel's "mixed": a dispute under the one-step rule
      ...fiveChecks("mixed", 0, "2026-02-02"),
    ];
    const shown = displayAssessment(caseWith(runs, [], "old"));
    expect(shown?.run.runId).toBe("old");
    expect(shown?.ratification.status).toBe("ratified");
    // Adopting the newer draft is an edition change; the panel then judges that.
    const adoptedNew = displayAssessment(caseWith(runs, [], "new"));
    expect(adoptedNew?.run.runId).toBe("new");
    expect(adoptedNew?.ratification.status).toBe("contested");
  });

  it("staleness is a hash when the run recorded one, a date otherwise", () => {
    const withHash = (m: string) => ({
      ...mkCheck(m, "2026-02-01"),
      basis: { ledgerHash: sha256Hex("ledger-a") },
    });
    const current = caseWith(
      [mkDraft("d", "2026-01-01"), ...["a", "b", "c", "d", "e"].map(withHash)],
      [{ date: "2026-03-01" }], // history newer than the checks — ignored when hashes exist
    );
    expect(ratification(current)?.status).toBe("ratified");
    expect(checksStale(current)).toBe(false);
    const moved = caseWith(
      [mkDraft("d", "2026-01-01"), ...["a", "b", "c", "d", "e"].map(withHash)],
      [],
      undefined,
      "ledger-b",
    );
    const r = ratification(moved);
    expect(r?.status).toBe("unratified");
    expect(r?.reason).toMatch(/ledger changed/);
    expect(checksStale(moved)).toBe(true);
    // Legacy runs without a hash: content-bearing history newer than the run is stale.
    const legacy = caseWith([mkDraft("d", "2026-01-01"), ...fiveChecks("unresolved")], [{ date: "2026-03-01" }]);
    expect(runStaleness(legacy, legacy.assessmentRuns[1])).toBe("2026-03-01");
    expect(checksStale(legacy)).toBe(true);
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
        // The sweep produced a full panel; how many of those seats still stand
        // (ratification.panel) depends on whether the ledger moved since.
        expect(latestCheckPerModel(c).length).toBeGreaterThanOrEqual(
          RATIFICATION_MIN_PANEL,
        );
      } else {
        expect(shown!.ratification.status).toBe("unratified");
      }
      expect(shown!.ratification.reason.length).toBeGreaterThan(10);
    }
  });

  it("every case's adopted assessment carries a research priority and the dossier header", () => {
    for (const c of loadAllCases()) {
      const ca = adoptedAssessment(c)!.caseAssessment;
      expect(["high", "medium", "low"]).toContain(ca.researchPriority?.level);
      expect(ca.whatIsClaimed).toBeTruthy();
      expect(ca.bestConventionalExplanation).toBeTruthy();
    }
  });

});

describe("cross-model checks", () => {
  it("check runs never narrate; the adopted draft displays", () => {
    const orch = getCaseBySlug("orch-or");
    const checks = orch.assessmentRuns.filter((r) => r.role === "check");
    expect(checks.length).toBeGreaterThanOrEqual(4);
    const shown = displayAssessment(orch);
    expect(shown?.run.role).toBe("draft");
    expect(shown?.run.runId).toBe(currentEdition(orch).assessment?.runId);
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
    const keys = perModel.map((r) => seatKey(r.model));
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

describe("the steelman counterweight", () => {
  const run = (over: {
    date: string;
    steelman?: string;
  }) => ({
    runId: `${over.date}-auto-test`,
    date: over.date,
    caseAssessment: {
      verdict: "unresolved" as const,
      loadBearing: [],
      weakestLinks: [],
      synthesis: "s".repeat(120),
      ...(over.steelman !== undefined ? { steelman: over.steelman } : {}),
    },
  });

  it("runs dated on or after the cutoff must carry a steelman", () => {
    const err = steelmanRequirementError(run({ date: STEELMAN_REQUIRED_FROM }));
    expect(err).toContain("missing caseAssessment.steelman");
    expect(
      steelmanRequirementError(
        run({
          date: STEELMAN_REQUIRED_FROM,
          steelman:
            "The xenon isotope potency split remains unexplained by any classical account in the ledger.",
        }),
      ),
    ).toBeNull();
  });

  it("append-only history is exempt, never rewritten", () => {
    expect(steelmanRequirementError(run({ date: "2026-09-03" }))).toBeNull();
  });

  it("a migration run — a transfer, not a judgment — is exempt", () => {
    expect(
      steelmanRequirementError({ ...run({ date: "2026-09-08" }), migratedFrom: "2026-08-26-auto-x" }),
    ).toBeNull();
    expect(steelmanRequirementError({ ...run({ date: "2026-09-08" }), migratedFrom: undefined })).not.toBeNull();
  });

  it("a whitespace steelman is a missing steelman", () => {
    expect(
      steelmanRequirementError(
        run({
          date: "2027-01-01",
          steelman: "                                             ",
        }),
      ),
    ).not.toBeNull();
  });

  it("the schema floors a present steelman at 40 characters", () => {
    const overlay = {
      runId: "2026-09-04-auto-test",
      model: "test",
      date: "2026-09-04",
      promptVersion: "test",
      humanReviewed: false,
      caseAssessment: {
        verdict: "unresolved",
        loadBearing: [],
        weakestLinks: [],
        synthesis: "s".repeat(120),
        steelman: "too thin",
      },
      claimAssessments: [],
    };
    expect(() => AssessmentRunSchema.parse(overlay)).toThrow();
    expect(() =>
      AssessmentRunSchema.parse({
        ...overlay,
        caseAssessment: {
          ...overlay.caseAssessment,
          steelman:
            "A specific unanswered proponent argument, stated at honest length.",
        },
      }),
    ).not.toThrow();
  });

  it("live content passes the requirement (nothing post-cutoff is missing one)", () => {
    for (const c of loadAllCases()) {
      for (const r of c.assessmentRuns) {
        expect(steelmanRequirementError(r)).toBeNull();
      }
    }
  });
});

describe("surviving objections", () => {
  it("a ratified case's tolerated dissent is surfaced, not sanitized", () => {
    for (const c of loadAllCases()) {
      const shown = displayAssessment(c);
      if (!shown || shown.ratification.status !== "ratified") continue;
      const objections = survivingObjections(c, shown.run);
      // every seat whose word differs — the neighbours the standing tolerates included, so nothing is sanitized
      expect(objections.length).toBeGreaterThanOrEqual(
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

describe("edition succession", () => {
  it("orders editions by the previous chain, not by date or filename", async () => {
    const { orderEditions } = await import("./editions.ts");
    const base = { date: "2026-09-08", model: "m", promptVersion: "edition-v2", rationale: "r", basis: { ledgerHash: "a".repeat(64), inputsHash: "b".repeat(64) }, assessment: null, featuredClaimIds: [], cruxOrder: [], article: "" };
    const migration = { ...base, runId: "edition-2026-09-08-migration", previous: null };
    const successor = { ...base, runId: "edition-2026-09-08-142638", previous: "edition-2026-09-08-migration" };
    const third = { ...base, date: "2026-09-09", runId: "edition-2026-09-09-090000", previous: "edition-2026-09-08-142638" };
    // Filename order puts "migration" after "142638"; the chain says otherwise.
    const ordered = orderEditions([successor, migration, third] as never);
    expect(ordered.map((e) => e.runId)).toEqual([migration.runId, successor.runId, third.runId]);
    // A broken chain keeps the given order for editionErrors to report.
    const orphan = { ...base, runId: "edition-x", previous: "edition-missing" };
    expect(orderEditions([migration, orphan] as never).map((e) => e.runId)).toEqual([migration.runId, "edition-x"]);
  });

  it("geopolymer's editions form one chain from the migration to the current edition", () => {
    const geo = getCaseBySlug("megalithic-casting");
    expect(geo.editions[0].runId).toBe("edition-2026-09-08-migration");
    expect(geo.editions.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < geo.editions.length; i++) expect(geo.editions[i].previous).toBe(geo.editions[i - 1].runId);
    expect(currentEdition(geo).featuredClaimIds).toContain("GEO-C506");
  });
});

describe("stale checks are set aside, not counted", () => {
  it("a hashed check for another ledger and a legacy check older than content drop out; the rest stand", async () => {
    const { currentChecks } = await import("./standing.ts");
    const hash = "a".repeat(64);
    const loaded = { ledgerHash: hash, history: [{ date: "2026-09-01", kind: "content" }, { date: "2026-09-02", kind: "housekeeping" }] } as never;
    const mk = (runId: string, date: string, basis?: string) => ({ runId, date, role: "check", ...(basis ? { basis: { ledgerHash: basis } } : {}) }) as never;
    const fresh1 = mk("2026-09-08-check-a", "2026-09-08", hash);
    const fresh2 = mk("2026-09-08-check-b", "2026-09-08", hash);
    const stale = mk("2026-09-07-check-c", "2026-09-07", "b".repeat(64));
    const legacyOld = mk("2026-08-25-check-d", "2026-08-25"); // content moved on 2026-09-01
    expect(currentChecks(loaded, [fresh1, stale, legacyOld, fresh2]).map((r: { runId: string }) => r.runId)).toEqual(["2026-09-08-check-a", "2026-09-08-check-b"]);
    // A legacy check newer than the last content change still stands (the panel-by-date rule).
    const legacyNew = mk("2026-09-03-check-e", "2026-09-03");
    expect(currentChecks(loaded, [legacyNew, stale]).map((r: { runId: string }) => r.runId)).toEqual(["2026-09-03-check-e"]);
  });
});
