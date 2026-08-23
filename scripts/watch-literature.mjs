#!/usr/bin/env node
/**
 * Literature watch — weekly discovery of new papers for each case.
 *
 * Usage:
 *   node scripts/watch-literature.mjs [--dry-run] [--case <case-dir>]
 *                                     [--days <n>] [--max-per-query <n>]
 *                                     [--no-llm] [--provider anthropic|openai]
 *
 * For each case with a content/cases/<case>/watch.yaml (validated at build
 * time by WatchConfigSchema in src/domain/schema.ts), runs the declared
 * queries against:
 *   - arXiv   (Atom API — free, keyless; 3s politeness delay between calls)
 *   - Crossref (REST API — free; polite pool via the mailto parameter)
 *   - OpenAlex (optional third source, only when a query declares it)
 * for items published/indexed since the case's last run.
 *
 * DISCOVERY ONLY. Everything surfaced is labeled unverified; nothing is
 * written to sources.yaml or evidence.yaml. Metadata is recorded exactly as
 * the APIs returned it — no field is invented or completed from memory.
 *
 * Dedup, in order:
 *   1. against sources.yaml (DOI / arXiv id extracted from identifier+url);
 *   2. against previously surfaced items (per-case `seen` list in the state
 *      file proposals/watch/state.yaml — inside proposals/ so the weekly
 *      run stays in the low-risk allowlist of classify-pr-risk.mjs);
 *   3. within the run (same item matched by several queries is listed once,
 *      with every matching query recorded).
 *
 * Output: proposals/watch/<runId>/ with run.yaml, report.md, and one
 * <case>.yaml per case with new items. runId: watch-<date>-<rand>, matching
 * the repo's existing conventions (inbox-…, extract-…).
 *
 * If an LLM key is configured (see scripts/lib/llm.mjs) each item gets a
 * short relevance note, clearly labeled AI-generated. Without a key the
 * script runs identically, just without notes — discovery never depends on
 * an LLM.
 *
 * Exit code 0 with "nothing new" when no case surfaces anything — the
 * scheduled workflow treats that as a no-op, not a failure.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { pickProvider } from "./lib/llm.mjs";

const PROMPT_VERSION = "watch-relevance-v1";
// Crossref polite pool + arXiv contact. The repo owner's public git email.
const MAILTO = process.env.CROSSREF_MAILTO || "ejhong@gmail.com";
const USER_AGENT = `aletheia-literature-watch/1.0 (https://github.com/ejhong/aletheia; mailto:${MAILTO})`;
// First-run lookback when a case has no cursor yet.
const DEFAULT_FIRST_RUN_DAYS = 180;
// Re-scan overlap so slow indexing does not lose items between runs; the
// seen-list dedup makes the overlap harmless.
const CURSOR_OVERLAP_DAYS = 7;
const MAX_RELEVANCE_NOTES_PER_CASE = 10;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const noLlm = args.includes("--no-llm");
const onlyCase = args.includes("--case") ? args[args.indexOf("--case") + 1] : null;
const forcedDays = args.includes("--days")
  ? Number(args[args.indexOf("--days") + 1])
  : null;
const maxPerQuery = args.includes("--max-per-query")
  ? Number(args[args.indexOf("--max-per-query") + 1])
  : 25;
const forcedProvider = args.includes("--provider")
  ? args[args.indexOf("--provider") + 1]
  : undefined;

const ROOT = process.cwd();
const CASES_DIR = path.join(ROOT, "content", "cases");
const STATE_FILE = path.join(ROOT, "proposals", "watch", "state.yaml");

const today = new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------- utilities

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractDoi(text) {
  if (!text) return null;
  const m = String(text).match(/\b10\.\d{4,9}\/[^\s"'<>]+/);
  return m ? m[0].replace(/[.,;)\]]+$/, "").toLowerCase() : null;
}

function extractArxivId(text) {
  if (!text) return null;
  const m = String(text).match(
    /\barxiv(?:\.org)?[:\s/]*(?:abs\/|pdf\/)?(\d{4}\.\d{4,5})(?:v\d+)?/i,
  );
  return m ? m[1] : null;
}

function normalizeTitle(t) {
  return String(t ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Dedup keys for an item, strongest first. */
function itemKeys(item) {
  const keys = [];
  if (item.doi) keys.push(`doi:${item.doi}`);
  if (item.arxivId) keys.push(`arxiv:${item.arxivId}`);
  const nt = normalizeTitle(item.title);
  if (nt.length > 12) keys.push(`title:${nt}`);
  return keys;
}

function stripXml(s) {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(s, max = 500) {
  const clean = stripXml(s);
  if (!clean) return null;
  return clean.length <= max ? clean : `${clean.slice(0, max).trimEnd()}…`;
}

async function apiGet(url, { json = true } = {}) {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`${new URL(url).host} HTTP ${res.status}`);
  }
  return json ? res.json() : res.text();
}

// ----------------------------------------------------------- search APIs
// Every extractor records exactly what the API returned; missing fields
// stay null rather than being guessed.

async function searchArxiv(query, since) {
  const terms = query.query
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `all:${w}`)
    .join(" AND ");
  const authorPart = query.authors?.length
    ? ` AND (${query.authors.map((a) => `au:"${a}"`).join(" OR ")})`
    : "";
  const url =
    "https://export.arxiv.org/api/query?" +
    new URLSearchParams({
      search_query: `(${terms})${authorPart}`,
      sortBy: "submittedDate",
      sortOrder: "descending",
      max_results: String(maxPerQuery),
    });
  const xml = await apiGet(url, { json: false });
  const items = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = m[1];
    const pick = (tag) =>
      entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? null;
    const published = (pick("published") ?? "").slice(0, 10);
    if (!published || published < since) continue;
    const idUrl = stripXml(pick("id"));
    const arxivId = extractArxivId(idUrl);
    const category =
      entry.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1] ?? null;
    items.push({
      title: stripXml(pick("title")),
      authors: [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((a) =>
        stripXml(a[1]),
      ),
      venue: category ? `arXiv (${category})` : "arXiv",
      date: published,
      doi: extractDoi(pick("arxiv:doi")),
      arxivId,
      url: arxivId ? `https://arxiv.org/abs/${arxivId}` : idUrl || null,
      abstractSnippet: snippet(pick("summary")),
      foundVia: "arxiv",
    });
  }
  return items;
}

async function searchCrossref(query, since) {
  const params = new URLSearchParams({
    "query.bibliographic": query.query,
    filter: `from-index-date:${since}`,
    sort: "indexed",
    order: "desc",
    rows: String(maxPerQuery),
    mailto: MAILTO,
  });
  if (query.authors?.length) {
    params.set("query.author", query.authors.join(" "));
  }
  const data = await apiGet(`https://api.crossref.org/works?${params}`);
  return (data.message?.items ?? []).map((w) => {
    // issued can be [[null]] — keep only real numeric parts, else fall back
    // to the DOI-creation timestamp, else record no date at all.
    const issued = (w.issued?.["date-parts"]?.[0] ?? []).filter(
      (p) => typeof p === "number",
    );
    const date = issued.length
      ? issued
          .map((p, i) => String(p).padStart(i === 0 ? 4 : 2, "0"))
          .join("-")
      : (w.created?.["date-time"] ?? "").slice(0, 10) || null;
    return {
      title: stripXml(w.title?.[0] ?? ""),
      authors: (w.author ?? []).map((a) =>
        [a.given, a.family].filter(Boolean).join(" ") || a.name || "",
      ),
      venue: w["container-title"]?.[0] ?? w.publisher ?? null,
      date,
      doi: extractDoi(w.DOI),
      arxivId: null,
      url: w.URL ?? (w.DOI ? `https://doi.org/${w.DOI}` : null),
      abstractSnippet: snippet(w.abstract),
      foundVia: "crossref",
    };
  });
}

async function searchOpenAlex(query, since) {
  const params = new URLSearchParams({
    search: query.query,
    filter: `from_publication_date:${since}`,
    sort: "publication_date:desc",
    "per-page": String(maxPerQuery),
    mailto: MAILTO,
  });
  const data = await apiGet(`https://api.openalex.org/works?${params}`);
  return (data.results ?? []).map((w) => {
    // OpenAlex stores abstracts as an inverted index; reconstruct the text.
    let abstract = null;
    if (w.abstract_inverted_index) {
      const words = [];
      for (const [word, positions] of Object.entries(w.abstract_inverted_index)) {
        for (const p of positions) words[p] = word;
      }
      abstract = words.join(" ");
    }
    return {
      title: stripXml(w.title ?? w.display_name ?? ""),
      authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? ""),
      venue: w.primary_location?.source?.display_name ?? null,
      date: w.publication_date ?? null,
      doi: extractDoi(w.doi),
      arxivId: extractArxivId(w.primary_location?.landing_page_url),
      url: w.primary_location?.landing_page_url ?? w.doi ?? null,
      abstractSnippet: snippet(abstract),
      foundVia: "openalex",
    };
  });
}

const searchers = {
  arxiv: searchArxiv,
  crossref: searchCrossref,
  openalex: searchOpenAlex,
};

// ------------------------------------------------------------- filtering

function matchesKeywords(item, query) {
  if (!query.keywords?.length) return true;
  const haystack = `${item.title} ${item.abstractSnippet ?? ""}`.toLowerCase();
  return query.keywords.some((k) => haystack.includes(k.toLowerCase()));
}

function matchesAuthors(item, query) {
  if (!query.authors?.length) return true;
  const names = item.authors.join("; ").toLowerCase();
  return query.authors.some((a) => names.includes(a.toLowerCase()));
}

/** DOIs and arXiv ids already carried by the case's source records. */
function knownSourceKeys(caseDir) {
  const keys = new Set();
  const p = path.join(CASES_DIR, caseDir, "sources.yaml");
  if (!fs.existsSync(p)) return keys;
  for (const s of parseYaml(fs.readFileSync(p, "utf8")) ?? []) {
    for (const field of [s.identifier, s.url]) {
      const doi = extractDoi(field);
      if (doi) keys.add(`doi:${doi}`);
      const arxiv = extractArxivId(field);
      if (arxiv) keys.add(`arxiv:${arxiv}`);
    }
  }
  return keys;
}

// ------------------------------------------------------ optional LLM note

async function relevanceNote(provider, caseRecord, item) {
  const reply = await provider.call(
    `You draft one-sentence relevance notes for a literature-watch pipeline. Given a case description and a newly surfaced paper, say in 1-2 plain sentences whether and how the paper looks relevant to the case. Ground yourself ONLY in the given title/abstract — never invent findings, numbers, or conclusions. If relevance is unclear from the metadata, say so.`,
    `Case: ${caseRecord.title} — ${caseRecord.subtitle}\n\nSummary: ${caseRecord.summary}\n\nNew item:\nTitle: ${item.title}\nVenue: ${item.venue ?? "unknown"}\nAbstract: ${item.abstractSnippet ?? "(none provided by the API)"}`,
  );
  return reply.trim();
}

// ------------------------------------------------------------------ main

async function main() {
  const caseDirs = fs
    .readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((d) => (onlyCase ? d === onlyCase : true))
    .filter((d) => fs.existsSync(path.join(CASES_DIR, d, "watch.yaml")));

  if (caseDirs.length === 0) {
    console.log("nothing new — no case declares watch queries");
    return;
  }

  const state = fs.existsSync(STATE_FILE)
    ? (parseYaml(fs.readFileSync(STATE_FILE, "utf8")) ?? {})
    : {};
  state.cases ??= {};

  const provider = noLlm ? null : pickProvider(forcedProvider);
  const runId = `watch-${today}-${Math.random().toString(36).slice(2, 6)}`;

  const perCaseOutputs = [];
  const digest = [];
  const errors = [];
  let arxivCalls = 0;

  for (const caseDir of caseDirs) {
    const watch = parseYaml(
      fs.readFileSync(path.join(CASES_DIR, caseDir, "watch.yaml"), "utf8"),
    );
    if (!Array.isArray(watch?.queries) || watch.queries.length === 0) {
      errors.push(`${caseDir}: watch.yaml has no queries — skipped`);
      continue;
    }
    const caseRecord = parseYaml(
      fs.readFileSync(path.join(CASES_DIR, caseDir, "case.yaml"), "utf8"),
    );

    const caseState = state.cases[caseDir] ?? { lastRun: null, seen: [] };
    const lookbackDays =
      forcedDays ?? (caseState.lastRun ? null : DEFAULT_FIRST_RUN_DAYS);
    const sinceDate = lookbackDays
      ? new Date(Date.now() - lookbackDays * 86400000)
      : new Date(
          new Date(caseState.lastRun).getTime() -
            CURSOR_OVERLAP_DAYS * 86400000,
        );
    const since = sinceDate.toISOString().slice(0, 10);

    const knownKeys = new Set([...knownSourceKeys(caseDir), ...caseState.seen]);
    const byKey = new Map(); // first key -> item (deduped within run)

    for (const query of watch.queries) {
      const sources = query.sources?.length
        ? query.sources
        : ["arxiv", "crossref"];
      for (const sourceName of sources) {
        const search = searchers[sourceName];
        if (!search) {
          errors.push(`${caseDir}/${query.id}: unknown source "${sourceName}"`);
          continue;
        }
        try {
          if (sourceName === "arxiv" && arxivCalls++ > 0) await sleep(3000);
          const found = await search(query, since);
          console.error(
            `${caseDir} · ${query.id} · ${sourceName}: ${found.length} raw`,
          );
          for (const item of found) {
            if (!item.title) continue;
            // Crossref/OpenAlex windows are index-based, which resurfaces
            // old papers on metadata updates; drop items whose *published*
            // date clearly precedes the window (undated items are kept).
            // Partial dates (YYYY or YYYY-MM) compare against the same
            // prefix of the cursor.
            if (item.date && item.date < since.slice(0, item.date.length)) {
              continue;
            }
            if (!matchesKeywords(item, query)) continue;
            if (!matchesAuthors(item, query)) continue;
            const keys = itemKeys(item);
            if (keys.length === 0) continue;
            if (keys.some((k) => knownKeys.has(k))) continue;
            const existing = keys.map((k) => byKey.get(k)).find(Boolean);
            const matched = { id: query.id, query: query.query };
            if (existing) {
              if (!existing.matchedQueries.some((q) => q.id === query.id)) {
                existing.matchedQueries.push(matched);
              }
            } else {
              const record = { ...item, matchedQueries: [matched] };
              for (const k of keys) byKey.set(k, record);
            }
          }
        } catch (err) {
          errors.push(`${caseDir}/${query.id}/${sourceName}: ${String(err)}`);
        }
      }
    }

    const newItems = [...new Set(byKey.values())];
    if (newItems.length === 0) {
      digest.push(
        `**${caseRecord.title ?? caseDir}**: nothing new since ${since} (${watch.queries.length} queries).`,
      );
      continue;
    }

    // Optional, clearly-labeled AI relevance notes. Failure or no key just
    // means no note — discovery never depends on the LLM.
    if (provider) {
      for (const item of newItems.slice(0, MAX_RELEVANCE_NOTES_PER_CASE)) {
        try {
          item.aiRelevanceNote = {
            label: "AI-generated relevance draft — not a human judgment",
            model: `${provider.name}/${provider.model}`,
            promptVersion: PROMPT_VERSION,
            note: await relevanceNote(provider, caseRecord, item),
          };
        } catch (err) {
          errors.push(`${caseDir} relevance note: ${String(err)}`);
          break;
        }
      }
    }

    perCaseOutputs.push({
      caseDir,
      record: {
        kind: "literature-watch-proposals",
        case: caseDir,
        runId,
        date: today,
        window: { since, queries: watch.queries.map((q) => q.id) },
        note:
          "DISCOVERY ONLY. Items are exactly as returned by the APIs named in " +
          "foundVia — nothing verified, nothing added to sources.yaml. A human " +
          "(or the inbox pipeline, via a link-list drop) promotes an item into " +
          "a real source record after checking it. See docs/MAINTENANCE.md.",
        verification: "unverified",
        items: newItems.map((i) => ({ ...i, verification: "unverified" })),
      },
    });

    const withNotes = newItems.filter((i) => i.aiRelevanceNote).length;
    digest.push(
      `**${caseRecord.title ?? caseDir}**: ${newItems.length} new item(s) since ${since} — ` +
        newItems
          .slice(0, 3)
          .map((i) => `“${i.title}” (${i.venue ?? i.foundVia}${i.date ? `, ${i.date}` : ""})`)
          .join("; ") +
        (newItems.length > 3 ? `; +${newItems.length - 3} more` : "") +
        (withNotes ? `. ${withNotes} carry AI-drafted relevance notes.` : "."),
    );

    // Cursor + seen update (written below, only on a real run).
    state.cases[caseDir] = {
      lastRun: today,
      seen: [
        ...caseState.seen,
        ...newItems.flatMap((i) => itemKeys(i)),
      ],
    };
  }

  const report = [
    `# Literature watch ${runId}`,
    "",
    `Searched ${caseDirs.length} case(s) with watch queries on ${today}.`,
    "",
    "## New literature surfaced",
    "",
    ...digest.map((d) => `- ${d}`),
    "",
    ...(errors.length
      ? ["## Degraded lookups (non-fatal)", "", ...errors.map((e) => `- ${e}`), ""]
      : []),
    "## Ground rules",
    "",
    "- Discovery only: every item is `unverified`, recorded exactly as the API returned it; nothing touched sources.yaml or evidence.yaml.",
    "- Relevance notes, where present, are AI-generated drafts and labeled as such.",
    "- To promote an item: drop its DOI/URL as an inbox link list (`inbox/<case>/…`), or ask the maintainer agent to verify and import it.",
    `- Fully revertable: delete \`proposals/watch/${runId}/\` and the matching \`seen\`/\`lastRun\` entries in \`proposals/watch/state.yaml\`.`,
    "",
  ].join("\n");

  if (perCaseOutputs.length === 0) {
    console.error(report);
    console.log("nothing new — no unseen literature matched any watch query");
    return;
  }

  if (dryRun) {
    console.log(report);
    console.log("(dry run: nothing written)");
    return;
  }

  const outDir = path.join(ROOT, "proposals", "watch", runId);
  fs.mkdirSync(outDir, { recursive: true });
  for (const { caseDir, record } of perCaseOutputs) {
    fs.writeFileSync(path.join(outDir, `${caseDir}.yaml`), stringifyYaml(record));
  }
  fs.writeFileSync(path.join(outDir, "report.md"), report);
  fs.writeFileSync(
    path.join(outDir, "run.yaml"),
    stringifyYaml({
      runId,
      date: today,
      cases: Object.fromEntries(
        perCaseOutputs.map(({ caseDir, record }) => [
          caseDir,
          { newItems: record.items.length, window: record.window },
        ]),
      ),
      model: provider ? `${provider.name}/${provider.model}` : null,
      promptVersions: provider ? [PROMPT_VERSION] : [],
      errors,
      note:
        "Discovery-only proposal run. A human reviews; promotion to " +
        "sources.yaml goes through verification (inbox link list or agent).",
    }),
  );
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(
    STATE_FILE,
    [
      "# Literature-watch cursor + dedup state. Machine-maintained by",
      "# scripts/watch-literature.mjs; lives under proposals/ so weekly runs",
      "# stay in the low-risk allowlist. Safe to delete (next run falls back",
      `# to the ${DEFAULT_FIRST_RUN_DAYS}-day first-run window and re-dedups against sources.yaml).`,
      stringifyYaml(state),
    ].join("\n"),
  );

  console.error(
    `\nrun ${runId}: ${perCaseOutputs.length} case(s) with new literature → ${path.relative(ROOT, outDir)}/`,
  );
  console.log(path.relative(ROOT, outDir));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
