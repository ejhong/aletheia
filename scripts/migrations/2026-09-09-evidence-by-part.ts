/**
 * Repair of the 2026-09-09 atomicity pass (scripts/migrations/2026-09-09-split-compound.ts),
 * which re-pointed every evidence record from a rejected compound claim to all of its parts
 * without judging whether the record bears on each part — evidence for one proposition
 * counting silently for the others (AGENTS.md §3.2; the Arbiter's GPT seat on #207).
 * Here the second reader judges each such record against each part on the compound's own
 * source text, and the record keeps only the parts it bears on. The split-compound script
 * itself now judges part by part; this pass settles the records it wrote before it did.
 *
 *   node scripts/migrations/2026-09-09-evidence-by-part.ts <case>
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { getCaseBySlug } from "../../src/domain/load.ts";
import type { Evidence } from "../../src/domain/schema.ts";
import { appendHistory, setField } from "../../src/pipeline/ledger-write.ts";
import { newRunId } from "../../src/pipeline/store.ts";
import { defaultJudge, READER } from "../../src/pipeline/verify.ts";

const slug = process.argv[2] ?? "";
if (!slug) throw new Error("usage: node scripts/migrations/2026-09-09-evidence-by-part.ts <case>");
const loaded = getCaseBySlug(slug);
const runId = newRunId("verify", slug);
const date = runId.slice(0, 10);
const meter = { runId, verb: "verify" as const, case: slug };

// The supplied text of each ledger source an intake carried (the essay's own text).
const texts = new Map<string, string>();
for (const d of fs.readdirSync("proposals").filter((x) => x.includes(`-inbox-${slug}-`)).sort()) {
  const m = path.join("proposals", d, "manifest.yaml");
  if (!fs.existsSync(m)) continue;
  const mf = parseYaml(fs.readFileSync(m, "utf8")) as { items: { ledgerSource?: string; document?: string }[] };
  for (const it of mf.items) if (it.ledgerSource && it.document) texts.set(it.ledgerSource, fs.readFileSync(path.join("proposals", d, it.document), "utf8"));
}

// Compounds the atomicity pass rejected, and the parts it split them into (named in the reason).
const partsOf = new Map<string, string[]>();
for (const c of loaded.claims) {
  if (c.reviewState !== "rejected" || !/^Not atomic/.test(c.rejectionReason ?? "")) continue;
  const m = c.rejectionReason!.match(/(?:Split into|\) into) ((?:[A-Z]+-C\d+)(?:, [A-Z]+-C\d+)*)/);
  if (m) partsOf.set(c.id, m[1].split(", "));
}
const claimById = new Map(loaded.claims.map((c) => [c.id, c]));

const evFile = path.join("content", "cases", loaded.dir, "evidence.yaml");
const evidence = parseYaml(fs.readFileSync(evFile, "utf8")) as Evidence[];
const changes: string[] = [];
let judged = 0;
for (const e of evidence) {
  const cited = new Set(e.claimIds);
  const kept = [...e.claimIds];
  for (const [compoundId, parts] of partsOf) {
    const citedParts = parts.filter((p) => cited.has(p));
    if (citedParts.length < 2) continue; // one part cited is a judgment already made, or a record that never cited the compound
    const compound = claimById.get(compoundId);
    const text = compound?.sourceAnchor?.sourceId ? texts.get(compound.sourceAnchor.sourceId) : undefined;
    if (!text) continue;
    for (const pid of citedParts) {
      const part = claimById.get(pid);
      if (!part) continue;
      judged++;
      const v = await defaultJudge({ ...e, claimIds: [pid], editorInference: undefined }, text, `Case question: ${loaded.record.subtitle}. The compound claim ${compoundId} this record cited was split; judge whether the record bears on this one part — ${pid}: ${part.statement}`, meter);
      if (v.relevant === false) {
        kept.splice(kept.indexOf(pid), 1);
        changes.push(`${e.id} no longer cites ${pid} (part of ${compoundId}): ${v.reason}`);
      }
    }
  }
  if (kept.length !== e.claimIds.length) {
    if (kept.length === 0) throw new Error(`${e.id} would cite nothing — stop and look`);
    setField(evFile, e.id, "claimIds", e.claimIds, kept);
  }
}
if (changes.length) {
  appendHistory(loaded.dir, {
    date,
    change: `Evidence that the atomicity pass had re-pointed to every part of a compound claim was judged against each part (§3.2): ${changes.length} link(s) dropped — ${changes.map((c) => c.split(":")[0]).join("; ")}.`,
    reason: `The 2026-09-09 split-compound pass re-pointed evidence wholesale, so evidence for one proposition counted silently for the others; the second reader (${READER.model}) judged each record against each part on the essay's own text. ${changes.join(" | ")}`,
    actor: `scripts/migrations/2026-09-09-evidence-by-part.ts (reader ${READER.model}; run ${runId})`,
    aiAssisted: true,
    kind: "content",
  });
}
console.log(JSON.stringify({ compounds: partsOf.size, judged, dropped: changes.length, runId }));
