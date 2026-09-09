/**
 * The accounts the current edition sets side by side — the map of the
 * controversy in one glance. The article treats each at length; the
 * verifier reads relevance against them.
 */
export function AccountsList({ accounts, editionDate }: { accounts: string[]; editionDate: string }) {
  if (accounts.length === 0) return null;
  return (
    <section id="accounts" className="mt-6 scroll-mt-28">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-copper">
        {accounts.length} accounts, side by side · the edition of {editionDate}
      </h3>
      <ol className="mt-2 grid gap-2 sm:grid-cols-3">
        {accounts.map((a, i) => (
          <li key={i} className="border border-line bg-paper px-4 py-3 text-[13.5px] leading-[1.6] text-ink-soft">
            <span className="font-mono text-[10px] text-faint mr-2">{i + 1}</span>
            {a}
          </li>
        ))}
      </ol>
    </section>
  );
}
