/** Claims receiving independent grades, in ledger order. The displayed
 * interpretation uses this same scope, so selection cannot mint standing
 * for an ungraded catalog claim. Legacy featured records remain in scope.
 * @param {Array<{ id: string, tier?: string, reviewState?: string }>} claims
 * @param {string[]} selectedIds
 */
export function claimAssessmentIds(claims, selectedIds = []) {
  const selected = new Set(selectedIds);
  return claims.filter(claim => claim.reviewState !== "rejected" &&
    ((claim.tier ?? "featured") === "featured" || selected.has(claim.id)))
    .map(claim => claim.id);
}
