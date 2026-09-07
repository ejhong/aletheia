#!/usr/bin/env node
/**
 * Literature-watch triage — decide what surfaced literature deserves.
 *
 * Usage:
 *   node scripts/triage-watch.mjs [--run <watch-runId>] [--dry-run]
 *                                 [--provider anthropic|openai]
 *
 * Runs after scripts/watch-literature.mjs over one watch run (the newest
 * untriaged one by default). One model call per case judges every surfaced
 * item against versioned criteria (see TRIAGE_SYSTEM below) into exactly
 * three outcomes:
 *
 *   import  — likely NEW evidential weight for the case; queued for
 *             verification by writing an inbox link-list drop
 *             (inbox/triage-…md), which the next inbox run fetch-verifies
 *             into source-record PROPOSALS. Nothing touches sources.yaml
 *             here, and the source admission rule in src/domain/load.ts
 *             means even a verified source cannot enter the ledger without
 *             an evidence record citing it.
 *   shelf   — useful reading, no new evidential weight; a candidate for the
 *             case's curated resources.yaml, left in the report for an
 *             agent to pick up.
 *   archive — everything else. The default. Archiving means: recorded in
 *             triage.yaml with a reason, nothing more; the run directory
 *             itself expires after WATCH runs age out (git history keeps
 *             the record).
 *
 * Fail-closed: a malformed model reply triages NOTHING for that case (see
 * scripts/lib/triage.mjs), and an item the watch flagged as a possible
 * duplicate can never be imported by triage — the duplicate guard
 * downgrades it in code, not in the prompt.
 *
 * Output: triage.yaml + triage.md inside the watch run's directory
 * (proposals/**, so triage stays in the low-risk allowlist), plus one
 * inbox/triage-<runId>-<case>.md link drop per case with imports.
 *
 * Archive asymmetry guard: import mistakes are caught downstream (the
 * case's standing fails down and the panel re-judges the result), but an
 * archived item is judged once, by one model, and then the run directory
 * expires. So every archived item is also appended, one line each, to the
 * cumulative ledger proposals/watch/archive-ledger.yaml — which survives
 * expiry — so a periodic audit (a second model, or a human) can review
 * the omissions without digging through deleted directories.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { callWithRefusalFallback, parseJsonReply, pickProvider } from "./lib/llm.mjs";
import { applyDuplicateGuard, validateTriageReply } from "./lib/triage.mjs";

const PROMPT_VERSION = "watch-triage-v1";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const forcedRun = args.includes("--run") ? args[args.indexOf("--run") + 1] : null;
const forcedProvider = args.includes("--provider")
  ? args[args.indexOf("--provider") + 1]
  : undefined;

const ROOT = process.cwd();
const WATCH_DIR = path.join(ROOT, "proposals", "watch");
const CASES_DIR = path.join(ROOT, "content", "cases");
const INBOX_DIR = path.join(ROOT, "inbox");
const LEDGER_FILE = path.join(WATCH_DIR, "archive-ledger.yaml");

const today = new Date().toISOString().slice(0, 10);

const TRIAGE_SYSTEM = `You are the literature-triage judge for Aletheia, an evidence-mapping publication for contested scientific cases. A weekly watch surfaces newly published papers matching a case's search queries; most of them do not belong on the site. Your job is to keep the evidence ledger relevant and small.

Decide exactly one outcome per item:

- "import": the item likely carries NEW evidential weight for THIS case — new primary data or measurements, a direct rebuttal or replication of work the case tracks, a retraction, or a methodological critique bearing on a specific existing claim. Importing triggers citation verification and evidence extraction, so choose it only when you can name which claim(s) the item would bear on, and say so in the reason.
- "shelf": genuinely useful reading for someone studying the case (a substantial review, a canonical statement of a position), but no new evidential weight.
- "archive": everything else — tangential topics, keyword coincidences, commentary without new results, work outside the case's actual questions. This is the default. When uncertain, archive: genuinely significant developments in these fields are rare and loud — they recur across queries and get discussed — while a padded ledger quietly rots.

Judge ONLY from the metadata given (title, venue, date, abstract snippet). Never invent findings, numbers, or conclusions the metadata does not state.

Reply with ONLY a JSON array, one entry per item, no other text:
[{"index": <n>, "decision": "import" | "shelf" | "archive", "reason": "<one sentence>"}]`;

// ------------------------------------------------------------------ input

function findRunDir() {
  if (forcedRun) {
    const dir = path.join(WATCH_DIR, forcedRun);
    if (!fs.existsSync(dir)) {
      console.error(`no such watch run: ${forcedRun}`);
      process.exit(1);
    }
    return dir;
  }
  if (!fs.existsSync(WATCH_DIR)) return null;
  const candidates = fs
    .readdirSync(WATCH_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("watch-"))
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const name of candidates) {
    if (!fs.existsSync(path.join(WATCH_DIR, name, "triage.yaml"))) {
      return path.join(WATCH_DIR, name);
    }
  }
  return null;
}

/** Case context for the judge: what the case asks, and what it already claims. */
function caseContext(caseDir) {
  const record = parseYaml(
    fs.readFileSync(path.join(CASES_DIR, caseDir, "case.yaml"), "utf8"),
  );
  const claims = parseYaml(
    fs.readFileSync(path.join(CASES_DIR, caseDir, "claims.yaml"), "utf8"),
  );
  const featured = (claims ?? [])
    .filter((c) => c.tier !== "catalog" && c.reviewState !== "rejected")
    .map((c) => `- ${c.id}: ${c.statement}`)
    .join("\n");
  return [
    `Case: ${record.title} — ${record.subtitle ?? ""}`,
    "",
    `Summary: ${record.summary}`,
    "",
    "Existing featured claims (an import must bear on one or more of these, or on the case's core question):",
    featured,
  ].join("\n");
}

function itemsPrompt(items) {
  return items
    .map((item, i) =>
      [
        `[${i}] ${item.title}`,
        `    venue: ${item.venue ?? "unknown"} · date: ${item.date ?? "unknown"}`,
        ...(item.possibleDuplicateOf
          ? [`    watch flag: possible duplicate — ${item.possibleDuplicateOf}`]
          : []),
        `    abstract: ${item.abstractSnippet ?? "(none provided by the API)"}`,
      ].join("\n"),
    )
    .join("\n\n");
}

// ---------------------------------------------------------- archive ledger

/**
 * One compact, auditable line per archived item, appended to a ledger that
 * survives run expiry. Deduped by the item's strongest key (doi, then
 * arXiv id, then normalized title) so a retried triage run never appends
 * the same omission twice.
 */
function ledgerKey(item) {
  if (item.doi) return `doi:${item.doi}`;
  if (item.arxivId) return `arxiv:${item.arxivId}`;
  return `title:${String(item.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;
}

/**
 * Merge new entries into an existing ledger object, deduped by key.
 * Pure (takes and returns data; the caller owns I/O) so the dedup — the
 * part that keeps a retried run from double-recording an omission — is
 * unit-testable.
 */
export function mergeLedger(existing, entries) {
  const items = [...(existing?.items ?? [])];
  const known = new Set(items.map((i) => i.key));
  let added = 0;
  for (const e of entries) {
    if (known.has(e.key)) continue;
    known.add(e.key);
    items.push(e);
    added++;
  }
  return { ledger: { ...(existing ?? {}), items }, added };
}

function appendToLedger(entries) {
  if (entries.length === 0) return 0;
  const existing = fs.existsSync(LEDGER_FILE)
    ? (parseYaml(fs.readFileSync(LEDGER_FILE, "utf8")) ?? {})
    : {};
  const { ledger, added } = mergeLedger(existing, entries);
  if (added === 0) return 0;
  fs.writeFileSync(
    LEDGER_FILE,
    [
      "# Cumulative archive ledger: every watch item triage archived, one",
      "# line each, surviving the 60-day run expiry. This is the audit trail",
      "# for the triage asymmetry — import mistakes are caught downstream by",
      "# the ratification panel; archive mistakes are caught only here.",
      "# Review periodically (a second model or a human); an item wrongly",
      "# archived can be promoted by dropping its URL as an inbox link list.",
      stringifyYaml(ledger),
    ].join("\n"),
  );
  return added;
}

// ------------------------------------------------------------------ main

async function main() {
  const runDir = findRunDir();
  if (!runDir) {
    console.log("nothing to triage — no untriaged watch run found");
    return;
  }
  const watchRunId = path.basename(runDir);

  const provider = pickProvider(forcedProvider);
  if (!provider) {
    console.log(
      "triage skipped: no LLM API key configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)",
    );
    return;
  }

  const caseFiles = fs
    .readdirSync(runDir)
    .filter((f) => f.endsWith(".yaml") && !["run.yaml", "triage.yaml"].includes(f));

  const runId = `triage-${today}-${Math.random().toString(36).slice(2, 6)}`;
  // Every model that actually answered a triage call this run (the refusal
  // fallback may swap models mid-run) — this set, not provider.model, is
  // what the run records stamp.
  const modelsUsed = new Set();
  const caseResults = [];
  const inboxDrops = [];
  const ledgerEntries = [];
  const digest = [];

  for (const file of caseFiles) {
    const caseDir = path.basename(file, ".yaml");
    const record = parseYaml(fs.readFileSync(path.join(runDir, file), "utf8"));
    const items = record?.items ?? [];
    if (items.length === 0) continue;

    let decisions = null;
    let errors = [];
    let modelUsed = provider.model;
    try {
      // House-drafting call: the one-shot Opus refusal fallback applies,
      // and every stamp below must carry the model that actually answered.
      const r = await callWithRefusalFallback(
        provider,
        TRIAGE_SYSTEM,
        `${caseContext(caseDir)}\n\nNewly surfaced items to triage:\n\n${itemsPrompt(items)}`,
      );
      modelUsed = r.model;
      modelsUsed.add(`${provider.name}/${r.model}`);
      const reply = parseJsonReply(r.text);
      ({ decisions, errors } = validateTriageReply(reply, items.length));
    } catch (err) {
      errors = [`model call or JSON parse failed: ${String(err)}`];
    }

    if (!decisions) {
      caseResults.push({ case: caseDir, judged: false, errors });
      digest.push(
        `**${caseDir}**: triage FAILED closed (${errors.length} problem(s)) — ${items.length} item(s) left undecided; re-run with \`--run ${watchRunId}\` to retry (deterministic filenames make a retry overwrite, not duplicate).`,
      );
      continue;
    }

    decisions = applyDuplicateGuard(items, decisions);
    const judged = decisions.map((d) => ({
      title: items[d.index].title,
      url: items[d.index].url ?? null,
      doi: items[d.index].doi ?? null,
      arxivId: items[d.index].arxivId ?? null,
      decision: d.decision,
      reason: d.reason,
    }));
    caseResults.push({ case: caseDir, judged: true, decisions: judged, errors: [] });
    judged.forEach((d, i) => {
      if (d.decision === "archive") {
        ledgerEntries.push({
          key: ledgerKey(items[i]),
          case: caseDir,
          date: today,
          title: d.title,
          url: d.url,
          reason: d.reason,
          triageRun: runId,
        });
      }
    });

    const imports = judged.filter((d) => d.decision === "import" && d.url);
    const shelved = judged.filter((d) => d.decision === "shelf");
    digest.push(
      `**${caseDir}**: ${items.length} item(s) → ${imports.length} import, ${shelved.length} shelf, ${judged.length - imports.length - shelved.length} archive.` +
        (imports.length
          ? ` Importing: ${imports.map((d) => `“${d.title}”`).join("; ")}.`
          : ""),
    );

    if (imports.length > 0) {
      inboxDrops.push({
        file: `triage-${watchRunId}-${caseDir}.md`,
        content: [
          "---",
          `case: ${caseDir}`,
          "type: links",
          `origin: literature-watch triage (AI) — run ${runId}, judging watch run ${watchRunId}`,
          `model: ${provider.name}/${modelUsed}`,
          `promptVersion: ${PROMPT_VERSION}`,
          "---",
          "",
          "Machine-written link drop: the triage judge decided these surfaced",
          "papers likely carry new evidential weight. The inbox pipeline",
          "fetch-verifies each link into a source-record PROPOSAL; nothing is",
          "published by this file.",
          "",
          ...imports.map((d) => `- ${d.url}\n  ${d.reason}`),
          "",
        ].join("\n"),
      });
    }
  }

  if (caseResults.length === 0) {
    console.log(`nothing to triage — run ${watchRunId} surfaced no items`);
    return;
  }

  const report = [
    `# Literature triage ${runId}`,
    "",
    `Judged watch run ${watchRunId} on ${today} (model ${[...modelsUsed].join(", ") || `${provider.name}/${provider.model}`}, ${PROMPT_VERSION}).`,
    "",
    ...digest.map((d) => `- ${d}`),
    "",
    "## Ground rules",
    "",
    "- AI-generated decisions, recorded with reasons — drafts, not judgments of record.",
    "- Imports only queue a verification request (inbox link drop); the ledger admission rule (a source enters sources.yaml only when an evidence record cites it) is enforced at build time regardless.",
    "- A watch-flagged possible duplicate can never be imported by triage; the guard runs in code.",
    "- Shelf candidates await an agent adding them to the case's resources.yaml.",
    "- Archived items are also recorded, one line each, in `proposals/watch/archive-ledger.yaml` — the cumulative audit trail that survives run expiry, so omissions can be reviewed later.",
    `- Fully revertable: delete ${path.relative(ROOT, runDir)}/triage.yaml and any inbox/triage-${watchRunId}-*.md drops.`,
    "",
  ].join("\n");

  if (dryRun) {
    console.log(report);
    console.log("(dry run: nothing written)");
    return;
  }

  // If every case failed closed, leave the run unmarked so the next
  // scheduled triage retries it instead of burying the failure. Exit 0:
  // triage is an overlay on the maintenance run, and a vendor outage here
  // must not block the inbox/assessment work that already succeeded.
  if (caseResults.every((c) => !c.judged)) {
    console.error(report);
    console.log(
      `triage failed closed for every case in ${watchRunId} — nothing written, run stays untriaged`,
    );
    return;
  }

  fs.writeFileSync(
    path.join(runDir, "triage.yaml"),
    stringifyYaml({
      kind: "literature-watch-triage",
      runId,
      triageOf: watchRunId,
      date: today,
      model: [...modelsUsed].join("; ") || `${provider.name}/${provider.model}`,
      promptVersion: PROMPT_VERSION,
      note:
        "AI-generated triage of discovery-only watch proposals. Imports are " +
        "queued for verification via inbox link drops; nothing here touches " +
        "sources.yaml or evidence.yaml. See docs/MAINTENANCE.md.",
      cases: caseResults,
    }),
  );
  fs.writeFileSync(path.join(runDir, "triage.md"), report);
  for (const drop of inboxDrops) {
    fs.writeFileSync(path.join(INBOX_DIR, drop.file), drop.content);
  }
  const ledgerAdded = appendToLedger(ledgerEntries);

  console.error(
    `\n${runId}: judged ${caseResults.length} case(s) from ${watchRunId}; ${inboxDrops.length} inbox drop(s) queued; ${ledgerAdded} item(s) added to the archive ledger`,
  );
  console.log(path.relative(ROOT, runDir));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
