/**
 * What an edition changes in the judgment, against the edition it replaces:
 * the case verdict, the research priority, each claim's verdict, the
 * component verdicts, the claims the case is said to rest on, the featured
 * set. Measured from the records, so an edition's account of itself never
 * depends on its drafter having noticed (§3.14: a changed assessment records
 * what changed).
 *
 * 2026-09-30: a re-telling said "the judgment is restated, not changed" and
 * was right about every claim verdict but one, which it named — and had
 * moved the research priority from medium to high and regraded a component
 * without a word, because the packet had never shown it the incumbent's.
 * The packet now does, and this is appended to every rationale.
 */
import { assessmentLabels, type AssessmentRun, type Edition } from "./schema.ts";

type Run = Pick<AssessmentRun, "caseAssessment" | "claimAssessments">;
type Sel = Pick<Edition, "featuredClaimIds">;

const delta = (before: string[], after: string[]) => {
  const added = after.filter((x) => !before.includes(x)).map((x) => `+${x}`);
  const removed = before.filter((x) => !after.includes(x)).map((x) => `−${x}`);
  return [...added, ...removed];
};

/** One line per change; empty when the judgment and the selection are what they were. `after` is null when the edition re-adopts `before`. */
export function judgmentChanges(before: Run | null, after: Run | null, was: Sel, is: Sel): string[] {
  const out: string[] = [];
  if (before && after) {
    const a = before.caseAssessment;
    const b = after.caseAssessment;
    if (a.verdict !== b.verdict) out.push(`case verdict ${assessmentLabels[a.verdict]} → ${assessmentLabels[b.verdict]}`);
    const pa = a.researchPriority?.level ?? "none given";
    const pb = b.researchPriority?.level ?? "none given";
    if (pa !== pb) out.push(`research priority ${pa} → ${pb}`);
    const held = new Map(before.claimAssessments.map((c) => [c.claimId, c.verdict]));
    const moved = after.claimAssessments.filter((c) => held.has(c.claimId) && held.get(c.claimId) !== c.verdict);
    if (moved.length) out.push(`${moved.length} claim verdict(s) moved: ${moved.map((c) => `${c.claimId} ${assessmentLabels[held.get(c.claimId)!]} → ${assessmentLabels[c.verdict]}`).join(", ")}`);
    // A component may be relabelled freely; it is a change when the verdicts given, taken together, are not the ones given before.
    const states = (r: Run) => (r.caseAssessment.components ?? []).map((k) => k.state).sort().join(",");
    if (states(before) !== states(after)) {
      const list = (r: Run) => (r.caseAssessment.components ?? []).map((k) => `${assessmentLabels[k.state]}: ${k.label}`).join("; ") || "none";
      out.push(`component verdicts were [${list(before)}] and are [${list(after)}]`);
    }
    const rests = delta(a.loadBearing, b.loadBearing);
    if (rests.length) out.push(`claims the case rests on: ${rests.join(", ")}`);
  }
  const featured = delta(was.featuredClaimIds, is.featuredClaimIds);
  if (featured.length) out.push(`featured claims: ${featured.join(", ")}`);
  return out;
}

/** The changes as the sentence the verb appends to a rationale. */
export function judgmentChangesSentence(against: string, changes: string[], reAdopted: boolean): string {
  const none = reAdopted ? "the assessment is re-adopted and the featured set is unchanged" : "no case verdict, research priority, claim verdict, component verdict, claim the case rests on or featured claim changed";
  return `Against ${against}: ${changes.length ? changes.join("; ") : none}.`;
}
