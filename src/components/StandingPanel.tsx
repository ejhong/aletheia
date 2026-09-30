import Link from "next/link";
import { AssessmentBadge } from "./AssessmentBadge";
import { Lede } from "./Lede";
import { assessmentLabels, type AssessmentRun, type Claim } from "@/src/domain/schema";
import { RATIFICATION_MIN_PANEL, seatRelation, standingGlosses, standingInWords, type CrossModelSummary, type Ratification } from "@/src/domain/standing";
import { clip, longDate } from "@/src/domain/text";

/** "GPT-5.1 (OpenAI), independent judge run" → "GPT-5.1 (OpenAI)". */
function shortModel(label: string): string {
  return label.replace(/\s*(,\s*independent.*|—\s*independent.*)$/i, "");
}

/**
 * The judgment and the panel, in one block, computed by one rule: the
 * adopted assessment (verdict, synthesis, steelman, what it leans on and
 * where it is weakest) and, beneath it, each independent seat's own
 * verdict and its relation to the judgment — concurs within one step, or
 * disputes — with the split claims and the standing that follows. What
 * the AI thinks and what the panel thinks, first (founder direction,
 * 2026-09-09, in session).
 *
 * The judgment opens with its first sentences and keeps its full reasoning
 * behind a disclosure, with what it leans on and where it is weakest; the
 * record ids in the prose are links, set quietly. A seat that judged an
 * earlier state of the case is shown as that — its word is on the record
 * and does not count toward the standing until it judges the case again.
 */
export function StandingPanel({
  run,
  standing,
  checks,
  current,
  summary,
  claims,
}: {
  run: AssessmentRun;
  standing: Ratification;
  checks: AssessmentRun[];
  /** Run ids of the checks that judged the case as it stands (standing.ts, currentChecks). */
  current: string[];
  summary: CrossModelSummary | null;
  claims: Claim[];
}) {
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const chip = (id: string) => (
    <Link
      key={id}
      href={`/claims/${id}/`}
      title={claimById.get(id)?.statement}
      className="inline-flex items-center gap-1 border border-line bg-paper px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-ink-soft hover:border-copper/60 hover:text-copper"
    >
      {id}
    </Link>
  );
  /** A claim named by what it says, with its id as the way in. */
  const named = (id: string) => (
    <li key={id} className="text-[13px] leading-snug text-ink-soft">
      <Link href={`/claims/${id}/`} className="hover:text-copper">
        <span className="font-mono text-[10px] tracking-[0.1em] text-faint mr-2">{id}</span>
        {clip(claimById.get(id)?.statement ?? "", 120)}
      </Link>
    </li>
  );
  const displayed = run.caseAssessment.verdict;
  const isCurrent = new Set(current);
  const stale = checks.filter((c) => !isCurrent.has(c.runId));
  const splitIds = [...new Set([...standing.contestedLoadBearing, ...(summary?.splitClaimIds ?? [])])];
  const prose = "text-[15px] leading-[1.75] text-ink-soft";

  return (
    <section className="border border-line bg-paper-deep/50">
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AssessmentBadge state={displayed} size="lg" />
            <h2 className="font-serif text-2xl tracking-tight">The judgment</h2>
          </div>
          <p
            title={standingGlosses[standing.status]}
            className={`font-mono text-[10px] uppercase tracking-[0.14em] ${standing.status === "ratified" ? "text-copper" : "text-ochre"}`}
          >
            {standingInWords(standing)}
            {standing.status === "ratified" && standing.checksDate ? ` · ${longDate(standing.checksDate)}` : ""}
          </p>
        </div>
        {/* AGENTS.md §4 and §7: an AI assessment is labeled as one, and never implied to be a reviewed human conclusion —
            separately from the ratification, which is independent models concurring, not a human review. */}
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          an AI-generated assessment · not reviewed by a human
          {standing.status === "ratified" ? " · ratified by independent models, which is not human review" : ""}
        </p>
        <div className="mt-4 max-w-4xl">
          <Lede text={run.caseAssessment.synthesis} max={460} more="the full reasoning" quiet className={prose}>
            <div className="mt-5 grid sm:grid-cols-2 gap-x-8 gap-y-5">
              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">the claims the case rests on</h3>
                <ul className="mt-2 space-y-1.5">{run.caseAssessment.loadBearing.map(named)}</ul>
              </div>
              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">its weakest links</h3>
                <ul className="mt-2 space-y-1.5">{run.caseAssessment.weakestLinks.map(named)}</ul>
              </div>
            </div>
          </Lede>
        </div>
        {run.caseAssessment.steelman && (
          <div className="mt-6 max-w-4xl border-l-2 border-copper/50 pl-4">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">the steelman — the strongest argument this judgment does not answer</h3>
            <div className="mt-1.5">
              <Lede text={run.caseAssessment.steelman} max={340} quiet className="text-[14px] leading-[1.7] text-ink-soft" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-line px-5 sm:px-7 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl tracking-tight">The panel</h2>
          <Link href="/operations#standings" className="font-mono text-[10px] uppercase tracking-[0.14em] text-copper hover:underline underline-offset-4">
            all standings →
          </Link>
        </div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft max-w-3xl">
          {checks.length === 0
            ? "No independent model has judged this case yet."
            : `${checks.length} AI models from different vendors each judged the evidence without seeing this judgment or one another. A model concurs when its verdict is within one step of the one above.`}
        </p>
        <div className="mt-3">
          {checks.map((c) => {
            const counted = isCurrent.has(c.runId);
            const relation = seatRelation(c.caseAssessment.verdict, displayed);
            return (
              <details key={c.runId} id={`check-${c.runId}`} className="group border-b border-line/60 last:border-b-0">
                <summary className="cursor-pointer py-2.5 list-none [&::-webkit-details-marker]:hidden">
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span aria-hidden className="font-mono text-[10px] text-faint transition-transform group-open:rotate-90">▸</span>
                    <span className="font-mono text-[11px] tracking-[0.06em] text-ink-soft">{shortModel(c.model)}</span>
                    <AssessmentBadge state={c.caseAssessment.verdict} />
                    {counted ? (
                      <span className={`font-mono text-[10px] uppercase tracking-[0.14em] ${relation === "concurs" ? "text-copper" : "text-ochre"}`}>{relation}</span>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">judged an earlier version</span>
                    )}
                  </span>
                  <span className="mt-1 block truncate pl-[1.15rem] text-[13px] text-ink-soft group-open:hidden">{c.caseAssessment.synthesis.split(/(?<=[.!?])\s+/)[0]}</span>
                </summary>
                <div className="pb-4 pl-6 max-w-4xl">
                  <p className="text-[14px] leading-[1.7] text-ink-soft whitespace-pre-line">{c.caseAssessment.synthesis}</p>
                  {c.caseAssessment.steelman && (
                    <div className="mt-3 border-l-2 border-copper/50 pl-3">
                      <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">its steelman</h3>
                      <p className="mt-1 text-[13.5px] leading-[1.65] text-ink-soft">{c.caseAssessment.steelman}</p>
                    </div>
                  )}
                  <div className="mt-3 grid sm:grid-cols-2 gap-3">
                    <div>
                      <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">it saw as load-bearing</h3>
                      <div className="mt-1 flex flex-wrap gap-1.5">{c.caseAssessment.loadBearing.map(chip)}</div>
                    </div>
                    <div>
                      <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">it saw as weakest links</h3>
                      <div className="mt-1 flex flex-wrap gap-1.5">{c.caseAssessment.weakestLinks.map(chip)}</div>
                    </div>
                  </div>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">run {c.runId} · {c.date} · {assessmentLabels[c.caseAssessment.verdict]} · an AI seat, blind to the judgment · not human reviewed · per-claim verdicts on each claim page</p>
                </div>
              </details>
            );
          })}
        </div>
        {summary && stale.length === 0 ? (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
            Claim by claim, against this judgment: {summary.exact} of {summary.claimsCompared} exact, {summary.adjacent} within one step, {summary.split} split.
            {splitIds.length > 0 ? (
              <>
                {" "}Split — where review should start:{" "}
                {splitIds.map((id, i) => (
                  <span key={id}>
                    {i > 0 ? " · " : ""}
                    <Link href={`/claims/${id}/`} className="font-mono text-[11px] underline underline-offset-2 hover:text-copper">{id}</Link>
                  </span>
                ))}
                .
              </>
            ) : null}
          </p>
        ) : null}
        {standing.status === "contested" ? (
          <p className="mt-3 border border-ochre/40 bg-ochre/8 px-4 py-2.5 text-[13px] leading-relaxed text-ink-soft">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ochre mr-2">contested</span>
            {standing.reason}. The disagreement is shown here, not resolved by hiding it.
          </p>
        ) : standing.status === "unratified" ? (
          <p className="mt-3 border border-ochre/40 bg-ochre/8 px-4 py-2.5 text-[13px] leading-relaxed text-ink-soft">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ochre mr-2">not yet ratified</span>
            {stale.length > 0
              ? `${standing.staleSince === "the ledger changed" || !standing.staleSince ? "The case's evidence changed" : `The case file changed (${standing.staleSince})`} after ${stale.length === checks.length ? "these models" : `${stale.length} of these models`} judged it. Their verdicts stay on the record and do not count toward the standing until they judge the case as it now stands${standing.panel > 0 ? `; ${standing.panel} of the ${RATIFICATION_MIN_PANEL} a standing needs have` : ""}.`
              : `${standing.reason.charAt(0).toUpperCase()}${standing.reason.slice(1)}.`}
          </p>
        ) : null}
      </div>

      <div className="border-t border-line px-5 sm:px-7 py-2.5 flex flex-wrap gap-x-5 gap-y-1">
        {[
          ["run", run.runId],
          ["model", run.model],
          ["prompt", run.promptVersion],
          ["date", run.date],
          ...(run.migratedFrom ? [["transferred from", run.migratedFrom]] : []),
        ].map(([k, v]) => (
          <span key={k} className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
            {k}: <span className="text-ink-soft normal-case">{v}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
