/**
 * Agenda generation (maintenance, weekly): the generative question the
 * pipeline never asked — "given what this ledger now shows, what claim,
 * research item, or study should exist that doesn't?"
 *
 * Proposals only, never content: output lands under proposals/agenda/
 * (low-risk by construction — reversible, never touches published
 * records) and becomes real only if adopted through the normal gates
 * (founder judgment, freeze discipline, classifier, arbiter). The model
 * proposes; the gates decide. Taste stays human: the validator can check
 * that a proposal is well-formed and anchored, not that it is
 * interesting.
 */

export const PROPOSAL_KINDS = ["claim", "research-item", "study"];
export const EFFORT_TIERS = ["desk", "records", "lab", "analysis"];

export const PROPOSAL_SYSTEM = `You generate research-agenda PROPOSALS for one case of an AI-operated
evidence publication. You will receive the case's claims, research
agenda, studies, and recent evidence. Propose AT MOST three genuinely
new items the ledger implies but does not contain: a new atomic claim
(one proposition, clear truth condition), a new research item (a
specific obtainable record, test, or analysis), or a new study (a
frozen-criteria comparison or literature table answerable at a desk).

Hard rules: never propose grading anyone's guilt or state of mind;
never propose anything an existing item already covers — you must name
the closest existing IDs and say precisely what they miss; prefer
proposals with a decisive record or a computable table behind them;
zero proposals is a fine answer and better than a filler idea.

Reply with JSON only:
{"proposals":[{"kind":"claim|research-item|study",
"title":"...","question":"the proposition or question, with its truth
condition or decisive record","closestExisting":["ID",...],
"gap":"what those IDs miss","wouldSettle":"what finding X would prove
and what finding not-X would prove","effortTier":"desk|records|lab|analysis"}]}`;

/** Compact one-case packet for the proposal call. */
export function buildCasePacket({ claims, research, studies, evidence }) {
  const lines = [];
  lines.push("CLAIMS:");
  for (const c of claims ?? [])
    lines.push(`- ${c.id} [${c.tier ?? "?"}]: ${String(c.statement).slice(0, 220)}`);
  lines.push("\nRESEARCH AGENDA:");
  for (const r of research ?? [])
    lines.push(`- ${r.id} [${r.effortTier ?? "?"}]: ${r.title} — ${String(r.summary ?? "").slice(0, 200)}`);
  lines.push("\nSTUDIES:");
  for (const s of studies ?? []) {
    lines.push(`- ${s.id}: ${s.title} — ${String(s.question ?? "").slice(0, 200)}`);
    for (const f of s.findings ?? [])
      lines.push(`  finding: ${String(f.statement ?? "").slice(0, 200)}`);
  }
  lines.push("\nRECENT EVIDENCE (titles):");
  for (const e of (evidence ?? []).slice(-25))
    lines.push(`- ${e.id} (${e.direction}): ${String(e.title ?? "").slice(0, 160)}`);
  return lines.join("\n");
}

/**
 * Fail-closed validation. Returns only proposals that are well-formed
 * AND anchored to real existing IDs; anything malformed is dropped with
 * a reason so the report can say what the model got wrong.
 */
export function validateProposals(parsed, knownIds) {
  const ok = [];
  const rejected = [];
  const seen = new Set();
  const list = Array.isArray(parsed?.proposals) ? parsed.proposals : null;
  if (!list) return { ok, rejected: [{ reason: "no proposals array" }] };
  for (const p of list.slice(0, 3)) {
    const reason =
      !PROPOSAL_KINDS.includes(p?.kind)
        ? `bad kind: ${p?.kind}`
        : typeof p?.title !== "string" || p.title.length < 8
          ? "missing title"
          : typeof p?.question !== "string" || p.question.length < 20
            ? "missing question/truth condition"
            : typeof p?.gap !== "string" || p.gap.length < 10
              ? "missing gap statement"
              : typeof p?.wouldSettle !== "string" || p.wouldSettle.length < 10
                ? "missing wouldSettle"
                : !EFFORT_TIERS.includes(p?.effortTier)
                  ? `bad effortTier: ${p?.effortTier}`
                  : !Array.isArray(p?.closestExisting) || p.closestExisting.length === 0
                    ? "no closestExisting IDs"
                    : p.closestExisting.some((id) => !knownIds.has(id))
                      ? `dangling existing ID: ${p.closestExisting.find((id) => !knownIds.has(id))}`
                      : seen.has(p.title)
                        ? "duplicate title"
                        : null;
    if (reason) rejected.push({ title: p?.title, reason });
    else {
      seen.add(p.title);
      ok.push(p);
    }
  }
  return { ok, rejected };
}

/** Render one case's accepted proposals as a proposal file body. */
export function renderProposalFile(caseSlug, proposals, { date, runId, model }) {
  const head = [
    `# Agenda proposals — ${caseSlug} — ${date}`,
    "",
    "PROPOSALS ONLY. Nothing below is a claim, grade, or agenda item;",
    "each becomes real only if adopted through the normal gates (founder",
    "judgment, freeze discipline where applicable, classifier, arbiter).",
    `Generated by ${model}, runId ${runId}, under AGENTS.md §3.15.`,
    "",
  ];
  const body = proposals.flatMap((p, i) => [
    `## ${i + 1}. [${p.kind}] ${p.title}`,
    "",
    `**Question / truth condition:** ${p.question}`,
    "",
    `**Closest existing:** ${p.closestExisting.join(", ")} — ${p.gap}`,
    "",
    `**What it would settle:** ${p.wouldSettle}`,
    "",
    `**Effort:** ${p.effortTier}`,
    "",
  ]);
  return head.concat(body).join("\n");
}
