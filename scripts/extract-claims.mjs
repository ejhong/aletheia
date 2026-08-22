#!/usr/bin/env node
/**
 * Extraction pipeline v1: source document → proposed catalog-tier claims.
 *
 * Usage:
 *   node scripts/extract-claims.mjs <source-file> <case-slug> [options]
 *
 * Options:
 *   --source-id SRC-FOTI-2023   Source record id to anchor claims to (required)
 *   --source-title "..."        Title for the emitted source record skeleton
 *   --start-number 700          First claim number (ids are PREFIX-C<n>)
 *   --only <regex>              Only process sections whose title matches
 *   --max-sections N            Cap the number of sections processed
 *   --provider anthropic|openai Force a provider (default: auto-detect)
 *
 * Environment (fails early if absent — see docs/EXTRACTION_PIPELINE.md):
 *   ANTHROPIC_API_KEY  preferred provider (Anthropic Messages API)
 *   OPENAI_API_KEY     fallback provider (OpenAI Chat Completions API)
 *   EXTRACT_MODEL      optional model override
 *
 * Output (append-only proposals, never written into content/ directly):
 *   proposals/<case-slug>/<runId>/claims.yaml    catalog-tier claim proposals
 *   proposals/<case-slug>/<runId>/sources.yaml   source record skeleton
 *   proposals/<case-slug>/<runId>/rejected.yaml  everything dropped, with reasons
 *   proposals/<case-slug>/<runId>/coverage.yaml  per-section coverage report
 *   proposals/<case-slug>/<runId>/run.yaml       run provenance (model, prompts)
 *
 * Epistemic contract (per AGENTS.md / the bias protocol):
 *   - evidence-only extraction: what the source states, never verdicts;
 *   - atomic claims with a reasonably clear truth condition;
 *   - every claim anchored by an EXACT verbatim quote + locator — the quote
 *     is mechanically checked against the source, and a second adversarial
 *     LLM pass asks whether the quote actually supports the statement;
 *   - near-duplicates share an independenceGroup so they are never counted
 *     as independent evidence;
 *   - existing claims and rejected tombstones suppress re-proposal;
 *   - one runId stamped on every record.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const PROMPT_VERSION_EXTRACT = "extract-v1";
const PROMPT_VERSION_VERIFY = "verify-v1";

// ---------------------------------------------------------------- CLI args

const args = process.argv.slice(2);
const positional = [];
const opts = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--")) {
    opts[a.slice(2)] = args[++i];
  } else {
    positional.push(a);
  }
}
const [sourceFile, caseSlug] = positional;

function usageDie(msg) {
  console.error(`ERROR: ${msg}\n`);
  console.error(
    "usage: node scripts/extract-claims.mjs <source-file> <case-slug> \\\n" +
      "         --source-id SRC-EXAMPLE-2024 [--source-title ...] \\\n" +
      "         [--start-number 700] [--only <regex>] [--max-sections N] \\\n" +
      "         [--provider anthropic|openai]",
  );
  process.exit(1);
}

if (!sourceFile || !caseSlug) usageDie("source file and case slug are required");
if (!fs.existsSync(sourceFile)) usageDie(`no such file: ${sourceFile}`);
const sourceId = opts["source-id"];
if (!sourceId || !/^SRC-[A-Z0-9-]+$/.test(sourceId)) {
  usageDie("--source-id is required and must match SRC-[A-Z0-9-]+");
}

const caseDir = path.join(process.cwd(), "content", "cases", caseSlug);
if (!fs.existsSync(path.join(caseDir, "case.yaml"))) {
  usageDie(`no case at content/cases/${caseSlug}/case.yaml`);
}

// ------------------------------------------------------------- LLM client

const providers = {
  anthropic: {
    key: process.env.ANTHROPIC_API_KEY,
    model: process.env.EXTRACT_MODEL || "claude-sonnet-4-5",
    async call(system, user) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 8192,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      return data.content.map((b) => b.text ?? "").join("");
    },
  },
  openai: {
    key: process.env.OPENAI_API_KEY,
    model: process.env.EXTRACT_MODEL || "gpt-4o",
    async call(system, user) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.key}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      return data.choices[0].message.content;
    },
  },
};

const providerName =
  opts.provider ??
  (process.env.ANTHROPIC_API_KEY
    ? "anthropic"
    : process.env.OPENAI_API_KEY
      ? "openai"
      : null);
const provider = providers[providerName];
if (!provider || !provider.key) {
  console.error(
    [
      "",
      "ERROR: no LLM API key configured.",
      "",
      "This pipeline calls an LLM API for extraction and verification.",
      "Set ONE of these environment variables (locally, or as a repository",
      "secret under GitHub → Settings → Secrets and variables → Actions):",
      "",
      "  ANTHROPIC_API_KEY   Anthropic Messages API (preferred)",
      "  OPENAI_API_KEY      OpenAI Chat Completions API",
      "",
      "Optional: EXTRACT_MODEL to override the default model.",
      "See docs/EXTRACTION_PIPELINE.md.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

function parseJsonReply(text) {
  // Models occasionally wrap JSON in a code fence; strip it.
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((m ? m[1] : text).trim());
}

// ------------------------------------------------------------- sectioning

/**
 * Split a document into sections. Recognizes markdown headings and
 * book-style "Chapter N: Title" lines; lines that look like table-of-contents
 * entries (trailing page number) are ignored. Falls back to fixed-size
 * paragraph chunks when no headings exist.
 */
function sectionDocument(text) {
  const lines = text.split("\n");
  const isHeading = (line) => {
    const t = line.trim();
    if (/\t\s*\d+\s*$/.test(line)) return false; // TOC entry
    return /^#{1,3}\s+\S/.test(t) || /^(Chapter|CHAPTER|Part|PART)\s+\S+/.test(t);
  };
  const sections = [];
  let current = { title: "front matter", body: [] };
  for (const line of lines) {
    if (isHeading(line)) {
      if (current.body.join("").trim()) sections.push(current);
      current = { title: line.trim().replace(/^#+\s*/, ""), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.join("").trim()) sections.push(current);

  if (sections.length <= 1) {
    // No structure found: chunk on paragraph boundaries, ~6000 chars.
    const paras = text.split(/\n\s*\n/);
    const chunks = [];
    let buf = "";
    for (const p of paras) {
      if (buf.length + p.length > 6000 && buf) {
        chunks.push(buf);
        buf = "";
      }
      buf += (buf ? "\n\n" : "") + p;
    }
    if (buf.trim()) chunks.push(buf);
    return chunks.map((body, i) => ({ title: `chunk ${i + 1}`, body }));
  }
  return sections.map((s) => ({ title: s.title, body: s.body.join("\n") }));
}

// ------------------------------------------------------- text normalizing

const normalize = (s) =>
  s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s) => new Set(normalize(s).replace(/[^a-z0-9 ]/g, "").split(" "));

function jaccard(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter || 1);
}

// --------------------------------------------------------------- prompts

const EXTRACT_SYSTEM = `You extract claims from source documents for an evidence-mapping publication. Follow this bias protocol exactly:

- EVIDENCE-ONLY EXTRACTION. Record what the source states, observes, measures, or depicts. Never add your own verdict, endorsement, or skepticism. Never assess whether the source is right.
- ATOMIC CLAIMS. One proposition per claim, with a reasonably clear truth condition. Split compound statements. Observation before interpretation.
- EXACT QUOTES. Every claim must carry a VERBATIM quote from the provided text (copy characters exactly; 10-60 words). Never paraphrase inside the quote field. Never invent a quote.
- NO META-CLAIMS about the book itself ("the author argues...") — state the underlying proposition the source asserts, in neutral third-person form ("X exhibits Y", "Method Z can produce W").
- RUNG LADDER. Classify each claim: "observation" (something seen/measured/documented), "mechanism" (how something could work), "attribution" (who/what/when historically produced something).

Reply with ONLY a JSON array (no prose): [{"statement": "...", "quote": "...", "rung": "observation|mechanism|attribution", "theme": "<one of the provided theme keys>"}]. Extract every distinct substantive claim; skip pleasantries, narration, and filler. If the text contains no substantive claims reply [].`;

const VERIFY_SYSTEM = `You are an adversarial verification reviewer for an evidence-mapping publication. For each candidate claim you receive, you are given the claim statement and the verbatim quote it is anchored to. Your job is to REJECT bad extractions:

- FAIL if the quote does not actually state or directly support the statement (interpretation drift, overreach, or a verdict smuggled in).
- FAIL if the statement is compound (two or more separable propositions).
- FAIL if the statement has no reasonably clear truth condition.
- FAIL if the statement contains an extractor's judgment about truth rather than the source's assertion.
- PASS otherwise. Be strict: when in doubt, fail it and say why.

Reply with ONLY a JSON array (no prose), same order as the input: [{"index": 0, "verdict": "pass|fail", "reason": "..."}].`;

// ------------------------------------------------------------------ main

async function main() {
  const runId = `extract-${caseSlug}-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;
  const today = new Date().toISOString().slice(0, 10);
  const text = fs.readFileSync(sourceFile, "utf8");

  const caseRecord = parseYaml(
    fs.readFileSync(path.join(caseDir, "case.yaml"), "utf8"),
  );
  const themeKeys = Object.keys(caseRecord.themes).filter(
    (k) => k !== "out-of-scope",
  );
  const themeList = themeKeys
    .map((k) => `- ${k}: ${caseRecord.themes[k]}`)
    .join("\n");

  // Existing claims (including rejected tombstones) suppress re-proposal.
  const existing = [];
  for (const f of ["claims.yaml", "claims-catalog.yaml"]) {
    const p = path.join(caseDir, f);
    if (fs.existsSync(p)) existing.push(...parseYaml(fs.readFileSync(p, "utf8")));
  }

  const prefixMatch = existing[0]?.id?.match(/^([A-Z]+)-C/);
  const prefix = prefixMatch ? prefixMatch[1] : caseSlug.slice(0, 3).toUpperCase();
  let nextNumber = Number(opts["start-number"] ?? 700);

  let sections = sectionDocument(text);
  if (opts.only) {
    const re = new RegExp(opts.only, "i");
    sections = sections.filter((s) => re.test(s.title));
  }
  if (opts["max-sections"]) {
    sections = sections.slice(0, Number(opts["max-sections"]));
  }
  if (sections.length === 0) usageDie("no sections matched");

  console.error(
    `run ${runId}: ${sections.length} section(s), provider ${providerName} (${provider.model})`,
  );

  const proposals = [];
  const rejected = [];
  const coverage = [];

  for (const section of sections) {
    const locatorBase = `${path.basename(sourceFile)} — ${section.title}`;
    console.error(`  extracting: ${section.title} (${section.body.length} chars)`);

    let candidates = [];
    let sectionError = null;
    try {
      const reply = await provider.call(
        EXTRACT_SYSTEM,
        `Case themes (choose the closest key for each claim):\n${themeList}\n\nSource text (from "${section.title}"):\n\n${section.body.slice(0, 24000)}`,
      );
      candidates = parseJsonReply(reply);
      if (!Array.isArray(candidates)) throw new Error("reply is not an array");
    } catch (err) {
      sectionError = String(err);
      console.error(`    EXTRACTION FAILED: ${sectionError}`);
    }

    // Mechanical anchor check: the quote must occur verbatim (modulo
    // whitespace/typographic normalization) in the section text.
    const sectionNorm = normalize(section.body);
    const anchored = [];
    let anchorFailed = 0;
    for (const c of candidates) {
      if (
        !c ||
        typeof c.statement !== "string" ||
        typeof c.quote !== "string" ||
        !["observation", "mechanism", "attribution"].includes(c.rung)
      ) {
        rejected.push({ ...c, section: section.title, reason: "malformed extraction record" });
        continue;
      }
      if (!themeKeys.includes(c.theme)) c.theme = themeKeys[0];
      if (!sectionNorm.includes(normalize(c.quote))) {
        anchorFailed++;
        rejected.push({
          statement: c.statement,
          quote: c.quote,
          section: section.title,
          reason: "anchor check failed: quote not found verbatim in source section",
        });
        continue;
      }
      anchored.push(c);
    }

    // Adversarial verification pass.
    let verified = [];
    if (anchored.length > 0) {
      try {
        const reply = await provider.call(
          VERIFY_SYSTEM,
          JSON.stringify(
            anchored.map((c, index) => ({
              index,
              statement: c.statement,
              quote: c.quote,
            })),
            null,
            2,
          ),
        );
        const verdicts = parseJsonReply(reply);
        for (const c of anchored) {
          const v = verdicts.find((x) => x.index === anchored.indexOf(c));
          if (v?.verdict === "pass") {
            verified.push(c);
          } else {
            rejected.push({
              statement: c.statement,
              quote: c.quote,
              section: section.title,
              reason: `adversarial verification failed: ${v?.reason ?? "no verdict returned"}`,
            });
          }
        }
      } catch (err) {
        sectionError = `verification failed: ${err}`;
        console.error(`    VERIFICATION FAILED: ${err}`);
        // Fail closed: unverified candidates are rejected, not proposed.
        for (const c of anchored) {
          rejected.push({
            statement: c.statement,
            quote: c.quote,
            section: section.title,
            reason: "verification pass errored; failing closed",
          });
        }
        verified = [];
      }
    }

    // Dedupe against existing claims + tombstones.
    const survivors = [];
    for (const c of verified) {
      const dup = existing.find((e) => jaccard(e.statement, c.statement) > 0.55);
      if (dup) {
        rejected.push({
          statement: c.statement,
          section: section.title,
          reason:
            dup.reviewState === "rejected"
              ? `suppressed: near-duplicate of rejected tombstone ${dup.id}`
              : `suppressed: near-duplicate of existing claim ${dup.id}`,
        });
      } else {
        survivors.push({ ...c, section: section.title, locator: locatorBase });
      }
    }
    proposals.push(...survivors);

    coverage.push({
      section: section.title,
      chars: section.body.length,
      extracted: candidates.length,
      anchorFailed,
      verified: verified.length,
      proposed: survivors.length,
      ...(sectionError ? { error: sectionError } : {}),
      ...(candidates.length === 0 && !sectionError
        ? { note: "no claims extracted — review manually if unexpected" }
        : {}),
    });
  }

  // Independence grouping among the proposals themselves: near-duplicate
  // extractions share a group so they are never counted as independent.
  const groupOf = new Map();
  let groupSeq = 0;
  for (let i = 0; i < proposals.length; i++) {
    for (let j = i + 1; j < proposals.length; j++) {
      if (jaccard(proposals[i].statement, proposals[j].statement) > 0.5) {
        const g =
          groupOf.get(i) ?? groupOf.get(j) ?? `${runId}-g${++groupSeq}`;
        groupOf.set(i, g);
        groupOf.set(j, g);
      }
    }
  }

  const claims = proposals.map((p, i) => ({
    id: `${prefix}-C${String(nextNumber++).padStart(3, "0")}`,
    statement: p.statement,
    theme: p.theme,
    rung: p.rung,
    tier: "catalog",
    reviewState: "ai_extracted",
    sourceAnchor: {
      locator: p.locator,
      quote: p.quote,
      sourceId,
    },
    ...(groupOf.has(i) ? { independenceGroup: groupOf.get(i) } : {}),
    origin: {
      ref: `pipeline ${path.basename(sourceFile)} § ${p.section}`,
      extractedBy: `${providerName}/${provider.model}`,
      runId,
      date: today,
    },
  }));

  const sourceRecord = {
    id: sourceId,
    title: opts["source-title"] ?? path.basename(sourceFile),
    authors: [],
    sourceType: "book",
    verification: "unverified",
    verificationNote:
      "Pipeline-proposed skeleton — a human must complete bibliographic fields and verify before merge.",
    reliabilityNotes: [],
  };

  const outDir = path.join(process.cwd(), "proposals", caseSlug, runId);
  fs.mkdirSync(outDir, { recursive: true });
  const write = (name, data) =>
    fs.writeFileSync(path.join(outDir, name), stringifyYaml(data));
  write("claims.yaml", claims);
  write("sources.yaml", [sourceRecord]);
  write("rejected.yaml", rejected);
  write("coverage.yaml", coverage);
  write("run.yaml", {
    runId,
    date: today,
    caseSlug,
    sourceFile: path.basename(sourceFile),
    sourceId,
    provider: providerName,
    model: provider.model,
    promptVersions: [PROMPT_VERSION_EXTRACT, PROMPT_VERSION_VERIFY],
    sections: sections.length,
    proposed: claims.length,
    rejected: rejected.length,
    note: "Append-only proposal. A human reviews, renumbers if needed, and merges accepted claims into content/cases/<slug>/claims-catalog.yaml.",
  });

  console.error(
    `\ndone: ${claims.length} proposed, ${rejected.length} rejected → ${path.relative(process.cwd(), outDir)}/`,
  );
  console.log(path.relative(process.cwd(), outDir));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
