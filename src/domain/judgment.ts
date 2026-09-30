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
 *
 * A component is its label. One whose label is kept is compared with
 * itself, so two components that trade verdicts are two changes. One whose
 * label is not kept cannot be matched to anything — a drafter re-cuts and
 * re-words components freely — so both sides are printed and nothing is
 * claimed about them: the sentence "no component verdict changed" is
 * written only when every component kept its label and its verdict
 * (review note #427).
 */
import { assessmentLabels, type AssessmentRun, type AssessmentState, type Edition } from "./schema.ts";

type Run = Pick<AssessmentRun, "caseAssessment" | "claimAssessments">;
type Sel = Pick<Edition, "featuredClaimIds">;

const delta = (before: string[], after: string[]) => {
  const added = after.filter((x) => !before.includes(x)).map((x) => `+${x}`);
  const removed = before.filter((x) => !after.includes(x)).map((x) => `−${x}`);
  return [...added, ...removed];
};

type Component = { label: string; state: AssessmentState };
const listed = (ks: Component[]) => ks.map((k) => `${assessmentLabels[k.state]}: ${k.label}`).join("; ") || "none";

/** The component verdicts that moved, matched by label; the components on either side that have no match, printed whole. */
function componentChanges(was: Component[], now: Component[]): string[] {
  const labels = (ks: Component[]) => ks.map((k) => k.label);
  const repeated = (ks: Component[]) => new Set(labels(ks)).size !== ks.length;
  // A label given twice on one side names nothing: print both sides unless they are the same list.
  if (repeated(was) || repeated(now)) return listed(was) === listed(now) ? [] : [`component verdicts were [${listed(was)}] and are [${listed(now)}]`];
  const held = new Map(was.map((k) => [k.label, k.state]));
  const out: string[] = [];
  const moved = now.filter((k) => held.has(k.label) && held.get(k.label) !== k.state);
  if (moved.length) out.push(`${moved.length} component verdict(s) moved: ${moved.map((k) => `"${k.label}" ${assessmentLabels[held.get(k.label)!]} → ${assessmentLabels[k.state]}`).join(", ")}`);
  const gone = was.filter((k) => !labels(now).includes(k.label));
  const added = now.filter((k) => !held.has(k.label));
  if (gone.length || added.length) out.push(`components re-cut or re-worded, which the verb cannot match one to one: no longer given [${listed(gone)}], now given [${listed(added)}]`);
  return out;
}

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
    out.push(...componentChanges(a.components ?? [], b.components ?? []));
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
