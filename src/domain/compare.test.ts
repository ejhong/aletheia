import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { articleLengths, comparisonInWords } from "./comparison.ts";
import { currentEdition } from "./editions.ts";
import { loadAllCases } from "./load.ts";
import { EditionComparisonSchema, EditionSchema, type EditionComparison, type LoadedCase, type SeatPreference } from "./schema.ts";
import {
  candidateLetters,
  compareTellings,
  comparisonPacket,
  comparisonSentence,
  PREFERENCE_MIN,
  readerText,
  readPreference,
  tallyPreference,
  type Telling,
} from "../pipeline/compare.ts";
import { readerNotesFor, runEdition, type Comparer, type Editor, type EditionReply } from "../pipeline/edition.ts";
import { readRuns } from "../pipeline/store.ts";
import { VENDORS } from "../pipeline/transport.ts";

/**
 * The comparison is the test of "better": a candidate edition replaces the
 * incumbent's telling only when the panel's seats, reading both as a reader
 * would, prefer it. The tests are about the ways that could quietly stop
 * being true — a tie counted as a preference, a seat's letter read as the
 * wrong telling, a failed seat counted for a side, a declined candidate
 * written anyway.
 */

const prefs = (...p: SeatPreference["prefers"][]) => p.map((prefers) => ({ prefers }));

describe("the panel's preference", () => {
  it("prefers a telling only with three seats for it and at most one against", () => {
    expect(tallyPreference(prefs("candidate", "candidate", "candidate", "candidate", "candidate")).outcome).toBe("candidate-preferred");
    expect(tallyPreference(prefs("candidate", "candidate", "candidate", "incumbent", "neither")).outcome).toBe("candidate-preferred");
    expect(tallyPreference(prefs("candidate", "candidate", "candidate", "neither", "neither")).outcome).toBe("candidate-preferred");
    // Three to two is a split, not a preference.
    expect(tallyPreference(prefs("candidate", "candidate", "candidate", "incumbent", "incumbent")).outcome).toBe("no-clear-preference");
    expect(tallyPreference(prefs("candidate", "candidate", "neither", "neither", "neither")).outcome).toBe("no-clear-preference");
    expect(tallyPreference(prefs("neither", "neither", "neither", "neither", "neither")).outcome).toBe("no-clear-preference");
    // The same terms for the incumbent.
    expect(tallyPreference(prefs("incumbent", "incumbent", "incumbent", "candidate", "neither"))).toEqual({ outcome: "incumbent-preferred", candidate: 1, incumbent: 3, neither: 1 });
    expect(tallyPreference(prefs("incumbent", "incumbent", "incumbent", "candidate", "candidate")).outcome).toBe("no-clear-preference");
  });

  it("decides nothing on fewer than three answers, however they fall", () => {
    expect(PREFERENCE_MIN).toBe(3);
    expect(tallyPreference(prefs("candidate", "candidate")).outcome).toBe("undecided");
    expect(tallyPreference([]).outcome).toBe("undecided");
    // Three answers, all for the candidate, is the least that prefers it.
    expect(tallyPreference(prefs("candidate", "candidate", "candidate")).outcome).toBe("candidate-preferred");
  });

  it("draws the candidate's letter per seat: fixed for the record, and balanced within every run", () => {
    const seats = ["anthropic", "openai", "gemini", "xai", "venice"];
    expect(candidateLetters("2099-01-01-edition-x-120000", seats)).toEqual(candidateLetters("2099-01-01-edition-x-120000", [...seats].reverse()));
    let firstForOpenai = 0;
    for (let i = 0; i < 400; i++) {
      const letters = candidateLetters(`run-${i}`, seats);
      const asA = seats.filter((s) => letters[s] === "A").length;
      // In every run the candidate is read first by two seats or by three: never by all, never by none.
      expect(asA === 2 || asA === 3).toBe(true);
      if (letters.openai === "A") firstForOpenai++;
      // So a panel that chose whatever it read first would split three to two, which prefers nothing.
      const byPosition = seats.map((s) => ({ prefers: letters[s] === "A" ? ("candidate" as const) : ("incumbent" as const) }));
      expect(tallyPreference(byPosition).outcome).toBe("no-clear-preference");
    }
    // Across runs a seat sees the candidate first about half the time.
    expect(firstForOpenai).toBeGreaterThan(150);
    expect(firstForOpenai).toBeLessThan(250);
    expect(candidateLetters("r", [])).toEqual({});
  });

  it("reads a seat's letter as the telling that carried it, and fails closed on anything else", () => {
    const reply = (o: object) => JSON.stringify(o);
    const reasons = "The first telling reaches the state of the question in its opening paragraph; the second does not.";
    expect(readPreference(reply({ prefers: "A", margin: "clear", reasons, notes: ["Shorten the second section."] }), "A")).toEqual({ prefers: "candidate", margin: "clear", reasons, notes: ["Shorten the second section."] });
    expect(readPreference(reply({ prefers: "A", margin: "slight", reasons }), "B").prefers).toBe("incumbent");
    expect(readPreference(reply({ prefers: "B", margin: "clear", reasons }), "B").prefers).toBe("candidate");
    // Neither carries no margin; notes are at most three, and only strings.
    expect(readPreference("```json\n" + reply({ prefers: "neither", margin: "clear", reasons, notes: ["a", 2, "b", "c", "d"] }) + "\n```", "A")).toEqual({ prefers: "neither", margin: null, reasons, notes: ["a", "b", "c"] });
    // Anything but a well-formed choice is a seat that did not answer.
    expect(() => readPreference(reply({ prefers: "candidate", reasons }), "A")).toThrow(/unknown preference/);
    expect(() => readPreference(reply({ prefers: "A", reasons: "yes" }), "A")).toThrow(/reasons/);
    expect(() => readPreference("I prefer the first one.", "A")).toThrow();
  });
});

describe("the comparison in a reader's words", () => {
  const record = (...p: SeatPreference["prefers"][]): EditionComparison => {
    const seats = p.map((prefers, n) => ({ seat: `Seat ${n}`, model: `m${n}`, candidateShownAs: "A" as const, prefers, margin: null, reasons: "reasons given at length", notes: [] }));
    return { against: "edition-before", protocol: "compare-v1", ...tallyPreference(seats), seats };
  };
  it("says what the models preferred, and never that the edition is better", () => {
    expect(comparisonInWords(undefined)).toBeNull();
    expect(comparisonInWords(record("candidate", "candidate", "candidate", "candidate", "candidate"))).toBe("5 AI models read it beside the edition before it, as a reader would: all 5 preferred this one.");
    expect(comparisonInWords(record("candidate", "candidate", "candidate", "incumbent", "neither"))).toBe("5 AI models read it beside the edition before it, as a reader would: 3 preferred this one, 1 the one before, 1 neither.");
    // An edition that went out though it was not preferred says why it did.
    expect(comparisonInWords(record("incumbent", "incumbent", "incumbent", "candidate", "neither"))).toBe(
      "5 AI models read it beside the edition before it, as a reader would: 1 preferred this one, 3 the one before, 1 neither. It replaced that edition because the evidence had changed or the panel had to be answered, not because it was preferred.",
    );
    expect(comparisonInWords({ ...record("candidate", "candidate"), failed: ["xai: no key", "venice: no key", "gemini: timeout"] })).toBe(
      "Too few of the panel's AI models answered to compare it with the edition before it (2 did; 3 did not answer); it replaced that edition because the evidence had changed.",
    );
    for (const c of [record("candidate", "candidate", "candidate"), record("incumbent", "incumbent", "incumbent")]) {
      expect(comparisonInWords(c)).not.toMatch(/better|human|reviewed|ratified/i);
    }
  });

  it("gives the article's length now and in the edition before it", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    const editions = [
      { runId: "e1", previous: null, article: words(50) },
      { runId: "e2", previous: "e1", article: `## Heading\n\n[${words(20)}]{claim=X-C001}` },
    ];
    expect(articleLengths({ editions } as never)).toEqual({ now: 21, before: 50 });
    expect(articleLengths({ editions: editions.slice(0, 1) } as never)).toEqual({ now: 50, before: null });
  });
});

const telling = (article: string, current: boolean): Telling => ({
  question: "Were the blocks cast?",
  verdict: "Unresolved",
  components: [{ label: "The Egyptian branch", state: "Contradicted" }],
  whatIsClaimed: "Some blocks were cast.",
  whereDisagreementLives: "Over what the chemistry can show.",
  whatWouldSettleIt: "A blinded test.",
  article,
  current,
});

describe("what a seat is shown", () => {
  it("is the article as the page renders it: a claim span is its words, a plate is a picture", () => {
    expect(readerText("## Heading\n\n[The rate is 216 cm³ an hour]{claim=GEO-C001}, measured once.\n\n{plate:IMG-GEO-P01}\n\n\n\nEnd.")).toBe(
      "## Heading\n\nThe rate is 216 cm³ an hour, measured once.\n\n[a plate: a photograph or figure, with its caption]\n\nEnd.",
    );
  });

  it("carries both tellings under the letters drawn, with their lengths and whether each is current", () => {
    const candidate = telling("The newer article.", true);
    const incumbent = telling("The older article, which is longer than the other one.", false);
    const asA = comparisonPacket(candidate, incumbent, "A");
    expect(asA.indexOf("=== TELLING A ===")).toBeLessThan(asA.indexOf("The newer article."));
    expect(asA.indexOf("The newer article.")).toBeLessThan(asA.indexOf("=== TELLING B ==="));
    const asB = comparisonPacket(candidate, incumbent, "B");
    expect(asB.indexOf("The older article")).toBeLessThan(asB.indexOf("=== TELLING B ==="));
    expect(asB).toContain("WRITTEN FROM: the evidence as it stood before it last changed");
    expect(asB).toContain("WRITTEN FROM: the evidence as it stands today");
    expect(asB).toContain("LENGTH: the article is 3 words; the three header answers together are 13 words");
    // Neither packet says which telling is the candidate.
    expect(asA).not.toMatch(/candidate|incumbent/i);
  });
});

const fixtureCase = (): LoadedCase => {
  // A real case with its founding inputs set aside, so the verb reads no file outside the fixture root; and one
  // that is within the reader's budget, so the candidate below is judged on the comparison alone.
  const c = loadAllCases().find((x) => x.record.slug === "zero-worlds")!;
  return { ...c, narrativeInputs: [] };
};

describe("compareTellings", () => {
  it("asks every seat, reads each letter by that seat's draw, and counts a seat that fails for neither side", async () => {
    const c = fixtureCase();
    const runId = "2099-01-01-edition-zero-worlds-120000";
    const seats = Object.keys(VENDORS);
    expect(seats).toHaveLength(5);
    const sent: Record<string, string> = {};
    const reasons = "The telling I chose states what is claimed and where it stands before its second paragraph.";
    const call = async (seat: string, prompt: { system: string; user: string }) => {
      sent[seat] = prompt.user;
      const mine = candidateLetters(runId, seats)[seat];
      const other = mine === "A" ? "B" : "A";
      const i = seats.indexOf(seat);
      // Three seats for the candidate, one for the incumbent, one reply that is not a choice.
      const text = i < 3 ? JSON.stringify({ prefers: mine, margin: "clear", reasons, notes: ["Name the alternatives sooner."] }) : i === 3 ? JSON.stringify({ prefers: other, margin: "slight", reasons }) : "I would rather not say.";
      return { text, model: `model-of-${seat}`, usage: { inputTokens: 10, outputTokens: 5 }, usd: 0 };
    };
    const candidate = telling("The candidate's article.", true);
    const incumbent = telling("The incumbent's article.", true);
    const record = await compareTellings(c, candidate, incumbent, { runId, against: "edition-before", meter: { runId, verb: "edition", case: c.record.slug } }, { deps: { call } });
    expect(EditionComparisonSchema.safeParse(record).success).toBe(true);
    expect(record).toMatchObject({ against: "edition-before", protocol: "compare-v1", outcome: "candidate-preferred", candidate: 3, incumbent: 1, neither: 0 });
    expect(record.failed).toHaveLength(1);
    expect(record.failed![0]).toContain(seats[4]);
    expect(record.seats.map((s) => s.prefers)).toEqual(["candidate", "candidate", "candidate", "incumbent"]);
    // Each seat was sent the candidate under its own letter, and the record says which.
    for (const s of seats.slice(0, 4)) {
      const letter = candidateLetters(runId, seats)[s];
      expect(sent[s]).toBe(comparisonPacket(candidate, incumbent, letter));
      expect(record.seats.find((x) => x.model === `model-of-${s}`)?.candidateShownAs).toBe(letter);
    }
    expect(comparisonSentence(record)).toBe("the panel's seats, reading both as a reader would, preferred the candidate (3 for the candidate, 1 for the incumbent, 0 for neither, 1 seat(s) not answering; compare-v1, against edition-before)");
  });

  it("with no seat to ask, the comparison is undecided and nothing is sent", async () => {
    const c = fixtureCase();
    const record = await compareTellings(c, telling("a", true), telling("b", true), { runId: "r", against: "e", meter: { runId: "r", verb: "edition", case: c.record.slug } }, { seats: [] });
    expect(record).toMatchObject({ outcome: "undecided", candidate: 0, incumbent: 0, neither: 0, seats: [] });
  });
});

describe("the edition verb and the comparison", () => {
  const now = () => new Date("2099-01-01T12:00:00Z");
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-compare-"));
  const reasons = "The telling chosen gets a reader to the state of the question sooner, and says it in fewer words.";
  const seat = (prefers: SeatPreference["prefers"], n: number): SeatPreference => ({ seat: `Seat ${n}`, model: `m${n}`, candidateShownAs: n % 2 ? "A" : "B", prefers, margin: prefers === "neither" ? null : "clear", reasons, notes: prefers === "candidate" ? [] : ["The opening buries the verdict."] });
  const comparer = (...p: SeatPreference["prefers"][]): Comparer => async (_l, _c, _i, ctx) => {
    const seats = p.map((x, n) => seat(x, n));
    return { against: ctx.against, protocol: "compare-v1", ...tallyPreference(seats), seats };
  };
  /** A candidate that re-tells the incumbent: the same judgment, the same selection, one paragraph changed. */
  const retelling = (c: LoadedCase, seen: string[] = []): Editor => async (_system, user) => {
    seen.push(user);
    const ed = currentEdition(c);
    const data: EditionReply = { rationale: "a plainer opening; the judgment is unchanged", question: null, accounts: [], featuredClaimIds: ed.featuredClaimIds, cruxOrder: ed.cruxOrder, article: `${ed.article}\n\nA closing sentence.`, researchStatus: [], assessment: null };
    return { data, model: "claude-opus-5-5" };
  };
  const editionsIn = (root: string, c: LoadedCase) => {
    const dir = path.join(root, "content", "cases", c.dir, "editions");
    return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  };

  it("a new telling of an unmoved ledger replaces the incumbent when the seats prefer it, and records how they chose", { timeout: 60_000 }, async () => {
    const c = fixtureCase();
    const root = tmp();
    const out = await runEdition("zero-worlds", { force: true, root, deps: { cases: () => [c], now, edit: retelling(c), compare: comparer("candidate", "candidate", "candidate", "incumbent", "neither") } });
    expect(out.outcome).toBe("completed");
    expect(out.reason).toContain("preferred the candidate (3 for the candidate, 1 for the incumbent, 1 for neither");
    expect(editionsIn(root, c)).toHaveLength(1);
    const written = EditionSchema.parse(parseYaml(fs.readFileSync(out.editionFile!, "utf8")));
    expect(written.previous).toBe(currentEdition(c).runId);
    expect(written.comparison).toMatchObject({ against: currentEdition(c).runId, outcome: "candidate-preferred", candidate: 3, incumbent: 1, neither: 1 });
    expect(written.comparison!.seats).toHaveLength(5);
    // The run keeps the comparison beside its record.
    expect(fs.existsSync(path.join(root, "proposals", out.runId, "comparison.yaml"))).toBe(true);
  });

  it("a new telling the seats do not prefer is not written: the incumbent stands and the candidate is kept with the run", { timeout: 60_000 }, async () => {
    const c = fixtureCase();
    for (const votes of [["candidate", "candidate", "candidate", "incumbent", "incumbent"], ["incumbent", "incumbent", "incumbent", "incumbent", "candidate"], ["neither", "neither", "neither", "neither", "neither"]] as SeatPreference["prefers"][][]) {
      const root = tmp();
      const out = await runEdition("zero-worlds", { force: true, root, deps: { cases: () => [c], now, edit: retelling(c), compare: comparer(...votes) } });
      expect(out.outcome, votes.join(",")).toBe("completed");
      expect(out.reason).toMatch(/^the incumbent stands: /);
      expect(out.editionFile).toBeUndefined();
      expect(out.wrote).toBeUndefined();
      expect(editionsIn(root, c)).toEqual([]);
      const kept = parseYaml(fs.readFileSync(path.join(root, "proposals", out.runId, "candidate.yaml"), "utf8"));
      expect(kept.edition.article).toContain("A closing sentence.");
      const record = EditionComparisonSchema.parse(parseYaml(fs.readFileSync(path.join(root, "proposals", out.runId, "comparison.yaml"), "utf8")));
      expect(record.outcome).not.toBe("candidate-preferred");
      // The run is on the record as completed with nothing written.
      expect(readRuns(root).at(-1)).toMatchObject({ runId: out.runId, verb: "edition", outcome: "completed" });
    }
  });

  it("a comparison that could not be made writes nothing and fails the run", { timeout: 60_000 }, async () => {
    const c = fixtureCase();
    const root = tmp();
    const out = await runEdition("zero-worlds", { force: true, root, deps: { cases: () => [c], now, edit: retelling(c), compare: comparer("candidate", "candidate") } });
    expect(out.outcome).toBe("failed");
    expect(out.reason).toContain("too few of the panel's seats answered");
    expect(editionsIn(root, c)).toEqual([]);
  });

  it("when the ledger has moved the candidate goes out, and the seats' preference is recorded on it whatever it was", { timeout: 60_000 }, async () => {
    const c = { ...fixtureCase(), ledgerHash: "f".repeat(64) };
    for (const votes of [["incumbent", "incumbent", "incumbent", "incumbent", "neither"], ["candidate", "candidate"]] as SeatPreference["prefers"][][]) {
      const root = tmp();
      const out = await runEdition("zero-worlds", { root, deps: { cases: () => [c], now, edit: retelling(c), compare: comparer(...votes) } });
      expect(out.outcome, votes.join(",")).toBe("completed");
      expect(editionsIn(root, c)).toHaveLength(1);
      const written = EditionSchema.parse(parseYaml(fs.readFileSync(out.editionFile!, "utf8")));
      expect(written.basis.ledgerHash).toBe("f".repeat(64));
      expect(written.comparison!.outcome).toBe(votes.length === 2 ? "undecided" : "incumbent-preferred");
      expect(out.reason).toContain(votes.length === 2 ? "too few of the panel's seats answered" : "preferred the incumbent");
    }
  });

  it("the next edition is told what the seats said: of the incumbent, and of a candidate they declined since", { timeout: 60_000 }, async () => {
    const c = fixtureCase();
    const root = tmp();
    // Nothing said yet.
    expect(readerNotesFor(c, root)).toEqual([]);
    // A candidate is declined; its comparison stays with its run.
    const declined = await runEdition("zero-worlds", { force: true, root, deps: { cases: () => [c], now, edit: retelling(c), compare: comparer("incumbent", "incumbent", "incumbent", "neither", "neither") } });
    const notes = readerNotesFor(c, root);
    expect(notes).toHaveLength(5);
    expect(notes[0]).toMatchObject({ about: "a candidate the seats did not prefer to the incumbent", source: `proposals/${declined.runId}/comparison.yaml`, preferred: "incumbent", reasons, notes: ["The opening buries the verdict."] });
    // The next run's packet carries them to the drafter.
    const seen: string[] = [];
    await runEdition("zero-worlds", { force: true, root, deps: { cases: () => [c], now: () => new Date("2099-01-02T12:00:00Z"), edit: retelling(c, seen), compare: comparer("candidate", "candidate", "candidate", "candidate", "candidate") } });
    const packet = JSON.parse(seen[0]);
    expect(packet.readerNotes).toHaveLength(5);
    expect(packet.readerNotes[0].notes).toEqual(["The opening buries the verdict."]);
    // An incumbent that carries its own comparison passes its seats' words on too.
    const comparison: EditionComparison = { against: "edition-before", protocol: "compare-v1", ...tallyPreference([seat("candidate", 0), seat("candidate", 1), seat("candidate", 2)]), seats: [seat("candidate", 0), seat("candidate", 1), seat("candidate", 2)] };
    const withRecord = { ...c, editions: [...c.editions.slice(0, -1), { ...currentEdition(c), comparison }] };
    expect(readerNotesFor(withRecord, tmp()).map((n) => n.about)).toEqual(Array(3).fill("the incumbent, when it replaced the edition before it"));
  });

  it("a candidate over the reader's budget is sent back once with the counts, and refused if it is still over", { timeout: 60_000 }, async () => {
    const c = fixtureCase();
    const root = tmp();
    const asked: string[] = [];
    const long: Editor = async (_system, user) => {
      asked.push(user);
      const ed = currentEdition(c);
      return { data: { rationale: "everything the ledger holds", question: null, accounts: [], featuredClaimIds: ed.featuredClaimIds, cruxOrder: ed.cruxOrder, article: `${ed.article}\n\n${Array(3100).fill("more").join(" ")}`, researchStatus: [], assessment: null }, model: "claude-opus-5-5" };
    };
    let compared = 0;
    const out = await runEdition("zero-worlds", { force: true, root, deps: { cases: () => [c], now, edit: long, compare: async (...a) => (compared++, comparer("candidate", "candidate", "candidate")(...a)) } });
    expect(out.outcome).toBe("failed");
    expect(out.reason).toMatch(/the article is [\d,]+ words without markup; the ceiling is 3,000/);
    expect(asked).toHaveLength(2);
    expect(asked[1]).toContain("the ceiling is 3,000");
    // A candidate that fails the rules is never put to the seats.
    expect(compared).toBe(0);
    expect(editionsIn(root, c)).toEqual([]);
  });

  it("the drafter is told where an incumbent is over the budget, and may not keep an assessment that is", { timeout: 60_000 }, async () => {
    const geo = { ...loadAllCases().find((x) => x.record.slug === "megalithic-casting")!, narrativeInputs: [] };
    const version = Number(currentEdition(geo).promptVersion.match(/^edition-v(\d+)$/)?.[1] ?? 0);
    // Holds while the real case's incumbent predates the budget; once it is re-told under v13 there is nothing to tell.
    if (version >= 13) return;
    const root = tmp();
    const seen: string[] = [];
    const out = await runEdition("megalithic-casting", { force: true, root, deps: { cases: () => [geo], now, edit: retelling(geo, seen), compare: comparer("candidate", "candidate", "candidate") } });
    const packet = JSON.parse(seen[0]);
    expect(packet.edition.overBudget.some((e: string) => /^the article is /.test(e))).toBe(true);
    expect(packet.edition.overBudget.some((e: string) => /^assessment /.test(e))).toBe(true);
    expect(out.outcome).toBe("failed");
    expect(out.reason).toMatch(/re-adopts assessment .* which is over the reader's budget/);
  });
});
