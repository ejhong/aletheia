import type { Pin } from "@/src/domain/schema";

const kindLabels: Record<Pin["kind"], string> = {
  correction: "banked correction",
  directive: "founder directive",
};

/**
 * The case's pinned commitments (docs/AUTOMATION.md): banked corrections
 * and founder directives the presentation must keep honoring, enforced
 * fail-closed at build time. Displayed so readers can see where past
 * mistakes were banked and where editorial emphasis was directed — pins
 * bind presentation, never verdicts.
 */
export function PinnedCommitments({ pins }: { pins: Pin[] }) {
  if (pins.length === 0) return null;
  return (
    <div className="mt-10">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint mb-1">
        pinned commitments
      </h3>
      <p className="text-[13px] text-ink-soft max-w-2xl mb-4">
        Commitments this case&apos;s presentation must keep honoring — the
        residue of past corrections, and directed emphasis, each enforced
        mechanically on every build. Pins bind wording, never verdicts.
      </p>
      <ul className="space-y-3">
        {pins.map((pin) => (
          <li
            key={pin.id}
            className="border border-line bg-paper p-3 sm:p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] tracking-[0.14em] text-faint">
                {pin.id}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-copper">
                {kindLabels[pin.kind]} · {pin.origin.date}
              </span>
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
              {pin.statement}
            </p>
            <p className="mt-2 font-mono text-[10px] tracking-[0.02em] text-faint">
              {pin.origin.attribution} — {pin.origin.ref}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
