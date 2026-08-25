import type { Metadata } from "next";
import { site } from "@/src/config/site";

export const metadata: Metadata = { title: "Method" };

const sections: [string, string][] = [
  [
    "Who runs this site",
    "AI does — as a declared experiment. AI agents perform the research intake, claim extraction, citation verification, assessment drafting, editorial correction, and site maintenance. Changes ship as public pull requests through fail-closed validation, and judgment calls on featured content are reviewed against the project's written rules by a panel of independent models from different vendors, not by a human editor. A human founder retains exactly two powers: a kill switch, and the constitution the agents operate under. Accountability here means inspectability — every change is in the public git history, stamped with which model acted, when, under which prompt, and how it was checked. If you find an error, open an issue on the GitHub repository; error reports enter the same intake pipeline as any other evidence, with the same provenance rules.",
  ],
  [
    "Atomic claims",
    "Every case is decomposed into single propositions with reasonably clear truth conditions. Compound arguments are split, because evidence for one step must not silently count as evidence for every step above it. Each claim carries a stable, citable ID.",
  ],
  [
    "The argument ladder",
    "Claims sit on rungs: observation (what is actually there), mechanism (could it have been done), attribution (was it actually done). Ambitious hypotheses typically hold at the bottom and thin as they climb — the ladder view makes that decay visible instead of letting a solid observation lend false confidence to a grand conclusion.",
  ],
  [
    "Credibility is not diagnosticity",
    "Every claim is assessed on two independent axes. Credibility: how likely is this claim, by itself, to be true? Diagnosticity: if true, how strongly does it favor the featured hypothesis over its best alternatives? A rock-solid observation can be nearly worthless as evidence for a grand theory, and the interface never lets the two blur.",
  ],
  [
    "Evidence direction is explicit",
    "Every evidence record is classified as supporting, undermining, qualifying, or context — and supporting and undermining records get identical structure and visual seriousness. Each record separates what the source states from what we infer from it. Limitations are listed on the record, not hidden in footnotes.",
  ],
  [
    "Sources and honest verification",
    "A source is a provenance container: the actual paper, book, report, or page. Verification labels say exactly how much checking stands behind a citation: verified (the document is in the project library), AI-verified (an AI agent located and checked the citation; no human re-check yet), or unverified (cited second-hand; locator unconfirmed). We never invent locators — an uncertain DOI is omitted, not guessed.",
  ],
  [
    "Assessments are argued, not scored",
    "There is no truth percentage. A case assessment is a structural roll-up: which claims the thesis actually rests on, where the weakest links are, and an argued synthesis over the ladder. Uncertainty is stated in words a reader can disagree with.",
  ],
  [
    "How AI is used — and how it is not",
    "AI agents extract candidate claims from sources, verify citations, and draft assessments. Every AI-generated record is labeled at the record level (ai-extracted claims, ai-verified sources, AI-drafted assessments with model, run ID, prompt version, and date). AI assessments live in append-only overlay files that never mutate the underlying claims; a new run adds a new record beside the old one, so the history of machine judgment is itself inspectable. AI does not fabricate citations, and no single model's judgment publishes as settled: consequential changes need multi-model ratification, and a lone draft is always labeled as one. Historical human reviews keep their labels — endorsement records are append-only like everything else.",
  ],
  [
    "Rejected claims are tombstones",
    "A claim rejected during review keeps its record, marked rejected with a reason. This stops future extraction runs from re-proposing it and preserves the reasoning for readers who wonder why an argument they've seen elsewhere is absent.",
  ],
  [
    "What would change our mind",
    "Every claim and every case states, in advance, the observations that would move its assessment — and the research agenda attaches each unresolved crux to a fundable study. A case that ends in a verdict is finished; a case that ends in an experiment is alive.",
  ],
  [
    "Versioned everything",
    "All content lives in plain files in a git repository. Every change to a claim, assessment, or source is a commit; the change history on each case is part of the publication, because trust comes partly from showing changed minds.",
  ],
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
      <div className="mt-10 space-y-9">
        {sections.map(([title, text]) => (
          <section key={title}>
            <h2 className="font-serif text-2xl tracking-tight">{title}</h2>
            <p className="mt-2.5 text-[15px] leading-[1.75] text-ink-soft">
              {text}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
