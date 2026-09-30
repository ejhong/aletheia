import { AssessmentBadge } from "./AssessmentBadge";
import type { CaseComponent } from "@/src/domain/schema";
import { withoutIdList } from "@/src/domain/text";

/**
 * Component verdicts: the separable parts of a case question, each with
 * its own state — shown wherever a single word would lie by compression.
 * `dark` renders on the dossier register.
 */
export function ComponentVerdicts({
  components,
  dark = false,
}: {
  components: CaseComponent[];
  dark?: boolean;
}) {
  if (components.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {components.map((c) => (
        <li
          key={c.label}
          className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5"
          title={c.note}
        >
          <AssessmentBadge state={c.state} />
          <span
            className={`text-[13px] ${dark ? "text-dossier-text/90" : "text-ink-soft"}`}
          >
            {/* An assessment sometimes closes a label with the ids of the claims behind it; here they lead nowhere, and the ladder below names them. */}
            {withoutIdList(c.label)}
          </span>
        </li>
      ))}
    </ul>
  );
}
