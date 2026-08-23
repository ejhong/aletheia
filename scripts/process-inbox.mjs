#!/usr/bin/env node
/**
 * Inbox processor — the "commentator-in-chief" intake pipeline.
 *
 * Usage:
 *   node scripts/process-inbox.mjs [--dry-run] [--provider anthropic|openai]
 *
 * Scans inbox/ (see inbox/README.md for the drop convention) and routes:
 *   - commentary notes  → proposed editorial changes, explicitly attributed
 *     to the named human editor with their words preserved verbatim — the
 *     commentary text IS the human editorial record; the AI only translates
 *     it into proposed claim/evidence updates;
 *   - link lists        → fetch + verify each URL, propose source records
 *     with honest verification labels (no LLM needed);
 *   - documents (.txt/.md bodies) → the extraction pipeline
 *     (scripts/extract-claims.mjs), producing catalog-tier claim proposals;
 *   - PDFs              → converted with pdftotext when available (poppler),
 *     then routed like any text drop; otherwise flagged in the report;
 *   - other binaries    → flagged in the report ("convert to text first").
 *
 * Attribution: front matter `editor:` names the accountable human editor;
 * optional `from:` / `provenance:` record that the words are a third
 * party's (e.g. researcher correspondence), so contributed text is never
 * silently attributed to the editor who dropped it.
 *
 * Everything lands under proposals/, runId-stamped, never in content/.
 * Processed items move to inbox/processed/<runId>/ so the inbox stays
 * clean and each run is traceable and revertable by runId.
 *
 * Exit code 0 with "nothing to process" when the inbox is empty — the
 * scheduled workflow treats that as a no-op, not a failure.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { noKeyMessage, parseJsonReply, pickProvider } from "./lib/llm.mjs";

const PROMPT_VERSION_COMMENTARY = "commentary-v1";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const forcedProvider = args.includes("--provider")
  ? args[args.indexOf("--provider") + 1]
  : undefined;

const ROOT = process.cwd();
const INBOX = path.join(ROOT, "inbox");
const CASES_DIR = path.join(ROOT, "content", "cases");

// ------------------------------------------------------------- inventory

function listInboxItems() {
  if (!fs.existsSync(INBOX)) return [];
  const items = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full === path.join(INBOX, "processed")) continue;
        walk(full);
      } else {
        if (full === path.join(INBOX, "README.md")) continue;
        items.push(full);
      }
    }
  };
  walk(INBOX);
  return items;
}

function parseFrontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  let meta = {};
  try {
    meta = parseYaml(m[1]) ?? {};
  } catch {
    // Malformed front matter: treat as body text, never guess.
  }
  return { meta, body: text.slice(m[0].length) };
}

/**
 * Convert a PDF to plain text via poppler's pdftotext, if installed.
 * Returns null when the tool is missing or conversion fails — the caller
 * falls back to the old "convert to text first" skip message.
 */
function pdfToText(file) {
  const res = spawnSync("pdftotext", ["-layout", file, "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error || res.status !== 0) return null;
  const text = (res.stdout ?? "").trim();
  return text.length > 0 ? text : null;
}

const caseDirs = fs.existsSync(CASES_DIR)
  ? fs.readdirSync(CASES_DIR).filter((d) =>
      fs.existsSync(path.join(CASES_DIR, d, "case.yaml")),
    )
  : [];

function detectCase(filePath, meta) {
  if (meta.case && caseDirs.includes(meta.case)) return meta.case;
  const rel = path.relative(INBOX, filePath);
  const first = rel.split(path.sep)[0];
  if (caseDirs.includes(first)) return first;
  return null;
}

function detectType(filePath, meta, body, treatAsText = false) {
  if (["commentary", "links", "document"].includes(meta.type)) return meta.type;
  const ext = path.extname(filePath).toLowerCase();
  if (![".md", ".txt"].includes(ext) && !treatAsText) return "binary";
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "empty";
  const linkish = lines.filter(
    (l) => /^https?:\/\//.test(l) || /^[-*]\s*\[?.*https?:\/\//.test(l),
  );
  if (linkish.length >= Math.max(1, Math.ceil(lines.length * 0.6))) {
    return "links";
  }
  // Long prose without an editor voice is more likely a document to mine
  // than commentary; 4000 chars is a generous note ceiling.
  if (body.length > 4000 && !meta.editor) return "document";
  return "commentary";
}

// -------------------------------------------------------------- commentary

const COMMENTARY_SYSTEM = `You translate a human editor's commentary into proposed editorial actions for an evidence-mapping publication. The editor's words are the authoritative record — you are a translator, not a co-author.

Rules:
- Propose only what the commentary actually supports. Never extrapolate to positions the editor did not state.
- Every proposal must carry the exact sentence(s) from the commentary that justify it, copied verbatim into "editorQuote".
- Allowed action types:
  - "promote_claim": suggest promoting a catalog-tier claim to featured (claimId required).
  - "review_state": suggest changing a claim's reviewState (e.g. ai_extracted → human_reviewed or disputed; claimId required).
  - "evidence_note": suggest adding or revising an evidence record's interpretation (claimId or evidence description required).
  - "assessment_note": input for the next AI assessment run about a claim or the case.
  - "other": anything that does not fit; describe precisely.
- For each proposal give "proposal" (what to change, concretely) and "rationale" (why, grounded in the commentary).
- If the commentary is ambiguous, emit an "other" action asking for clarification rather than guessing.

Reply with ONLY a JSON array: [{"action": "...", "claimId": "... or null", "proposal": "...", "rationale": "...", "editorQuote": "..."}]. Empty array if the note contains no actionable editorial positions.`;

async function processCommentary(item, provider, runId, today) {
  const claimIndex = [];
  for (const f of ["claims.yaml", "claims-catalog.yaml"]) {
    const p = path.join(CASES_DIR, item.case, f);
    if (!fs.existsSync(p)) continue;
    for (const c of parseYaml(fs.readFileSync(p, "utf8")) ?? []) {
      claimIndex.push(
        `${c.id} [${c.tier ?? "featured"}/${c.reviewState}]: ${c.statement}`,
      );
    }
  }
  const attribution = item.meta.from
    ? `Third-party contribution from ${item.meta.from}, submitted by editor ${item.meta.editor ?? "Eugene"} — the words below are the contributor's, not the editor's.`
    : `Editor commentary`;
  const reply = await provider.call(
    COMMENTARY_SYSTEM,
    `Case: ${item.case}\n\nExisting claims (id [tier/reviewState]: statement):\n${claimIndex.join(
      "\n",
    )}\n\n${attribution} (from ${path.basename(item.file)}):\n\n${item.body}`,
  );
  const actions = parseJsonReply(reply);
  if (!Array.isArray(actions)) throw new Error("commentary reply not an array");

  // Guard: every editorQuote must actually appear in the commentary.
  const normalize = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const bodyNorm = normalize(item.body);
  for (const a of actions) {
    a.quoteVerified = Boolean(
      a.editorQuote && bodyNorm.includes(normalize(a.editorQuote)),
    );
  }

  return {
    kind: "editorial-proposals",
    case: item.case,
    editor: item.meta.editor ?? "Eugene",
    /** Third-party attribution: when `from`/`provenance` front matter is
        present, the verbatim words below are a contributor's (researcher
        correspondence etc.), submitted via the named editor — never the
        editor's own statement. */
    from: item.meta.from ?? null,
    provenance: item.meta.provenance ?? null,
    sourceFile: path.basename(item.file),
    /** The human editorial record, verbatim. This text is authoritative;
        the proposals below are an AI translation of it. */
    sourceStatement: item.body.trim(),
    runId,
    date: today,
    model: `${provider.name}/${provider.model}`,
    promptVersion: PROMPT_VERSION_COMMENTARY,
    proposals: actions,
  };
}

// ------------------------------------------------------------------ links

function extractUrls(body) {
  return [...body.matchAll(/https?:\/\/[^\s)\]>"']+/g)].map((m) => m[0]);
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "aletheia-inbox-pipeline/1.0" },
    });
    const type = res.headers.get("content-type") ?? "";
    let title = null;
    if (res.ok && type.includes("text/html")) {
      const html = (await res.text()).slice(0, 100000);
      title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
    }
    return { ok: res.ok, status: res.status, title };
  } catch (err) {
    return { ok: false, status: null, title: null, error: String(err) };
  }
}

async function processLinks(item, runId, today) {
  const urls = extractUrls(item.body);
  const records = [];
  for (const [i, url] of urls.entries()) {
    const check = await checkUrl(url);
    records.push({
      id: `SRC-PROPOSED-${runId.slice(-4).toUpperCase()}-${i + 1}`,
      title: check.title ?? url,
      authors: [],
      sourceType: "webpage",
      url,
      verification: check.ok ? "ai_verified" : "unverified",
      verificationNote: check.ok
        ? `URL fetched by inbox pipeline on ${today} (HTTP ${check.status}${
            check.title ? `, title confirmed` : ""
          }). A human should verify content relevance before use.`
        : `URL could NOT be fetched by the pipeline on ${today}${
            check.error ? ` (${check.error})` : ""
          }. Do not cite until verified.`,
      reliabilityNotes: [],
    });
  }
  return {
    kind: "source-proposals",
    case: item.case,
    sourceFile: path.basename(item.file),
    runId,
    date: today,
    sources: records,
  };
}

// ------------------------------------------------------------------ main

async function main() {
  const items = listInboxItems();
  if (items.length === 0) {
    console.log("nothing to process — inbox is empty");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const runId = `inbox-${today}-${Math.random().toString(36).slice(2, 6)}`;

  // Parse and classify everything first.
  const parsed = items.map((file) => {
    const ext = path.extname(file).toLowerCase();
    const isText = [".md", ".txt"].includes(ext);
    let raw = isText ? fs.readFileSync(file, "utf8") : null;
    let convertedFromPdf = false;
    if (ext === ".pdf") {
      const text = pdfToText(file);
      if (text) {
        raw = text;
        convertedFromPdf = true;
      }
    }
    const usable = isText || convertedFromPdf;
    const { meta, body } = usable ? parseFrontMatter(raw) : { meta: {}, body: "" };
    return {
      file,
      meta,
      body,
      convertedFromPdf,
      case: detectCase(file, meta),
      type: usable ? detectType(file, meta, body, convertedFromPdf) : "binary",
    };
  });

  // Dry run = classification only: report what each item would become,
  // without LLM calls, extraction runs, writes, or moves.
  if (dryRun) {
    console.log(`# Inbox dry run (${today})\n`);
    for (const item of parsed) {
      const name = path.relative(INBOX, item.file);
      console.log(
        `- ${name} → type: ${item.type}${item.convertedFromPdf ? " (converted from PDF)" : ""}, case: ${item.case ?? "NONE — would be left in inbox"}`,
      );
    }
    console.log("\n(dry run: no LLM calls, nothing written, nothing moved)");
    return;
  }

  const needsLlm = parsed.some(
    (p) => p.type === "commentary" || p.type === "document",
  );
  const provider = pickProvider(forcedProvider);
  if (needsLlm && !provider) {
    console.error(noKeyMessage());
    process.exit(1);
  }

  const outDir = path.join(ROOT, "proposals", "inbox", runId);
  const processedDir = path.join(INBOX, "processed", runId);
  const digest = [];
  const skipped = [];
  const outputs = [];
  const moved = [];

  for (const item of parsed) {
    const name = path.relative(INBOX, item.file);
    if (item.type === "binary") {
      skipped.push(
        path.extname(item.file).toLowerCase() === ".pdf"
          ? `**${name}** — PDF could not be converted (is \`pdftotext\` installed? \`brew install poppler\` / \`apt-get install poppler-utils\`). Convert to text (.txt/.md) and re-drop, or install poppler and re-run.`
          : `**${name}** — binary file. Convert to text (.txt/.md) and re-drop; the pipeline does not parse binaries.`,
      );
      continue;
    }
    if (item.type === "empty") {
      skipped.push(`**${name}** — empty file, ignored.`);
      continue;
    }
    if (!item.case) {
      skipped.push(`**${name}** — no case assigned. Add \`case: <case-dir>\` front matter or drop it in \`inbox/<case-dir>/\`. Known cases: ${caseDirs.join(", ")}.`);
      continue;
    }

    if (item.type === "commentary") {
      console.error(`commentary: ${name} → case ${item.case}`);
      const record = await processCommentary(item, provider, runId, today);
      outputs.push({ name: `editorial-${path.parse(item.file).name}.yaml`, record });
      const verified = record.proposals.filter((p) => p.quoteVerified).length;
      digest.push(
        `**Your note ${name}** (case ${item.case}): translated into ${record.proposals.length} proposed editorial action(s)` +
          (verified < record.proposals.length
            ? ` — ${record.proposals.length - verified} carry quotes the pipeline could not verify verbatim; treat those with suspicion`
            : "") +
          `. Your original words are preserved verbatim in the proposal record and remain the authoritative editorial statement.`,
      );
    } else if (item.type === "links") {
      console.error(`links: ${name} → case ${item.case}`);
      const record = await processLinks(item, runId, today);
      outputs.push({ name: `sources-${path.parse(item.file).name}.yaml`, record });
      const ok = record.sources.filter((s) => s.verification === "ai_verified").length;
      digest.push(
        `**Link list ${name}** (case ${item.case}): ${record.sources.length} source record(s) proposed — ${ok} fetched and reachable, ${record.sources.length - ok} unreachable (left as unverified; do not cite until checked).`,
      );
    } else if (item.type === "document") {
      console.error(`document: ${name} → extraction pipeline (case ${item.case})`);
      const srcId = `SRC-INBOX-${path.parse(item.file).name.replace(/[^a-zA-Z0-9]+/g, "-").toUpperCase().slice(0, 24).replace(/^-+|-+$/g, "")}`;
      // Converted PDFs: the extractor reads a file path, so hand it the
      // extracted text via a temp file; the original PDF still moves to
      // processed/ as the provenance artifact.
      let extractPath = item.file;
      if (item.convertedFromPdf) {
        extractPath = path.join(
          fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-inbox-")),
          `${path.parse(item.file).name}.txt`,
        );
        fs.writeFileSync(extractPath, item.body);
      }
      const res = spawnSync(
        process.execPath,
        [
          path.join(ROOT, "scripts", "extract-claims.mjs"),
          extractPath,
          item.case,
          "--source-id",
          srcId,
        ],
        { cwd: ROOT, encoding: "utf8" },
      );
      if (res.status === 0) {
        const proposalDir = res.stdout.trim().split("\n").pop();
        digest.push(
          `**Document ${name}** (case ${item.case}): ran the extraction pipeline → proposals in \`${proposalDir}\` (see its coverage.yaml for per-section counts).`,
        );
      } else {
        skipped.push(
          `**${name}** — extraction pipeline failed: ${(res.stderr || "").split("\n").filter(Boolean).pop() ?? "unknown error"}`,
        );
        continue;
      }
    }
    moved.push(item.file);
  }

  // Write outputs + report, then move processed items.
  const report = [
    `# Inbox run ${runId}`,
    "",
    `Processed ${moved.length} of ${items.length} inbox item(s) on ${today}.`,
    "",
    ...(digest.length ? ["## What happened", "", ...digest.map((d) => `- ${d}`), ""] : []),
    ...(skipped.length
      ? ["## Needs your attention (left in the inbox)", "", ...skipped.map((s) => `- ${s}`), ""]
      : []),
    "## Ground rules",
    "",
    "- Nothing here touched published content: these are proposals under `proposals/`, runId-stamped.",
    `- Processed originals moved to \`inbox/processed/${runId}/\` — the run is fully revertable by this runId.`,
    "- Commentary translations are AI drafts; the editor's verbatim text in each record is the human editorial record.",
    "",
  ].join("\n");

  if (dryRun) {
    console.log(report);
    console.log("(dry run: nothing written, nothing moved)");
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  for (const o of outputs) {
    fs.writeFileSync(path.join(outDir, o.name), stringifyYaml(o.record));
  }
  fs.writeFileSync(path.join(outDir, "report.md"), report);
  fs.writeFileSync(
    path.join(outDir, "run.yaml"),
    stringifyYaml({
      runId,
      date: today,
      processed: moved.map((f) => path.relative(INBOX, f)),
      skipped: skipped.length,
      model: provider ? `${provider.name}/${provider.model}` : null,
      promptVersions: [PROMPT_VERSION_COMMENTARY],
    }),
  );

  if (moved.length > 0) {
    fs.mkdirSync(processedDir, { recursive: true });
    for (const f of moved) {
      const flat = path.relative(INBOX, f).split(path.sep).join("--");
      fs.renameSync(f, path.join(processedDir, flat));
    }
  }

  console.error(
    `\nrun ${runId}: ${moved.length} processed, ${skipped.length} left in inbox → ${path.relative(ROOT, outDir)}/`,
  );
  console.log(path.relative(ROOT, outDir));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
