/**
 * Parse a pre-blob arbiter comment (the markdown-only format the first
 * arbiter version posted) into the harvest record shape. The current
 * arbiter embeds a machine blob; this parser exists so the dry period's
 * first verdicts — the most historically interesting ones — are not lost
 * to a format change. Fail-closed: returns null rather than a partial
 * record.
 */
export function parseLegacyArbiterComment(body) {
  const verdict = body.includes("✅ PASS")
    ? "pass"
    : body.includes("🅿️ PARKED")
      ? "park"
      : null;
  if (!verdict) return null;
  const reason = body.match(/\*\*(.+?)\.\*\*/)?.[1] ?? null;
  const judgedAgainst = body.match(/judged against `AGENTS\.md` at `([0-9a-f]+)`/)?.[1] ?? null;
  const promptVersion = body.match(/Panel \(([a-z0-9-]+),/)?.[1] ?? null;
  if (!reason || !judgedAgainst || !promptVersion) return null;
  const seats = [];
  const rows = body.matchAll(/^\| (?!Seat)([^|]+) \| (complies|violates|unsure) \| ([^|]*) \|$/gm);
  for (const r of rows) {
    seats.push({
      seat: r[1].trim(),
      vote: r[2],
      rules: r[3].trim() === "—" ? [] : r[3].split(",").map((x) => x.trim()).filter(Boolean),
      reasoning: "(reasoning in the PR comment; pre-blob format)",
    });
  }
  // Details blocks carry the reasoning; match them back to seats by name.
  for (const d of body.matchAll(/<details><summary><b>(.+?)<\/b>[\s\S]*?<\/summary>\n\n([\s\S]*?)\n\n<\/details>/g)) {
    const seat = seats.find((s) => s.seat === d[1]);
    if (seat) seat.reasoning = d[2].trim();
  }
  if (seats.length === 0) return null;
  return { verdict, reason, judgedAgainst, promptVersion, seats };
}

/**
 * A review note's title, as scripts/review-notes.mjs writes it:
 * "Review note on #223 — GPT-5.6 Sol (OpenAI): §3.15, §3.8 (provenance)".
 * Returns null for a title in another shape — never a guessed record.
 */
export function parseReviewNoteTitle(title) {
  const m = String(title).match(/^Review note on #(\d+) — (.+?): (.+?)(?: \(([a-z-]+)\))?$/);
  if (!m) return null;
  return { pr: Number(m[1]), seat: m[2].trim(), rules: m[3].split(",").map((x) => x.trim()).filter(Boolean), paradigm: m[4] ?? null };
}

/**
 * The answer on the record among an issue's comments: the last one by a
 * recognized answerer (the founder's login, the maintenance bot) — never
 * a passer-by's remark, never closure. Null when none was written.
 */
export function answerFrom(comments, answerers) {
  const set = new Set((answerers ?? []).map((a) => String(a).toLowerCase()));
  const mine = (comments ?? []).filter((c) => set.has(String(c.user?.login ?? "").toLowerCase()));
  const last = mine.at(-1);
  if (!last) return null;
  return { by: last.user.login, at: String(last.created_at ?? "").slice(0, 10), excerpt: String(last.body ?? "").replace(/\s+/g, " ").trim().slice(0, 300), url: last.html_url };
}

/** `gh api --paginate` prints one JSON array per page; join them into one. */
export function joinPages(text) {
  const t = String(text ?? "").trim();
  if (!t) return [];
  return JSON.parse("[" + t.replace(/\]\s*\[/g, ",").replace(/^\[|\]$/g, "") + "]");
}
