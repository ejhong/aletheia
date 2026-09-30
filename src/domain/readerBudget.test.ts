import { describe, expect, it } from "vitest";
import { adoptedAssessment, currentEdition } from "./editions.ts";
import { loadAllCases } from "./load.ts";
import { articleBudgetErrors, assessmentBudgetErrors, openingWords, proseWords, READER_BUDGET, readerBudgetText } from "./readerBudget.ts";
import type { AssessmentRun } from "./schema.ts";
import { articleWords } from "./text.ts";
import { loadProtocol, renderProtocol } from "../pipeline/protocols.ts";

/**
 * The reader's budget is the floor under "better is not longer": an edition
 * over a ceiling is refused. So the tests are about the two ways a floor
 * fails — it lets an overlong field through, or it refuses one that is
 * within its limit.
 */

const words = (n: number, word = "word") => Array.from({ length: n }, () => word).join(" ");
/** An assessment's reader-facing fields, each well inside its limit. */
const within = (over: Partial<AssessmentRun["caseAssessment"]> = {}, claims: { claimId: string; reasoning: string }[] = []) =>
  ({
    caseAssessment: {
      verdict: "unresolved",
      whatIsClaimed: "Some megalithic blocks were cast, not carved.",
      whereDisagreementLives: "Over whether the stone's chemistry can tell a cast block from a quarried one.",
      whatWouldSettleIt: "A blinded test of a provenanced fragment against the quarry.",
      researchPriority: { level: "medium", reason: "The decisive tests are cheap and unrun." },
      bestConventionalExplanation: "They were quarried and dressed.",
      synthesis: "The case is open. The observations hold; the attribution does not follow from them.",
      steelman: "The strongest argument the judgment does not answer.",
      components: [{ label: "The Egyptian branch", state: "contradicted", note: "Two studies find natural limestone." }],
      loadBearing: [],
      weakestLinks: [],
      ...over,
    },
    claimAssessments: claims,
  }) as unknown as Pick<AssessmentRun, "caseAssessment" | "claimAssessments">;

describe("the reader's budget", () => {
  it("passes an article at its ceiling and refuses one a word over, counting without markup", () => {
    const { ceiling } = READER_BUDGET.article;
    expect(articleBudgetErrors(words(ceiling))).toEqual([]);
    expect(articleBudgetErrors(words(ceiling + 1))).toEqual([`the article is 3,001 words without markup; the ceiling is 3,000 (aim for 2,500 or fewer)`]);
    // Claim markers, a plate line and heading marks are not the reader's words.
    const marked = `## A heading\n\n{plate:IMG-X-P01}\n\n[${words(ceiling - 2)}]{claim=X-C001}`;
    expect(articleWords(marked)).toBe(ceiling);
    expect(articleBudgetErrors(marked)).toEqual([]);
  });

  it("passes an assessment within its limits and names each field over one, with the count and the limit", () => {
    expect(assessmentBudgetErrors(within())).toEqual([]);
    const over = within(
      {
        whatIsClaimed: `${words(20)}. Then ${words(100)}.`,
        synthesis: `${words(10)}. Then ${words(390)}`,
        steelman: words(301),
        components: [{ label: "Branch", state: "mixed", note: words(61) }],
      } as never,
      [{ claimId: "X-C001", reasoning: words(181) }],
    );
    expect(assessmentBudgetErrors(over)).toEqual([
      "assessment whatIsClaimed is 121 words; the ceiling is 120 (aim for 60 or fewer)",
      "assessment synthesis is 401 words; the ceiling is 400 (aim for 300 or fewer)",
      "assessment steelman is 301 words; the ceiling is 300 (aim for 200 or fewer)",
      `assessment component "Branch" note is 61 words; the ceiling is 60 (aim for 30 or fewer)`,
      "assessment claim X-C001 reasoning is 181 words; the ceiling is 180 (aim for 100 or fewer)",
    ]);
    // Each field at exactly its ceiling passes.
    const at = within({ whatIsClaimed: `${words(20)}. Then ${words(99)}.`, steelman: words(300) } as never, [{ claimId: "X-C001", reasoning: words(180) }]);
    expect(assessmentBudgetErrors(at)).toEqual([]);
  });

  it("holds the first sentence of a header answer to its own limit, and cannot refuse an opening for being short", () => {
    const { ceiling } = READER_BUDGET.opening;
    expect(openingWords(`${words(ceiling)}. And then the rest follows.`)).toBe(ceiling);
    expect(assessmentBudgetErrors(within({ whereDisagreementLives: `${words(ceiling)}. Then more.` } as never))).toEqual([]);
    expect(assessmentBudgetErrors(within({ whereDisagreementLives: `${words(ceiling + 1)}. Then more.` } as never))).toEqual([
      "assessment whereDisagreementLives's first sentence is 46 words; the ceiling is 45 (aim for 30 or fewer)",
    ]);
    // A passage with no stop is one sentence; an abbreviation's stop only ends the count early.
    expect(openingWords(words(12))).toBe(12);
    expect(openingWords("Bodnia et al. (2019) find no excess. The rest.")).toBeLessThanOrEqual(7);
    expect(openingWords("")).toBe(0);
    expect(proseWords(null)).toBe(0);
    // The steelman and the conventional explanation have a length and no opening rule.
    expect(assessmentBudgetErrors(within({ steelman: words(100), bestConventionalExplanation: words(100) } as never))).toEqual([]);
  });

  it("states itself to the drafter from the same figures it enforces", () => {
    const text = readerBudgetText();
    for (const limit of Object.values(READER_BUDGET)) {
      expect(text).toContain(limit.ceiling.toLocaleString("en-US"));
      expect(text).toContain(limit.target.toLocaleString("en-US"));
    }
    // The edition protocol states these very lines, as literal text: a changed figure fails here until the protocol
    // is given a new version, so a stamp always points at the text that ran.
    const protocol = loadProtocol("edition");
    expect(renderProtocol(protocol, {})).toContain(text);
    expect(Number(protocol.version.match(/-v(\d+)$/)?.[1])).toBeGreaterThanOrEqual(14);
  });

  it("reads the real cases: every edition written under the budget is within it", () => {
    // The floor's claim about the site. An edition from before protocol v13 may be over (the budget did not exist);
    // one written under v13 or later was refused if it was, so none can be.
    for (const c of loadAllCases()) {
      const edition = currentEdition(c);
      const version = Number(edition.promptVersion.match(/^edition-v(\d+)$/)?.[1] ?? 0);
      if (version < 13) continue;
      expect(articleBudgetErrors(edition.article), c.record.slug).toEqual([]);
      const run = adoptedAssessment(c);
      const assessedUnder = Number(run?.promptVersion.match(/^edition-v(\d+)$/)?.[1] ?? 0);
      if (run && assessedUnder >= 13) expect(assessmentBudgetErrors(run), c.record.slug).toEqual([]);
    }
  });
});
