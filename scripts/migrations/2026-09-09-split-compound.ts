/**
 * One-off: the Arbiter parked the first essay intake because several admitted
 * claims bundled two or three propositions (§3.2). Every claim admitted from
 * the essay on 2026-09-09 is judged for atomicity by the second reader on its
 * own anchor; a compound one is split by the drafter (protocol split-v1), the
 * parts judged and appended as new claims with the same anchor, and the
 * compound claim's reviewState set to rejected with the reason — append-only,
 * nothing deleted. Evidence that cited a compound claim is re-pointed at its
 * parts. One history entry. Run once, then verify v3 does this at intake.
 *
 *   node scripts/migrations/2026-09-09-split-compound.ts <case> <date>
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { getCaseBySlug } from "../../src/domain/load.ts";
import { appendHistory, appendRecords, setField } from "../../src/pipeline/ledger-write.ts";
import { defaultJudge, defaultSplitter, nextClaimId, suppliedTexts } from "../../src/pipeline/verify.ts";
import { newRunId } from "../../src/pipeline/store.ts";

const [slug, date] = process.argv.slice(2);
const loaded = getCaseBySlug(slug);
const runId = newRunId("verify", slug);
const meter = { runId, verb: "verify" as const, case: slug };
const targets = loaded.claims.filter((c) => c.origin.date === date && c.reviewState !== "rejected" && c.sourceAnchor);
// The supplied text for the essay: the latest intake manifest that names its source.
const intakes = fs.readdirSync("proposals").filter((d) => d.includes(`-inbox-${slug}-`)).sort();
const texts = new Map<string, { text: string }>();
for (const d of intakes) {
  const m = path.join("proposals", d, "manifest.yaml");
  if (!fs.existsSync(m)) continue;
  const mf = parseYaml(fs.readFileSync(m, "utf8")) as { items: { ledgerSource?: string; document?: string }[] };
  for (const it of mf.items) if (it.ledgerSource && it.document) texts.set(it.ledgerSource, { text: fs.readFileSync(path.join("proposals", d, it.document), "utf8") });
}
void suppliedTexts;
const taken = new Set(loaded.claims.map((c) => c.id));
const added: { id: string; from: string; statement: string }[] = [];
const rejected: { id: string; reason: string; parts: string[] }[] = [];
for (const c of targets) {
  const src = c.sourceAnchor!.sourceId;
  const text = texts.get(src)?.text;
  if (!text) { console.error(`${c.id}: no supplied text for ${src}; skipped`); continue; }
  const ctx = `Case question: ${loaded.record.subtitle}. Does the anchored passage support the proposition as stated?`;
  const v = await defaultJudge({ statement: c.statement, anchor: c.sourceAnchor }, text, ctx, meter);
  if (v.atomic !== false) continue;
  const parts = await defaultSplitter(c.statement, text, meter);
  const kept: string[] = [];
  for (const part of parts) {
    const v2 = await defaultJudge({ statement: part, anchor: c.sourceAnchor }, text, ctx, meter);
    const bad = Object.entries(v2).filter(([k, val]) => k !== "reason" && val === false && k !== "independenceNoted" && k !== "directionRight").map(([k]) => k);
    if (bad.length) { console.error(`${c.id} part refused (${bad.join(",")}): ${part.slice(0, 80)}`); continue; }
    const id = nextClaimId(loaded, taken);
    taken.add(id);
    appendRecords(loaded.dir, "claims.yaml", [{ ...c, id, statement: part, origin: { ...c.origin, ref: `${c.origin.ref}; split from ${c.id} (${runId})` } }]);
    kept.push(id);
    added.push({ id, from: c.id, statement: part });
  }
  setField(path.join("content", "cases", loaded.dir, "claims.yaml"), c.id, "reviewState", c.reviewState, "rejected");
  rejected.push({ id: c.id, reason: v.reason, parts: kept });
  console.error(`${c.id}: not atomic — ${kept.length} part(s): ${kept.join(", ")}`);
}
// Evidence that cited a compound claim now cites its parts.
const evFile = path.join("content", "cases", loaded.dir, "evidence.yaml");
const evidence = parseYaml(fs.readFileSync(evFile, "utf8")) as { id: string; claimIds: string[] }[];
const byCompound = new Map(rejected.map((r) => [r.id, r.parts]));
let repointed = 0;
for (const e of evidence) {
  if (!e.claimIds.some((id) => byCompound.has(id))) continue;
  const next = [...new Set(e.claimIds.flatMap((id) => byCompound.get(id) ?? [id]))];
  setField(evFile, e.id, "claimIds", e.claimIds, next);
  repointed++;
}
if (rejected.length) {
  appendHistory(loaded.dir, {
    date,
    change: `Atomicity pass (§3.2) over the ${targets.length} claims admitted from the founding essay on ${date}: ${rejected.length} compound claim(s) split into ${added.length} atomic claim(s) and marked rejected (${rejected.map((r) => `${r.id} → ${r.parts.join("+")}`).join("; ")}); ${repointed} evidence record(s) re-pointed at the parts.`,
    reason: "The Arbiter parked the intake for compound claims; the second reader judged each claim's atomicity on its own anchor and the drafter split the compound ones (protocol split-v1). Verify v3 does this at intake from now on.",
    actor: `scripts/migrations/2026-09-09-split-compound.ts (reader claude-sonnet-5, splitter claude-fable-5-1; run ${runId})`,
    aiAssisted: true,
    kind: "content",
  });
}
console.log(JSON.stringify({ judged: targets.length, split: rejected.length, added: added.length, repointed }));
