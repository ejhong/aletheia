import Link from "next/link";
import { AssessmentBadge } from "./AssessmentBadge";
import { LinkedRecordText } from "./LinkedRecordText";
import { assessmentLabels, type AssessmentRun, type Claim } from "@/src/domain/schema";
import { seatRelation, type CrossModelSummary, type Ratification } from "@/src/domain/standing";

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
 */
export function StandingPanel({
  run,
  standing,
  checks,
  summary,
  claims,
}: {
  run: AssessmentRun;
  standing: Ratification;
  checks: AssessmentRun[];
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
  const displayed = run.caseAssessment.verdict;
  const splitIds = [...new Set([...standing.contestedLoadBearing, ...(summary?.splitClaimIds ?? [])])];
  const standingLine =
    standing.status === "ratified"
      ? `ratified · ${standing.agreeing} of ${standing.panel} independent seats within one step · ${standing.checksDate}`
      : standing.status === "contested"
        ? `contested · ${standing.reason}`
        : `not yet ratified · ${standing.reason}`;

  return (
    <section className="border border-line bg-paper-deep/50">
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AssessmentBadge state={displayed} size="lg" />
            <h3 className="font-serif text-xl">The judgment</h3>
          </div>
          <p className={`font-mono text-[10px] uppercase tracking-[0.14em] ${standing.status === "ratified" ? "text-copper" : "text-ochre"}`}>{standingLine}</p>
        </div>
        {/* AGENTS.md §4 and §7: an AI assessment is labeled as one, and never implied to be a reviewed human conclusion —
            separately from the ratification, which is independent models concurring, not a human review. */}
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          an AI-generated assessment · not reviewed by a human ·{" "}
          {standing.status === "ratified" ? "ratified by independent models, which is not human review" : "not yet independently ratified"}
        </p>
        <p className="mt-4 text-[15px] leading-[1.75] text-ink-soft whitespace-pre-line">
          <LinkedRecordText text={run.caseAssessment.synthesis} />
        </p>
        {run.caseAssessment.steelman && (
          <div className="mt-5 border-l-2 border-copper/50 pl-4">
            <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">the steelman — the strongest argument this judgment does not answer</h4>
            <p className="mt-1.5 text-[14px] leading-[1.7] text-ink-soft">
              <LinkedRecordText text={run.caseAssessment.steelman} />
            </p>
          </div>
        )}
        <div className="mt-5 grid sm:grid-cols-2 gap-4">
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">load-bearing claims</h4>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{run.caseAssessment.loadBearing.map(chip)}</div>
          </div>
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">weakest links</h4>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{run.caseAssessment.weakestLinks.map(chip)}</div>
          </div>
        </div>
      </div>

      <div className="border-t border-line px-5 sm:px-7 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg">The panel</h3>
          <Link href="/operations#standings" className="font-mono text-[10px] uppercase tracking-[0.14em] text-copper hover:underline underline-offset-4">
            {checks.length} independent seats, blind to this judgment → all standings
          </Link>
        </div>
        {checks.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-ink-soft">No independent seat has judged the case as it stands.</p>
        ) : null}
        <div className="mt-2">
          {checks.map((c) => {
            const relation = seatRelation(c.caseAssessment.verdict, displayed);
            return (
              <details key={c.runId} id={`check-${c.runId}`} className="group border-b border-line/60 last:border-b-0">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2.5 py-2 list-none [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="font-mono text-[10px] text-faint transition-transform group-open:rotate-90">▸</span>
                  <span className="font-mono text-[11px] tracking-[0.06em] text-ink-soft w-[11rem] shrink-0">{shortModel(c.model)}</span>
                  <AssessmentBadge state={c.caseAssessment.verdict} />
                  <span className={`font-mono text-[10px] uppercase tracking-[0.14em] ${relation === "concurs" ? "text-copper" : "text-ochre"}`}>{relation}</span>
                  <span className="text-[13px] text-ink-soft min-w-0 truncate max-w-full">{c.caseAssessment.synthesis.split(/(?<=[.!?])\s+/)[0]}</span>
                </summary>
                <div className="pb-4 pl-6">
                  <p className="text-[14px] leading-[1.7] text-ink-soft whitespace-pre-line">{c.caseAssessment.synthesis}</p>
                  {c.caseAssessment.steelman && (
                    <div className="mt-3 border-l-2 border-copper/50 pl-3">
                      <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">its steelman</h4>
                      <p className="mt-1 text-[13.5px] leading-[1.65] text-ink-soft">{c.caseAssessment.steelman}</p>
                    </div>
                  )}
                  <div className="mt-3 grid sm:grid-cols-2 gap-3">
                    <div>
                      <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">it saw as load-bearing</h4>
                      <div className="mt-1 flex flex-wrap gap-1.5">{c.caseAssessment.loadBearing.map(chip)}</div>
                    </div>
                    <div>
                      <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">it saw as weakest links</h4>
                      <div className="mt-1 flex flex-wrap gap-1.5">{c.caseAssessment.weakestLinks.map(chip)}</div>
                    </div>
                  </div>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">run {c.runId} · {c.date} · {assessmentLabels[c.caseAssessment.verdict]} · an AI seat, blind to the judgment · not human reviewed · per-claim verdicts on each claim page</p>
                </div>
              </details>
            );
          })}
        </div>
        {summary ? (
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
        {standing.staleSince ? (
          <p className="mt-2 font-mono text-[11px] tracking-[0.06em] text-ochre">the case file has changed since this panel judged it ({standing.staleSince}); standing resets until a fresh check</p>
        ) : null}
        {standing.status !== "ratified" ? (
          <p className="mt-2 border border-ochre/40 bg-ochre/8 px-4 py-2.5 font-mono text-[11px] tracking-[0.06em] text-ochre">
            {standing.status === "contested" ? `Contested: ${standing.reason}. The disagreement is shown above, not resolved by hiding it.` : `Not yet ratified: ${standing.reason}.`}
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
