import { describe, expect, it } from "vitest";
import { feedXml } from "./feed.ts";
import { seatTallies, unanimousRejections, voteSummary } from "./gate.ts";
import { liveClaims, loadAllCases } from "./load.ts";
import { currentMoves, dailyMoves, recentMoves, verdictMoves } from "./moves.ts";
import { assessmentGlosses, assessmentLabels, type ArbiterRecord, type AssessmentState } from "./schema.ts";
import { standingGlosses, standingInWords } from "./standing.ts";
import { articleWords, clip, lede, longDate, readingMinutes, withoutIdList } from "./text.ts";
import { pageMeta } from "../config/meta.ts";
import { site } from "../config/site.ts";

/**
 * The reading layer's derivations: what a reader is shown first, and the
 * change history in a reader's terms. They cut nothing and store nothing,
 * so the tests pin exactly that — a lede plus its rest is the whole text; a
 * move is a verdict that two adopted assessments grade differently.
 */

const assessment = (runId: string, verdict: AssessmentState, claims: Record<string, AssessmentState>) => ({
  runId,
  caseAssessment: { verdict },
  claimAssessments: Object.entries(claims).map(([claimId, v]) => ({ claimId, verdict: v })),
});
const edition = (runId: string, date: string, assessmentId: string | null) => ({ runId, date, assessment: assessmentId ? { runId: assessmentId, hash: "h" } : null });
/** A case with four editions: an opening with no assessment, then three judgments, two of them on one day. */
const fixture = (slug = "fixture", title = "Fixture") =>
  ({
    record: { slug, title },
    claims: [
      { id: "X-C001", statement: "The first claim." },
      { id: "X-C002", statement: "The second claim." },
      { id: "X-C003", statement: "The third claim." },
    ],
    assessmentRuns: [
      assessment("a1", "unresolved", { "X-C001": "unresolved", "X-C002": "mixed" }),
      assessment("a2", "unresolved", { "X-C001": "contradicted", "X-C002": "mixed", "X-C003": "well_supported" }),
      assessment("a3", "weakly_supported", { "X-C001": "unresolved", "X-C002": "weakly_supported", "X-C003": "well_supported" }),
    ],
    editions: [
      edition("e0", "2026-09-01", null),
      edition("e1", "2026-09-02", "a1"),
      edition("e2", "2026-09-05", "a2"),
      edition("e3", "2026-09-05", "a3"),
      edition("e4", "2026-09-06", "a3"), // re-adopts a3: the telling changed, the judgment did not
    ],
  }) as never;

describe("verdict moves", () => {
  it("a move is a verdict two successive adopted assessments grade differently — a claim that entered is not one", () => {
    const moves = verdictMoves(fixture());
    expect(moves.map((m) => m.edition)).toEqual(["e2", "e3"]);
    // e1 → e2: C001 moved; C003 entered the featured set, which is not a move; the case verdict held.
    expect(moves[0].moves).toEqual([{ claimId: "X-C001", subject: "The first claim.", live: true, from: "unresolved", to: "contradicted" }]);
    // A claim refused since keeps its words and is marked as having no page.
    const withTombstone = { ...(fixture() as object), claims: [{ id: "X-C001", statement: "The first claim.", reviewState: "rejected" }, { id: "X-C002", statement: "The second claim." }] } as never;
    expect(verdictMoves(withTombstone)[0].moves[0]).toMatchObject({ claimId: "X-C001", live: false, subject: "The first claim." });
    // e2 → e3: the case verdict leads, then the claims in the newer assessment's order.
    expect(moves[1].moves.map((m) => [m.claimId, m.from, m.to])).toEqual([
      [null, "unresolved", "weakly_supported"],
      ["X-C001", "contradicted", "unresolved"],
      ["X-C002", "mixed", "weakly_supported"],
    ]);
    expect(moves[1].moves[0].subject).toBe("Fixture");
    // The current edition re-adopted its predecessor's assessment: it moved nothing.
    expect(currentMoves(fixture())).toEqual([]);
  });

  it("a day's moves are net: a verdict that ends the day where it began is not a move", () => {
    const days = dailyMoves(fixture());
    expect(days.map((d) => d.date)).toEqual(["2026-09-05"]);
    // C001 went unresolved → contradicted → unresolved within the day: nothing to a reader. The case and C002 moved.
    expect(days[0].moves.map((m) => [m.claimId, m.from, m.to])).toEqual([
      [null, "unresolved", "weakly_supported"],
      ["X-C002", "mixed", "weakly_supported"],
    ]);
    expect(days[0].edition).toBe("e3");
    // Every edition is still told apart where the whole history is shown.
    expect(verdictMoves(fixture()).flatMap((e) => e.moves).filter((m) => m.claimId === "X-C001").length).toBe(2);
  });

  it("the feed across cases takes every case's latest day before any case's second", () => {
    const busy = fixture("busy", "Busy");
    const quiet = {
      record: { slug: "quiet", title: "Quiet" },
      claims: [{ id: "Q-C001", statement: "A quiet claim." }],
      assessmentRuns: [assessment("q1", "mixed", { "Q-C001": "mixed" }), assessment("q2", "mixed", { "Q-C001": "unresolved" })],
      editions: [edition("q-e1", "2026-08-01", "q1"), edition("q-e2", "2026-08-02", "q2")],
    } as never;
    const two = recentMoves([busy, quiet], 2);
    expect(two.map((m) => [m.caseSlug, m.date])).toEqual([["busy", "2026-09-05"], ["quiet", "2026-08-02"]]);
    expect(recentMoves([busy, quiet], 1).map((m) => m.caseSlug)).toEqual(["busy"]);
    expect(recentMoves([], 5)).toEqual([]);
  });

  it("holds on the real ledger: every move names a claim the case holds and two different words", () => {
    for (const c of loadAllCases()) {
      const ids = new Set(c.claims.map((k) => k.id));
      const liveIds = new Set(liveClaims(c).map((k) => k.id));
      for (const e of verdictMoves(c)) {
        expect(c.editions.some((ed) => ed.runId === e.edition)).toBe(true);
        for (const m of e.moves) {
          expect(m.from).not.toBe(m.to);
          if (m.claimId) expect(ids.has(m.claimId)).toBe(true);
          // A move is linked to its claim's page only while the claim has one.
          if (m.claimId && m.live) expect(liveIds.has(m.claimId)).toBe(true);
          expect(m.subject.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("the feed", () => {
  it("is well-formed Atom with one entry for each day a case's verdicts moved, and escapes what it carries", () => {
    const c = fixture("a&b", "Cast <Not> Carved");
    const xml = feedXml([c], { siteUrl: "https://example.test/site", siteName: "Aletheia", subtitle: "Contested claims" });
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml.match(/<entry>/g)?.length).toBe(1);
    expect(xml).toContain("<updated>2026-09-05T00:00:00Z</updated>");
    expect(xml).toContain("<title>Cast &lt;Not&gt; Carved: 2 verdicts moved</title>");
    expect(xml).toContain('<link href="https://example.test/site/cases/a&amp;b/#history"/>');
    expect(xml).toContain(`The case verdict: ${assessmentLabels.unresolved} → ${assessmentLabels.weakly_supported}`);
    // A claim's statement ends in a full stop; the line that carries it does not read "claim.: word".
    expect(xml).toContain(`The second claim: ${assessmentLabels.mixed} → ${assessmentLabels.weakly_supported}`);
    expect(xml).not.toMatch(/<(?!\/?(feed|id|title|subtitle|link|updated|author|name|entry|summary)\b|\?xml)/);
    // No cases, no entries: still a feed.
    expect(feedXml([], { siteUrl: "https://example.test", siteName: "A", subtitle: "s" })).toContain("<feed");
  });
});

describe("a page shared as a link", () => {
  it("previews as itself: its own title, description and address, and its own image when it has one", () => {
    const own = pageMeta({ title: "State, Not Scar", description: "Are muscle knots states?", path: "/cases/vasocomputation/", image: { url: "/images/cover.jpg", alt: "A cover" }, article: true });
    expect(own.title).toBe("State, Not Scar");
    expect(own.alternates).toEqual({ canonical: "/cases/vasocomputation/" });
    expect(own.openGraph).toMatchObject({ type: "article", title: "State, Not Scar", description: "Are muscle knots states?", url: "/cases/vasocomputation/", images: [{ url: "/images/cover.jpg", alt: "A cover" }] });
    expect(own.twitter).toMatchObject({ card: "summary_large_image", title: "State, Not Scar", images: ["/images/cover.jpg"] });
    // A page with no image of its own is shown under the site's card, still by its own title.
    const plain = pageMeta({ title: "Method", description: "How it works.", path: "/method/" });
    expect(plain.openGraph).toMatchObject({ type: "website", title: "Method", images: [{ url: site.ogImage }] });
    expect(plain.twitter).toMatchObject({ title: "Method", images: [site.ogImage] });
  });
});

describe("what a reader is shown first", () => {
  it("a lede is whole sentences and, with its rest, the whole text", () => {
    const text = "An opening of a moderate length. Then a second sentence that is rather longer than the first one was. And a third.\n\nA new paragraph follows here.";
    const { lede: first, rest } = lede(text, 60);
    expect(first).toBe("An opening of a moderate length.");
    expect(rest).toBe("Then a second sentence that is rather longer than the first one was. And a third.\n\nA new paragraph follows here.");
    expect(rest).toContain("\n\n"); // the rest keeps its paragraphs
    // A text that fits is all lede; the first sentence is kept whole however long.
    expect(lede("Fits.", 60)).toEqual({ lede: "Fits.", rest: "" });
    const long = "One very long sentence that runs on and on past any limit a caller might give it. Short.";
    expect(lede(long, 20).lede).toBe("One very long sentence that runs on and on past any limit a caller might give it.");
    // A very short opening takes the next sentence too, within half again of the limit.
    const slogan = "Knots are states. In the form the case grades, the state is smooth muscle held in its latch inside the muscle. More follows after that, at length, for a good while longer than the limit.";
    expect(lede(slogan, 100).lede).toBe("Knots are states. In the form the case grades, the state is smooth muscle held in its latch inside the muscle.");
    // An abbreviation is not the end of a sentence.
    expect(lede("It measured, e.g. the area, in every site it examined across both muscles. Then it stopped.", 40).lede).toBe("It measured, e.g. the area, in every site it examined across both muscles.");
  });

  it("does not end a sentence at an abbreviation, an initial, or before a citation in brackets", () => {
    const pad = " The rest of the passage runs on for long enough that the text does not fit in the opening, and so it has to be cut at the end of one of its sentences, wherever that is.";
    // An opening shorter than any first sentence here: the lede is exactly the first sentence, as the rule finds it.
    const first = (text: string) => lede(text + pad, 40).lede;
    expect(first("The circles were not found in the Planck data; Bodnia et al. (CCC-E012) find no significant excess.")).toBe("The circles were not found in the Planck data; Bodnia et al. (CCC-E012) find no significant excess.");
    expect(first("A blinded re-analysis of the slab No. 2 sandstone against a broad set of natural controls would decide it.")).toBe("A blinded re-analysis of the slab No. 2 sandstone against a broad set of natural controls would decide it.");
    expect(first("The measurement of the quarrying rate is by R. Engelbach. It was made in 1922.")).toBe("The measurement of the quarrying rate is by R. Engelbach.");
    // A citation in brackets stays with the sentence it supports; a numbered point starts a new one.
    expect(first("The book answers its own 'where are the drugs?' (TIK-E024). Not contradicted, and not shown.")).toBe("The book answers its own 'where are the drugs?' (TIK-E024).");
    expect(first("The first of the points can be absorbed either way. (2) Before that, closure of the loophole is needed.")).toBe("The first of the points can be absorbed either way.");
    // Whatever it decides, nothing is lost.
    for (const text of ["Bodnia et al. (CCC-E012) find none. More follows here." + pad, "Is it so? (It is.) Then more." + pad]) {
      const { lede: opening, rest } = lede(text, 30);
      expect(`${opening} ${rest}`.trim()).toBe(text.trim());
    }
  });

  it("counts an article's words without its markup, and gives the reading time", () => {
    const md = "## A heading\n\nTwo [marked words]{claim=GEO-C001} here.\n\n{plate:IMG-GEO-P01}\n\n- one *item*";
    expect(articleWords(md)).toBe(8);
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(2300)).toBe(10);
    expect(longDate("2026-09-23")).toBe("23 September 2026");
    expect(longDate("not a date")).toBe("not a date");
  });

  it("clips at a word, and takes a trailing list of record ids off a label", () => {
    expect(clip("short", 20)).toBe("short");
    expect(clip("the quick brown fox jumps over", 18)).toBe("the quick brown…");
    expect(withoutIdList("The salt line: medieval report and modern halite (GEO-C003, GEO-C506, GEO-C907)")).toBe("The salt line: medieval report and modern halite");
    expect(withoutIdList("Egyptian branch (GEO-C020)")).toBe("Egyptian branch");
    expect(withoutIdList("The conformal bridge (theory rung)")).toBe("The conformal bridge (theory rung)");
    expect(withoutIdList("Quantum reconstruction theorems (the proven half)")).toBe("Quantum reconstruction theorems (the proven half)");
  });

  it("every verdict word and every standing has its gloss, and the standing's words never claim a human", () => {
    for (const state of Object.keys(assessmentLabels) as AssessmentState[]) expect(assessmentGlosses[state].length).toBeGreaterThan(20);
    for (const gloss of Object.values(standingGlosses)) expect(gloss).not.toMatch(/human|editor|reviewer/i);
    expect(standingInWords({ status: "ratified", agreeing: 4, panel: 5 })).toBe("ratified by 4 of 5 independent models");
    expect(standingInWords({ status: "contested", agreeing: 2, panel: 5 })).toBe("contested: the independent models split");
    expect(standingInWords({ status: "unratified", agreeing: 0, panel: 0 })).toMatch(/^not yet ratified: awaiting an independent check/);
    expect(standingInWords({ status: "unratified", agreeing: 2, panel: 2 })).toBe("not yet ratified: only 2 independent models have checked it as it stands");
    expect(standingInWords({ status: "unratified", agreeing: 0, panel: 0 }, { short: true })).toBe("not yet ratified");
    expect(standingInWords({ status: "contested", agreeing: 0, panel: 5 }, { short: true })).toBe("contested by the panel");
  });
});

describe("the gate's record", () => {
  const seat = (name: string, vote: "complies" | "violates" | "unsure") => ({ seat: name, vote, rules: [], reasoning: "r" });
  const record = (pr: number, outcomeAt: string, votes: ("complies" | "violates" | "unsure")[], openai = "GPT-5.6 Sol (OpenAI)"): ArbiterRecord =>
    ({
      pr,
      title: `PR ${pr}`,
      url: `https://github.com/o/r/pull/${pr}`,
      verdict: votes.every((v) => v === "complies") ? "pass" : "park",
      reason: "r",
      outcome: "merged",
      outcomeAt,
      judgedAgainst: "abc",
      promptVersion: "panel-v3",
      harvestedAt: outcomeAt,
      seats: [seat("Opus 5.5 (Anthropic)", votes[0]), seat(openai, votes[1]), seat("Gemini 3.8 Flash (Google)", votes[2])],
    }) as ArbiterRecord;

  it("tallies each seat across model changes, and counts the objections it made alone", () => {
    const records = [
      record(1, "2026-08-25", ["complies", "violates", "complies"], "GPT-5.1 (OpenAI)"),
      record(2, "2026-09-10", ["complies", "violates", "unsure"]),
      record(3, "2026-09-11", ["violates", "violates", "violates"]),
      record(4, "2026-09-12", ["complies", "complies", "complies"]),
    ];
    const t = Object.fromEntries(seatTallies(records).map((s) => [s.key, s]));
    expect(t.openai).toMatchObject({ label: "GPT-5.6 Sol (OpenAI)", labels: ["GPT-5.6 Sol (OpenAI)", "GPT-5.1 (OpenAI)"], judged: 4, complies: 1, violates: 3, unsure: 0, alone: 2 });
    expect(t.anthropic).toMatchObject({ judged: 4, complies: 3, violates: 1, alone: 0 });
    expect(t.google).toMatchObject({ complies: 2, unsure: 1, violates: 1, alone: 0 });
    expect(unanimousRejections(records).map((r) => r.pr)).toEqual([3]);
    expect(voteSummary(records[3])).toBe("3 comply");
    expect(voteSummary(records[1])).toBe("1 complies · 1 violates (GPT-5.6 Sol (OpenAI)) · 1 unsure (Gemini 3.8 Flash (Google))");
    expect(voteSummary(records[2])).toBe("3 violate");
  });
});

describe("an image's size, read from its header", () => {
  it("reads PNG and JPEG headers, and says nothing of what it cannot read", async () => {
    const { imageSize, sizeOf } = await import("./imageSize.ts");
    // A PNG header: signature, IHDR length and tag, then width 640 and height 360.
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from("IHDR"), Buffer.from([0, 0, 0x02, 0x80, 0, 0, 0x01, 0x68])]);
    expect(sizeOf(png)).toEqual({ width: 640, height: 360 });
    // A JPEG: start of image, an APP0 segment to step over, then a baseline frame of 1600 by 900.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x84, 0x06, 0x40, 0x03, 0x01, 0x22, 0x00]);
    expect(sizeOf(jpeg)).toEqual({ width: 1600, height: 900 });
    expect(sizeOf(Buffer.from("not an image at all"))).toBeNull();
    expect(imageSize("/images/no-such-file.jpg")).toBeNull();
    // Every image a case holds has a size the pages can reserve.
    for (const c of loadAllCases()) {
      for (const img of c.images) {
        const size = imageSize(img.file);
        expect(size, img.id).not.toBeNull();
        expect(size!.width).toBeGreaterThan(100);
        expect(size!.height).toBeGreaterThan(100);
      }
    }
  });
});

describe("the text colours can be read", () => {
  it("every text colour meets 4.5:1 on the grounds it is set on, in both registers", async () => {
    const fs = await import("node:fs");
    const css = fs.readFileSync("app/globals.css", "utf8");
    const block = (selector: string) => Object.fromEntries([...(css.split(selector)[1]?.split("}")[0] ?? "").matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
    const light = block(".bg-paper-deep {");
    const dark = block(".bg-dossier-soft {");
    const theme = Object.fromEntries([...css.matchAll(/(--color-[a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
    const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    };
    const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
    expect(Object.keys(light).length).toBe(6);
    for (const [name, colour] of Object.entries(light)) {
      expect(contrast(colour, theme["--color-paper"]), `${name} on paper`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colour, theme["--color-paper-deep"]), `${name} on a panel's deeper paper`).toBeGreaterThanOrEqual(4.5);
    }
    for (const [name, colour] of Object.entries(dark)) {
      expect(contrast(colour, theme["--color-dossier"]), `${name} on the dossier`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colour, theme["--color-dossier-soft"]), `${name} on the dossier's panels`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(theme["--color-ink-soft"], theme["--color-paper-deep"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme["--color-dossier-faint"], theme["--color-dossier-soft"])).toBeGreaterThanOrEqual(4.5);
  });
});
