import {
  researchPriorityLabels,
  type ResearchPriorityLevel,
} from "@/src/domain/schema";

const levelClasses: Record<ResearchPriorityLevel, string> = {
  high: "text-copper border-copper/50 bg-copper/8",
  medium: "text-ink-soft border-line bg-paper-deep/60",
  low: "text-faint border-line bg-paper",
};

/** On the dossier register the chip is drawn on the dark ground, not as a paper chip laid on it. */
const darkLevelClasses: Record<ResearchPriorityLevel, string> = {
  high: "text-copper border-copper/50 bg-copper/10",
  medium: "text-dossier-text/85 border-dossier-line bg-dossier-soft",
  low: "text-dossier-faint border-dossier-line",
};

/**
 * The case's second output: how valuable resolving the uncertainty would
 * be — independent of how well supported the thesis currently is. "Weak
 * evidence, strong reason to investigate" is a first-class state.
 */
export function PriorityBadge({
  level,
  size = "sm",
  dark = false,
}: {
  level: ResearchPriorityLevel;
  size?: "sm" | "lg";
  /** On the dossier register. */
  dark?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xs border font-mono uppercase tracking-[0.12em] ${(dark ? darkLevelClasses : levelClasses)[level]} ${
        size === "lg" ? "px-2.5 py-1 text-[12px]" : "px-1.5 py-0.5 text-[10px]"
      }`}
    >
      <span aria-hidden>◆</span>
      {researchPriorityLabels[level]}
    </span>
  );
}
