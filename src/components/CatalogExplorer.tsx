"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { rungLabels } from "@/src/domain/schema";
import type { ClaimView } from "@/src/domain/view";

function CatalogRow({ claim }: { claim: ClaimView["claim"] }) {
  return (
    <Link
      href={`/claims/${claim.id}/`}
      className="group block border border-line bg-paper px-4 py-3 hover:border-copper/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-copper">
          {claim.id}
          <span className="text-faint"> · {claim.origin.ref}</span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
          {rungLabels[claim.rung]}
        </span>
      </div>
      <p className="mt-1.5 text-[14px] leading-snug text-ink">
        {claim.statement}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ProvenanceBadge state={claim.reviewState} />
        {claim.sourceAnchor ? (
          <span className="font-mono text-[10px] tracking-[0.12em] text-faint">
            {claim.sourceAnchor.locator}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * The ledger's backlog: every live claim the current edition does not
 * feature, grouped by theme (collapsed, with counts) with client-side
 * search. Deliberately quieter than the featured set — a backlog, not a
 * flat feed.
 */
export function CatalogExplorer({
  claims,
  themes,
}: {
  claims: ClaimView[];
  themes: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      q.length === 0
        ? claims
        : claims.filter(({ claim: c }) =>
            [
              c.id,
              c.statement,
              c.origin.ref,
              c.sourceAnchor?.locator ?? "",
              c.sourceAnchor?.quote ?? "",
            ]
              .join(" ")
              .toLowerCase()
              .includes(q),
          ),
    [claims, q],
  );

  const groups = Object.entries(themes)
    .map(([key, label]) => ({
      key,
      label,
      claims: filtered.filter((c) => c.claim.theme === key),
      total: claims.filter((c) => c.claim.theme === key).length,
    }))
    .filter((g) => g.total > 0);

  return (
    <div>
      <label className="block max-w-md">
        <span className="sr-only">Search the catalog</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${claims.length} catalog claims…`}
          className="w-full border border-line bg-paper px-3 py-2 text-[14px] text-ink placeholder:text-faint focus:border-copper/60 focus:outline-none"
        />
      </label>
      {q.length > 0 ? (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
          {filtered.length} match{filtered.length === 1 ? "" : "es"}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {groups.map((g) => (
          <details
            key={g.key}
            className="group border border-line bg-paper"
            open={q.length > 0 && g.claims.length > 0}
          >
            <summary className="cursor-pointer list-none p-4 flex items-baseline justify-between gap-3">
              <span className="font-serif text-lg">{g.label}</span>
              <span className="font-mono text-[11px] tracking-[0.14em] text-faint">
                {q.length > 0 ? `${g.claims.length} of ${g.total}` : g.total}{" "}
                <span className="inline-block transition-transform group-open:rotate-90">
                  ▸
                </span>
              </span>
            </summary>
            <div className="px-4 pb-4 grid lg:grid-cols-2 gap-2.5">
              {g.claims.length > 0 ? (
                g.claims.map((c) => <CatalogRow key={c.claim.id} claim={c.claim} />)
              ) : (
                <p className="text-[13px] text-faint italic font-serif">
                  No matches in this theme.
                </p>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
