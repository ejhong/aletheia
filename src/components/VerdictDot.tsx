import {
  assessmentFamily,
  assessmentLabels,
  type AssessmentState,
} from "@/src/domain/schema";

const familyDot: Record<string, string> = {
  supported: "bg-verdigris",
  contested: "bg-ochre",
  against: "bg-terracotta",
  open: "bg-faint",
};

/**
 * One seat's verdict as a small colored dot (hollow ring = the house
 * draft's verdict). The dissent gallery and standings board are built
 * from these — five dots on a line say more, faster, than five badges.
 */
export function VerdictDot({
  state,
  hollow = false,
  label,
}: {
  state: AssessmentState;
  hollow?: boolean;
  label: string;
}) {
  const family = assessmentFamily(state);
  return (
    <span
      title={`${label}: ${assessmentLabels[state]}`}
      className={
        hollow
          ? `inline-block size-3 rounded-full border-2 ${familyDot[family].replace("bg-", "border-")} bg-transparent`
          : `inline-block size-3 rounded-full ${familyDot[family]}`
      }
    />
  );
}
