/**
 * Mechanical citation verification for the constitutional arbiter.
 *
 * Panel seats judge a diff against the constitution but cannot browse, so
 * an honest seat facing citation-heavy content had to vote "unsure" —
 * parking the PR regardless of quality. This module separates the
 * mechanical question (does the identifier resolve, and to what?) from the
 * editorial one (is it used honestly?): the arbiter runs it over the
 * content lines a PR adds and feeds the results to the seats as tool
 * output, so "unsure because unverifiable" stops masquerading as
 * editorial doubt.
 *
 * Scope, deliberately narrow:
 *   - only ADDED lines in files under content/ are scanned;
 *   - only resolvable identifier kinds are checked (DOI via Crossref with
 *     a doi.org fallback, arXiv via its API, plain URLs via HTTP) —
 *     quotations and page-level locators remain the seats' judgment;
 *   - verification INFORMS votes, it never gates: any tooling failure
 *     reports itself as "unchecked" rather than failing the arbiter run.
 */

const MAX_CHECKED = 40;
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Strip punctuation that sentence context glues onto an identifier —
 * without amputating the identifier itself. DOIs legally contain
 * parentheses, and two common families always do (Elsevier's S-prefix
 * journals: 10.1016/S0140-6736(20)30183-5; ASCE:
 * 10.1061/(ASCE)0733-9399(2002)128:1(2)), so a trailing `)` is only
 * sentence punctuation when it has no matching `(` earlier in the
 * identifier. Getting this wrong is not cosmetic: a truncated DOI fails
 * to resolve, and a FAILS line is presented to the seats as positive
 * evidence of a fabricated citation — a correct source parks the PR.
 */
const trimTrailing = (s) => {
  for (;;) {
    if (/[.,;:\]}>"']$/.test(s)) {
      s = s.slice(0, -1);
    } else if (
      s.endsWith(")") &&
      (s.match(/\)/g)?.length ?? 0) > (s.match(/\(/g)?.length ?? 0)
    ) {
      s = s.slice(0, -1); // unbalanced — from `(see 10.1234/foo)`, not the DOI
    } else {
      return s;
    }
  }
};

/**
 * Extract citation identifiers from a unified diff: added lines only,
 * content/ files only, deduplicated, classified as doi | arxiv | url.
 * doi.org and arxiv.org URLs are classified as their identifier kind so
 * each citation is checked once, by the strongest available method.
 */
export function extractCitations(rawDiff) {
  const found = new Map(); // key: `${kind} ${id}`
  let inContentFile = false;
  for (const line of rawDiff.split("\n")) {
    if (line.startsWith("+++ ")) {
      inContentFile = /^\+\+\+ [ab]\/content\//.test(line);
      continue;
    }
    if (!inContentFile || !line.startsWith("+") || line.startsWith("+++"))
      continue;
    const add = (kind, id) => {
      if (id) found.set(`${kind} ${id}`, { kind, id });
    };
    // `)` is deliberately NOT a terminator in either pattern — DOIs (and
    // URLs built from them) contain balanced parens; trimTrailing drops
    // only the unbalanced ones that markdown links and prose add.
    for (const m of line.matchAll(/\bhttps?:\/\/[^\s"'`<>\]]+/g)) {
      const url = trimTrailing(m[0]);
      const doi = url.match(/doi\.org\/(10\.\d{4,9}\/\S+)/);
      const arxiv = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?/i);
      if (doi) add("doi", trimTrailing(doi[1]));
      else if (arxiv) add("arxiv", arxiv[1]);
      else add("url", url);
    }
    for (const m of line.matchAll(/\b10\.\d{4,9}\/[^\s"'`<>\]]+/g)) {
      add("doi", trimTrailing(m[0]));
    }
    for (const m of line.matchAll(/\barxiv[:\s]*(\d{4}\.\d{4,5})(?:v\d+)?/gi)) {
      add("arxiv", m[1]);
    }
  }
  return [...found.values()];
}

async function timedFetch(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

/** One-line summary of what a resolved identifier points at. */
const describe = (title, year) =>
  [title && `"${String(title).slice(0, 120)}"`, year].filter(Boolean).join(", ");

async function checkDoi(id) {
  try {
    const res = await timedFetch(
      `https://api.crossref.org/works/${encodeURIComponent(id)}`,
    );
    if (res.ok) {
      const work = (await res.json()).message ?? {};
      const title = Array.isArray(work.title) ? work.title[0] : work.title;
      const year = work.issued?.["date-parts"]?.[0]?.[0];
      return { status: "resolves", note: `Crossref: ${describe(title, year)}` };
    }
    // Not in Crossref ≠ unregistered (DataCite etc.) — ask doi.org itself.
    const fallback = await timedFetch(`https://doi.org/${encodeURIComponent(id)}`, {
      method: "HEAD",
      redirect: "manual",
    });
    if (fallback.status >= 300 && fallback.status < 400)
      return { status: "resolves", note: "registered at doi.org (not in Crossref)" };
    return { status: "fails", note: `doi.org HTTP ${fallback.status}` };
  } catch (err) {
    return { status: "unchecked", note: `lookup failed: ${String(err.message).slice(0, 80)}` };
  }
}

async function checkArxiv(id) {
  try {
    const res = await timedFetch(
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`,
    );
    if (!res.ok) return { status: "unchecked", note: `arXiv API HTTP ${res.status}` };
    const atom = await res.text();
    // A real id returns an <entry> with a <published> date; a bad id
    // returns an error entry without one.
    if (atom.includes("<published>")) {
      const title = atom.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/)?.[1]?.trim();
      return { status: "resolves", note: `arXiv: ${describe(title)}` };
    }
    return { status: "fails", note: "no such arXiv id" };
  } catch (err) {
    return { status: "unchecked", note: `lookup failed: ${String(err.message).slice(0, 80)}` };
  }
}

async function checkUrl(url) {
  try {
    let res = await timedFetch(url, { method: "HEAD" });
    // Some hosts reject HEAD; a GET answers the only question we ask.
    if (res.status === 405 || res.status === 501 || res.status === 403)
      res = await timedFetch(url, { method: "GET" });
    return res.ok
      ? { status: "resolves", note: `HTTP ${res.status}` }
      : { status: "fails", note: `HTTP ${res.status}` };
  } catch (err) {
    return { status: "fails", note: `unreachable: ${String(err.message).slice(0, 80)}` };
  }
}

const CHECKERS = { doi: checkDoi, arxiv: checkArxiv, url: checkUrl };

/**
 * Verify every extracted citation (capped, in parallel). Returns
 * [{kind, id, status: resolves|fails|unchecked, note}]; items beyond the
 * cap are reported as unchecked rather than silently dropped.
 */
export async function verifyCitations(citations, checkers = CHECKERS) {
  const checked = citations.slice(0, MAX_CHECKED);
  const results = await Promise.all(
    checked.map(async (c) => ({ ...c, ...(await checkers[c.kind](c.id)) })),
  );
  for (const c of citations.slice(MAX_CHECKED)) {
    results.push({ ...c, status: "unchecked", note: `over the ${MAX_CHECKED}-item budget` });
  }
  return results;
}

/**
 * The packet section shown to the seats. Trusted tool output — but the
 * notes echo external metadata (titles), so seats still treat every quoted
 * string as data, never as instructions.
 */
export function formatVerificationSection(results) {
  if (results.length === 0)
    return "(no citation identifiers found in the added content lines)";
  const mark = { resolves: "RESOLVES", fails: "FAILS", unchecked: "UNCHECKED" };
  return results
    .map((r) => `${r.kind} ${r.id} — ${mark[r.status]} (${r.note})`)
    .join("\n");
}

/** One-line tally for the human report. */
export function verificationSummary(results) {
  const n = (s) => results.filter((r) => r.status === s).length;
  return `${results.length} citation identifier(s) checked mechanically: ${n("resolves")} resolve, ${n("fails")} fail, ${n("unchecked")} unchecked`;
}
