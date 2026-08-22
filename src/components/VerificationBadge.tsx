import {
  sourceVerificationLabels,
  type SourceVerification,
} from "@/src/domain/schema";

const classes: Record<SourceVerification, string> = {
  verified: "text-verdigris border-verdigris/40",
  ai_verified: "text-copper border-copper/40",
  unverified: "text-ochre border-ochre/40",
  placeholder: "text-faint border-line",
};

export function VerificationBadge({ state }: { state: SourceVerification }) {
  return (
    <span
      className={`inline-flex items-center rounded-xs border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${classes[state]}`}
    >
      {sourceVerificationLabels[state]}
    </span>
  );
}
