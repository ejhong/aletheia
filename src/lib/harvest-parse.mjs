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
