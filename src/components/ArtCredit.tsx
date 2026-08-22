/**
 * The honest label that accompanies every piece of AI-generated editorial
 * artwork. Never omitted; never used on real photography.
 */
export function ArtCredit({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-mono text-[9px] uppercase tracking-[0.16em] text-faint ${className}`}
    >
      AI-generated editorial artwork
    </span>
  );
}
