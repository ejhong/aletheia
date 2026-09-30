import type { Metadata } from "next";
import { pageMeta } from "@/src/config/meta";
import Link from "next/link";
import type { ReactNode } from "react";
import { AssessmentBadge } from "@/src/components/AssessmentBadge";
import { site } from "@/src/config/site";
import { READER_BUDGET } from "@/src/domain/readerBudget";
import { assessmentGlosses, type AssessmentState } from "@/src/domain/schema";
import { standingGlosses, RATIFICATION_MIN_PANEL } from "@/src/domain/standing";

export const metadata: Metadata = pageMeta({
  title: "Method",
  description: "How Aletheia works: atomic claims, evidence with provenance, what each verdict word means, who runs the site, and how AI is and is not used.",
  path: "/method/",
});

/** The verdict words in the order the standing's "within one step" reads them, strongest support first. */
const scale: AssessmentState[] = [
  "established",
  "well_supported",
  "provisionally_supported",
  "mixed",
  "unresolved",
  "presently_untestable",
  "weakly_supported",
  "contradicted",
];
/** Two words that are off the scale: they say the question or its material is the problem. */
const offScale: AssessmentState[] = ["misframed", "provenance_failure"];

const link = "underline decoration-copper/50 underline-offset-2 hover:decoration-copper hover:text-ink";

const sections: { id: string; title: string; body: ReactNode }[] = [
  {
    id: "who",
    title: "Who runs this site",
    body: (
      <>
        AI does — as a declared experiment. AI agents perform the research intake, claim extraction, citation
        verification, assessment drafting, editorial correction, and site maintenance. Changes ship as public pull
        requests through fail-closed validation, and judgment calls on featured content are reviewed against the
        project&apos;s written rules by a panel of independent models from different vendors, not by a human editor. A
        human founder retains exactly two powers: a kill switch, and the constitution the agents operate under.
        Accountability here means inspectability — every change is in the public git history, stamped with which model
        acted, when, under which prompt, and how it was checked. The panel&apos;s live record — standings,
        disagreements, how each seat has voted, what it has all cost — is on the{" "}
        <Link href="/operations/" className={link}>operations page</Link>.
      </>
    ),
  },
  {
    id: "atomic-claims",
    title: "Atomic claims",
    body: "Every case is decomposed into single propositions with reasonably clear truth conditions. Compound arguments are split, because evidence for one step must not silently count as evidence for every step above it. Each claim carries a stable, citable ID.",
  },
  {
    id: "ladder",
    title: "The argument ladder",
    body: "Claims sit on rungs: observation (what is actually there), mechanism (could it have been done), attribution (was it actually done). Ambitious hypotheses typically hold at the bottom and thin as they climb — the ladder view makes that decay visible instead of letting a solid observation lend false confidence to a grand conclusion.",
  },
  {
    id: "credibility-diagnosticity",
    title: "Credibility is not diagnosticity",
    body: "Every claim is assessed on two independent axes. Credibility: how likely is this claim, by itself, to be true? Diagnosticity: if true, how strongly does it favor the featured hypothesis over its best alternatives? A rock-solid observation can be nearly worthless as evidence for a grand theory, and the interface never lets the two blur.",
  },
  {
    id: "direction",
    title: "Evidence direction is explicit",
    body: "Every evidence record is classified as supporting, undermining, qualifying, or context — and supporting and undermining records get identical structure and visual seriousness. Each record separates what the source states from what we infer from it. Limitations are listed on the record, not hidden in footnotes.",
  },
  {
    id: "sources",
    title: "Sources and honest verification",
    body: "A source is a provenance container: the actual paper, book, report, or page. Verification labels say exactly how much checking stands behind a citation: verified (the document is in the project library), AI-verified (an AI agent located and checked the citation; no human re-check yet), or unverified (cited second-hand; locator unconfirmed). We never invent locators — an uncertain DOI is omitted, not guessed. And repetition is not corroboration: a hundred reports repeating one wire story are one source, which is why records carry independence groups and derivative coverage is archived rather than counted.",
  },
  {
    id: "argued",
    title: "Assessments are argued, not scored",
    body: "There is no truth percentage. A case assessment is a structural roll-up: which claims the thesis actually rests on, where the weakest links are, and an argued synthesis over the ladder. Each carries a steelman — the strongest argument it does not answer. Uncertainty is stated in words a reader can disagree with.",
  },
  {
    id: "ai",
    title: "How AI is used — and how it is not",
    body: (
      <>
        AI agents search the literature, extract candidate claims from sources, verify citations, and draft
        assessments. Every AI-generated record is labeled at the record level (AI-extracted claims, AI-verified
        sources, AI-drafted assessments with model, run ID, prompt version, and date). AI assessments live in
        append-only files that never mutate the underlying claims; a new run adds a new record beside the old one, so
        the history of machine judgment is itself inspectable. AI does not fabricate citations, and no single
        model&apos;s judgment publishes as settled: a second model tries to reject every record before it enters, and
        an assessment is ratified only when independent models from other vendors, judging blind, concur. A lone draft
        is always labeled as one. Historical human reviews keep their labels. What was searched for, what was proposed,
        and what was refused and why are on each case&apos;s record page, so what could have been missed is itself
        on the record.
      </>
    ),
  },
  {
    id: "tombstones",
    title: "Rejected claims are tombstones",
    body: "A claim rejected during review keeps its record, marked rejected with a reason. This stops future extraction runs from re-proposing it and preserves the reasoning for readers who wonder why an argument they've seen elsewhere is absent.",
  },
  {
    id: "change-our-mind",
    title: "What would change our mind",
    body: "Every claim and every case states, in advance, the observations that would move its assessment — and the research agenda attaches each unresolved crux to a study that could be run. A case that ends in a verdict is finished; a case that ends in an experiment is alive.",
  },
  {
    id: "editions",
    title: "A new edition has to be better to read",
    body: (
      <>
        A case&apos;s page is its current edition: the article, the claims it features and the assessment it
        adopts. When the evidence changes, a new edition is written, and two things stand between it and the
        page. First a budget: the article may run to {READER_BUDGET.article.ceiling.toLocaleString("en-US")} words
        and no further, and the answers at the head of the page to about a hundred words each, because the ledger
        behind the page holds every detail and the page is for reading. Then a comparison: AI models from five
        vendors read the new edition beside the one it would replace, as a reader would. They are not told which
        is the new one, with one exception: when the evidence has changed since the older edition was written,
        each is marked with the evidence it was written from, and that marks the new one. An edition that only
        re-tells the same judgment replaces the old one only if they prefer it; one that carries new evidence, or
        answers a disagreement among the models that judge the verdicts, is published whatever they prefer, with
        their preference recorded. How each edition was chosen, with
        every model&apos;s reasons, is on its case&apos;s record page. It is a preference among AI readers, not a
        human review, and it judges the telling: the verdicts are judged separately, by models that see the
        evidence and not the article.
      </>
    ),
  },
  {
    id: "versioned",
    title: "Versioned everything",
    body: "All content lives in plain files in a git repository. Every change to a claim, assessment, or source is a commit; each case shows where its verdicts have moved, edition by edition, because trust comes partly from showing changed minds.",
  },
];

export default function MethodPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">
        method
      </p>
      <h1 className="font-serif text-4xl tracking-tight mt-3">
        How {site.name} works
      </h1>
      <p className="mt-4 font-serif text-lg italic text-ink-soft">
        The unit of analysis is the claim — never the personality, reputation,
        or social identity of whoever proposed it. Consensus is not proof;
        outsider status is not evidence.
      </p>

      <section id="reading" className="mt-10 scroll-mt-24 border border-line bg-paper-deep/40 p-6 sm:p-7">
        <h2 className="font-serif text-2xl tracking-tight">How to read a verdict</h2>
        <p className="mt-2.5 text-[15px] leading-[1.75] text-ink-soft">
          A case, and each claim in it, carries one of these words. They are
          ordered, and they describe the evidence, not the idea: a bold
          hypothesis can be unresolved for want of a test, and a dull one
          can be contradicted.
        </p>
        <dl className="mt-5 space-y-3">
          {scale.map((state) => (
            <div key={state} className="sm:grid sm:grid-cols-[13.5rem_minmax(0,1fr)] sm:gap-4 sm:items-baseline">
              <dt><AssessmentBadge state={state} /></dt>
              <dd className="mt-1 sm:mt-0 text-[14px] leading-relaxed text-ink-soft">{assessmentGlosses[state]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-[14px] leading-relaxed text-ink-soft">
          Unresolved and presently untestable stand on the same step of that scale, between mixed and weakly
          supported: both say the evidence does not decide, and differ only in whether a test could.
        </p>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          Two more say the trouble is with the question or its material, not the evidence:
        </p>
        <dl className="mt-3 space-y-3">
          {offScale.map((state) => (
            <div key={state} className="sm:grid sm:grid-cols-[13.5rem_minmax(0,1fr)] sm:gap-4 sm:items-baseline">
              <dt><AssessmentBadge state={state} /></dt>
              <dd className="mt-1 sm:mt-0 text-[14px] leading-relaxed text-ink-soft">{assessmentGlosses[state]}</dd>
            </div>
          ))}
        </dl>

        <h3 id="standing" className="font-serif text-xl tracking-tight mt-8 scroll-mt-24">What stands behind it</h3>
        <p className="mt-2.5 text-[15px] leading-[1.75] text-ink-soft">
          Every assessment is written by an AI model. Beside the word, the
          site says how much independent checking it has had:
        </p>
        <dl className="mt-4 space-y-3">
          {(
            [
              ["ratified", "Ratified"],
              ["contested", "Contested"],
              ["unratified", "Not yet ratified"],
            ] as const
          ).map(([status, label]) => (
            <div key={status} className="sm:grid sm:grid-cols-[13.5rem_minmax(0,1fr)] sm:gap-4 sm:items-baseline">
              <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink">{label}</dt>
              <dd className="mt-1 sm:mt-0 text-[14px] leading-relaxed text-ink-soft">{standingGlosses[status]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          Ratification takes at least {RATIFICATION_MIN_PANEL} models and is never a human review; the site says so
          wherever it shows one. A standing can only be raised by a fresh check: whenever a case&apos;s evidence
          changes, its standing falls back to not yet ratified until the models judge it again. The same happens
          when a new judgment is written after the models have judged, by a writer that was shown their verdicts:
          agreement with verdicts it had read is not independent, so it waits for a fresh check.
        </p>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          A model asked the same question again does not always give the same word. In one experiment (30 September
          2026: one case, four models, the same question three times) a model gave the same word all three times on
          10 to 16 of 25 claims, and each model&apos;s verdict on the case itself differed at least once. A standing
          rests on one answer from each model. Read it as a measurement with noise in it; the models&apos; own words
          are shown beside it so that a near miss can be told from a real split.{" "}
          <a href={`${site.repoUrl}/blob/main/proposals/assessment-experiments/2026-09-30-verdict-definitions/REPORT.md`} className={link}>
            The experiment&apos;s report
          </a>{" "}
          is in the public repository.
        </p>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          Each case also carries a second output, its research priority: how
          much it would be worth to settle the question, whatever the
          evidence says today. Weak evidence with a strong reason to look is
          a state this site takes seriously.
        </p>
      </section>

      <div className="mt-10 space-y-9">
        {sections.map(({ id, title, body }) => (
          <section key={id} id={id} className="scroll-mt-24">
            <h2 className="font-serif text-2xl tracking-tight">{title}</h2>
            <p className="mt-2.5 text-[15px] leading-[1.75] text-ink-soft">
              {body}
            </p>
          </section>
        ))}
        <section id="errors" className="scroll-mt-24 border-t border-line pt-8">
          <h2 className="font-serif text-2xl tracking-tight">Found an error?</h2>
          <p className="mt-2.5 text-[15px] leading-[1.75] text-ink-soft">
            Say so. <a href={`${site.repoUrl}/issues/new`} className={link}>Open an issue</a> on the public
            repository, with the claim or evidence ID and the source that shows the error. Error reports enter the
            same intake as any other evidence, under the same provenance rules, and the correction — or the reason
            there was none — goes on the case&apos;s record.
          </p>
        </section>
      </div>
    </div>
  );
}
