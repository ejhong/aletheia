/**
 * Repair of the 2026-09-09 atomicity pass (scripts/migrations/2026-09-09-split-compound.ts),
 * which re-pointed every claim link that named a rejected compound — parent, dependency,
 * alternative, contradiction — at all of the compound's parts. A link to a compound is not a
 * link to each part (AGENTS.md §3.2; the Arbiter's GPT seat on #207): such links are dropped
 * here and named in the history, for a later pass to propose per part. Research links stay:
 * a study designed to move the compound bears on what it said, which is its parts.
 *
 *   node scripts/migrations/2026-09-09-links-by-part.ts <case>
 */
import path from "node:path";
import { getCaseBySlug } from "../../src/domain/load.ts";
import { appendHistory, setField } from "../../src/pipeline/ledger-write.ts";

const slug = process.argv[2] ?? "";
if (!slug) throw new Error("usage: node scripts/migrations/2026-09-09-links-by-part.ts <case>");
const loaded = getCaseBySlug(slug);
const date = new Date().toISOString().slice(0, 10);

const partsOf = new Map<string, string[]>();
for (const c of loaded.claims) {
  if (c.reviewState !== "rejected" || !/^Not atomic/.test(c.rejectionReason ?? "")) continue;
  const m = c.rejectionReason!.match(/(?:Split into|\) into) ((?:[A-Z]+-C\d+)(?:, [A-Z]+-C\d+)*)/);
  if (m) partsOf.set(c.id, m[1].split(", "));
}
const claimsFile = path.join("content", "cases", loaded.dir, "claims.yaml");
const fields = ["parentClaimIds", "dependsOnClaimIds", "alternativeToClaimIds", "contradictsClaimIds"] as const;
const dropped: string[] = [];
for (const c of loaded.claims) {
  if (c.reviewState === "rejected") continue;
  for (const f of fields) {
    const cur = c[f] ?? [];
    let next = [...cur];
    for (const [compoundId, parts] of partsOf) {
      const fanned = parts.filter((p) => cur.includes(p));
      if (fanned.length < 2) continue; // one part named is a single link, not a fan-out
      next = next.filter((id) => !fanned.includes(id));
      dropped.push(`${c.id}.${f} → ${fanned.join(", ")} (parts of ${compoundId})`);
    }
    if (next.length !== cur.length) setField(claimsFile, c.id, f, cur.length ? cur : undefined, next);
  }
}
if (dropped.length) {
  appendHistory(loaded.dir, {
    date,
    change: `Links the atomicity pass had fanned out from a compound claim to all of its parts were dropped (§3.2): ${dropped.join("; ")}.`,
    reason: "A link to a compound claim is not a link to each of its parts; the 2026-09-09 split-compound pass carried them wholesale. Each part's relations are its own to propose in a later pass. Research links stay: a study designed to move the compound bears on what it said, which is its parts.",
    actor: "scripts/migrations/2026-09-09-links-by-part.ts",
    aiAssisted: true,
    kind: "content",
  });
}
console.log(JSON.stringify({ compounds: partsOf.size, dropped: dropped.length }));
