import type { Claim, Pin } from "./schema";

/**
 * The regression exam (docs/AUTOMATION.md): fail-closed enforcement of a
 * case's pinned commitments. Pure function so the exam is unit-testable;
 * the loader runs it on every build, which is what makes a pin binding —
 * a rewrite that loses a banked correction or a founder directive fails
 * the build before any judge votes.
 *
 * Design constraints, deliberate:
 * - Pins bind presentation files, never verdicts: there is no check type
 *   that asserts a credibility, a standing, or an assessment outcome.
 * - Checks are exact-substring or claim-tier assertions — things a human
 *   can verify by looking, with no model in the loop.
 * - String checks are whitespace-insensitive (all runs of whitespace
 *   compare as one space): YAML folding and prose reflow must not break
 *   a commitment that is intact word-for-word. Words are still exact —
 *   no fuzzy matching.
 */
const normalize = (s: string) => s.replace(/\s+/g, " ");
export function pinIntegrityErrors(input: {
  pins: Pin[];
  claims: Claim[];
  /** Raw text of the checkable case files, keyed by filename. */
  files: Record<string, string>;
}): string[] {
  const errors: string[] = [];
  const claimsById = new Map(input.claims.map((c) => [c.id, c]));

  for (const pin of input.pins) {
    for (const check of pin.checks) {
      if (check.type === "claim_featured") {
        const claim = claimsById.get(check.claimId);
        if (!claim) {
          errors.push(
            `${pin.id}: pinned claim ${check.claimId} does not exist`,
          );
        } else if (claim.reviewState === "rejected") {
          errors.push(
            `${pin.id}: pinned claim ${check.claimId} is rejected — a ` +
              `pinned claim may be superseded only by amending the pin`,
          );
        } else if (claim.tier !== "featured") {
          errors.push(
            `${pin.id}: pinned claim ${check.claimId} lost featured tier`,
          );
        }
        continue;
      }
      const text = input.files[check.file];
      if (text === undefined) {
        errors.push(
          `${pin.id}: pinned file ${check.file} is missing from the case`,
        );
        continue;
      }
      const present = normalize(text).includes(normalize(check.value));
      if (check.type === "string_present" && !present) {
        errors.push(
          `${pin.id}: ${check.file} no longer contains the pinned text ` +
            `"${check.value.slice(0, 60)}…" — the commitment this enforces: ` +
            pin.statement.slice(0, 120),
        );
      }
      if (check.type === "string_absent" && present) {
        errors.push(
          `${pin.id}: ${check.file} contains the pinned-absent text ` +
            `"${check.value.slice(0, 60)}…" — the commitment this enforces: ` +
            pin.statement.slice(0, 120),
        );
      }
    }
  }
  return errors;
}
