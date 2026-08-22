import { directionLabels, type EvidenceDirection } from "@/src/domain/schema";

const classes: Record<EvidenceDirection, string> = {
  supports: "text-verdigris",
  undermines: "text-terracotta",
  qualifies: "text-ochre",
  context: "text-slate-mist",
};

const glyphs: Record<EvidenceDirection, string> = {
  supports: "▲",
  undermines: "▼",
  qualifies: "◆",
  context: "○",
};

export function DirectionTag({
  direction,
  strength,
}: {
  direction: EvidenceDirection;
  strength?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] ${classes[direction]}`}
    >
      <span aria-hidden>{glyphs[direction]}</span>
      {directionLabels[direction]}
      {strength ? <span className="text-faint">· {strength}</span> : null}
    </span>
  );
}
