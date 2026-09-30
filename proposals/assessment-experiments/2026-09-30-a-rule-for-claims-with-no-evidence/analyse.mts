/**
 * The design's measures (DESIGN.md), from the seats' raw replies. Written with the design, before any run of the
 * experiment: run on the tree as it stood then, it reports arm S alone, which is the baseline the design quotes.
 *
 *   node proposals/assessment-experiments/2026-09-30-a-rule-for-claims-with-no-evidence/analyse.mts
 *
 * A run's replies are read from the experiment's own runs/ directory, or from proposals/<runId>/ for a published
 * sitting. The repaired reply is read when the verb asked a seat again. The judgment, the featured claims and the
 * evidence each claim has are read from the tree with the site's own functions, so the script must be run on a tree
 * whose ledgers are the ones the runs judged; every run record carries the hash of the case file it sent, and the
 * script says when a run's hash is not the tree's.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { parseYamlReply } from "../../../src/lib/yaml-reply.mjs";
import { sha256Hex } from "../../../src/domain/hash.ts";
import { getCaseBySlug } from "../../../src/domain/load.ts";
import { adoptedAssessment, currentEdition } from "../../../src/domain/editions.ts";
import { claimConcurrence, withinOneStep } from "../../../src/domain/standing.ts";
import type { AssessmentState } from "../../../src/domain/schema.ts";
import { blindPacket, unevidencedClaims } from "../../../src/pipeline/check.ts";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../../..");
/** The four seats of the experiment, by the name the roster and the reply files give them (DESIGN.md, "Seats"). */
const SEATS = ["openai", "gemini", "xai", "venice"] as const;
/** An evidence record's id as the ledgers write it. */
const EVIDENCE_ID = /\b[A-Z]{2,5}-E\d{3}\b/g;
/** Measure 1's third way of naming a basis: the word "prior" or "priors", as the protocol asks a prior to be stated — not "prior to", which is a date. */
const PRIOR = /\bpriors?\b(?!\s+to\b)/i;

interface Arm { label: string; runs: Record<string, string[]> }
const arms = JSON.parse(fs.readFileSync(path.join(here, "arms.json"), "utf8")) as Record<string, Arm>;
const runDir = (run: string) => [path.join(here, "runs", run), path.join(root, "proposals", run)].find((d) => fs.existsSync(d)) ?? null;
const pct = (n: number, d: number) => (d ? `${n} of ${d} (${Math.round((100 * n) / d)}%)` : "0 of 0");

interface Reply { verdict: AssessmentState; claims: Map<string, { verdict: AssessmentState; reasoning: string }> }
function reply(dir: string, seat: string): Reply | null {
  const file = [`seat-${seat}.repaired.yaml`, `seat-${seat}.yaml`].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!file) return null;
  const raw = parseYamlReply(fs.readFileSync(file, "utf8")) as { caseAssessment?: { verdict?: AssessmentState }; claimAssessments?: { claimId: string; verdict: AssessmentState; reasoning?: string }[] } | null;
  if (!raw?.caseAssessment?.verdict || !Array.isArray(raw.claimAssessments)) return null;
  return { verdict: raw.caseAssessment.verdict, claims: new Map(raw.claimAssessments.map((c) => [c.claimId, { verdict: c.verdict, reasoning: String(c.reasoning ?? "") }])) };
}

for (const [name, arm] of Object.entries(arms)) {
  const cases = Object.entries(arm.runs).filter(([, runs]) => runs.length > 0);
  console.log(`\n## Arm ${name} — ${arm.label}`);
  if (cases.length === 0) {
    console.log("\nNo runs yet.");
    continue;
  }
  const seatBasis = new Map<string, { met: number; of: number }>(SEATS.map((s) => [s, { met: 0, of: 0 }]));
  const cites = { all: 0, notAttached: 0, unnamed: 0 };
  const rows: string[] = [];
  for (const [slug, runs] of cases) {
    const c = getCaseBySlug(slug);
    const judgment = adoptedAssessment(c);
    if (!judgment) throw new Error(`${slug} has no adopted assessment`);
    const featured = currentEdition(c).featuredClaimIds;
    const none = new Set(unevidencedClaims(c, featured));
    const own = new Map(judgment.claimAssessments.map((ca) => [ca.claimId, ca.verdict]));
    const attachedTo = new Map(c.evidence.map((e) => [e.id, new Set(e.claimIds)]));
    const sent = sha256Hex(blindPacket(c, root));
    for (const run of runs) {
      const dir = runDir(run);
      if (!dir) {
        rows.push(`| ${slug} | ${run} | not in this tree | | | |`);
        continue;
      }
      const record = parseYaml(fs.readFileSync(path.join(dir, "run.yaml"), "utf8")) as { inputHash?: string | null; promptVersion?: string };
      const sameFile = record.inputHash ? (record.inputHash === sent ? "" : " (its case file is NOT the tree's)") : " (no hash on its record)";
      const replies = SEATS.map((seat) => [seat, reply(dir, seat)] as const).filter((r): r is readonly [(typeof SEATS)[number], Reply] => r[1] !== null);
      let splitNone = 0, splitWith = 0, nNone = 0, nWith = 0;
      for (const id of featured) {
        const base = own.get(id);
        if (!base) continue;
        const verdicts = replies.map(([, r]) => r.claims.get(id)?.verdict).filter((v) => v !== undefined);
        if (verdicts.length === 0) continue;
        const split = claimConcurrence(base, verdicts) === "split";
        if (none.has(id)) { nNone++; if (split) splitNone++; } else { nWith++; if (split) splitWith++; }
      }
      for (const [seat, r] of replies) {
        for (const [id, ca] of r.claims) {
          const named = [...new Set(ca.reasoning.match(EVIDENCE_ID) ?? [])].filter((e) => attachedTo.has(e));
          for (const e of named) {
            cites.all++;
            if (attachedTo.get(e)!.has(id)) continue;
            cites.notAttached++;
            if (![...attachedTo.get(e)!].some((claimId) => ca.reasoning.includes(claimId))) cites.unnamed++;
          }
          if (!none.has(id)) continue;
          // Measure 1: unresolved, or a basis named — a record with a claim it is attached to, or a prior called one.
          const basis = named.some((e) => [...attachedTo.get(e)!].some((claimId) => ca.reasoning.includes(claimId))) || PRIOR.test(ca.reasoning);
          const tally = seatBasis.get(seat)!;
          tally.of++;
          if (ca.verdict === "unresolved" || basis) tally.met++;
        }
      }
      const caseWords = replies.map(([seat, r]) => `${seat} ${r.verdict}${withinOneStep(r.verdict, judgment.caseAssessment.verdict) ? "" : "*"}`).join(", ");
      rows.push(`| ${slug} | ${run.replace(/^\d{4}-\d\d-\d\d-check-/, "")}${sameFile} | ${record.promptVersion ?? "?"} | ${pct(splitNone, nNone)} | ${pct(splitWith, nWith)} | ${caseWords} |`);
    }
  }
  console.log("\n| Case | Run | Stamp | Measure 2: split, of claims with no evidence record | Measure 3: split, of claims with one | Case verdict by seat (* more than one step from the judgment) |");
  console.log("|---|---|---|---|---|---|");
  for (const r of rows) console.log(r);
  const all = [...seatBasis.values()].reduce((a, b) => ({ met: a.met + b.met, of: a.of + b.of }), { met: 0, of: 0 });
  console.log(`\nMeasure 1 — on claims with no evidence record, the verdict is unresolved or the reasoning names its basis: ${pct(all.met, all.of)} of seat verdicts; by seat: ${[...seatBasis].map(([s, t]) => `${s} ${pct(t.met, t.of)}`).join(", ")}.`);
  console.log(`\nMeasure 4 — evidence records named in claim reasonings: ${cites.all}; not attached to the claim being graded: ${cites.notAttached}; of those, naming no claim the record is attached to: ${pct(cites.unnamed, cites.notAttached)}.`);
}

// Measure 5 is read by hand: the Google seat's words on the two claims, in every run of Cast, Not Carved.
const geo = Object.entries(arms).flatMap(([name, arm]) => (arm.runs["megalithic-casting"] ?? []).map((run) => [name, run] as const));
if (geo.length) console.log("\n## Measure 5 — the Google seat on GEO-C502 and GEO-C010, as written\n");
for (const [name, run] of geo) {
  const dir = runDir(run);
  const r = dir ? reply(dir, "gemini") : null;
  for (const id of ["GEO-C502", "GEO-C010"]) console.log(`- arm ${name}, ${run}, ${id}: ${r?.claims.get(id) ? `${r.claims.get(id)!.verdict} — ${r.claims.get(id)!.reasoning.replace(/\s+/g, " ")}` : "no reply in this tree"}`);
}
