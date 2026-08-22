import {
  assessmentFamily,
  assessmentLabels,
  type AssessmentState,
} from "@/src/domain/schema";

const familyClasses: Record<string, string> = {
  supported: "text-verdigris border-verdigris/40 bg-verdigris/8",
  contested: "text-ochre border-ochre/40 bg-ochre/8",
  against: "text-terracotta border-terracotta/40 bg-terracotta/8",
  open: "text-slate-mist border-slate-mist/40 bg-slate-mist/8",
};

export function AssessmentBadge({
  state,
  size = "sm",
}: {
  state: AssessmentState;
  size?: "sm" | "lg";
}) {
  const family = assessmentFamily(state);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xs border font-mono uppercase tracking-[0.12em] ${familyClasses[family]} ${
        size === "lg" ? "px-2.5 py-1 text-[12px]" : "px-1.5 py-0.5 text-[10px]"
      }`}
    >
      <span className="inline-block size-1.5 rounded-full bg-current" />
      {assessmentLabels[state]}
    </span>
  );
}
