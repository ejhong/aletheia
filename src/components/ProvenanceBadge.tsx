import { reviewStateLabels, type ReviewState } from "@/src/domain/schema";

const classes: Record<ReviewState, string> = {
  ai_extracted: "text-copper border-copper/40",
  human_reviewed: "text-verdigris border-verdigris/40",
  disputed: "text-ochre border-ochre/40",
  rejected: "text-faint border-line line-through",
};

/** Honest provenance: who has actually checked this record. */
export function ProvenanceBadge({
  state,
  detail,
}: {
  state: ReviewState;
  detail?: string;
}) {
  return (
    <span
      title={detail}
      className={`inline-flex items-center rounded-xs border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${classes[state]}`}
    >
      {reviewStateLabels[state]}
    </span>
  );
}
