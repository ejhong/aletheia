import { stringify } from "yaml";

/** A question is sufficient to start. It supplies no evidence or judgment.
 * @param {{id: string, slug: string, title: string, question: string, domain: string, date: string}} input
 */
export function topicSeed(input) {
  if (!/^[A-Z]+-\d{3}$/.test(input.id))
    throw new Error("id must look like GEO-001");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug))
    throw new Error("slug must be lowercase words separated by hyphens");
  for (const key of ["title", "question", "domain"]) {
    if (!input[key]?.trim() || /[\r\n]/.test(input[key]))
      throw new Error(`${key} must be a non-empty single line`);
  }
  const record = {
    id: input.id,
    slug: input.slug,
    title: input.title,
    subtitle: input.question,
    domain: input.domain,
    status: "incubating",
    summary: input.question,
    whatIsClaimed: input.question,
    whereDisagreementLives: "Competing explanations have not yet been mapped.",
    whatWouldSettleIt:
      "Define the question, find its primary sources, and specify observations that could distinguish competing explanations.",
    bestConventionalExplanation: "",
    researchPriority: null,
    components: [],
    themes: {},
    editors: [],
    lastReviewed: null,
  };
  return {
    "case.yaml": stringify(record),
    "overview.md": `This investigation begins with a question. No claims, sources, or evidence have been recorded yet, and no assessment has been made.\n\n## Where to begin\n\nMake the question precise enough that an observation could change the answer. Map the serious competing explanations, then seek their original sources and strongest counterexamples.\n\nAn interesting possibility is a reason to investigate. The first edition will take shape as there is evidence to explain.\n`,
    "claims.yaml": "[]\n",
    "evidence.yaml": "[]\n",
    "sources.yaml": "[]\n",
    "research.yaml": "[]\n",
    "history.yaml": stringify([
      {
        date: input.date,
        change: "Opened an unassessed research question.",
        reason:
          "A topic seed establishes scope; claims and evidence must be recorded before assessment.",
        actor: "Aletheia topic scaffold",
        aiAssisted: true,
        kind: "content",
      },
    ]),
  };
}
