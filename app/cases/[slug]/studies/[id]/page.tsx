import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VerificationBadge } from "@/src/components/VerificationBadge";
import { loadAllCases } from "@/src/domain/load";
import { isPendingStudy } from "@/src/domain/studies";
import { PLACEHOLDER_PARAM } from "@/src/domain/staticExport";

/**
 * One page per study — rendered from the freeze PR onward, not only once
 * results exist. A pending study is a visible pre-registration: the
 * anti-file-drawer rule. Frozen criteria render first, so the reader
 * sees what was fixed before data collection.
 */

export function generateStaticParams() {
  const pairs = loadAllCases().flatMap((c) =>
    c.studies.map((s) => ({ slug: c.record.slug, id: s.id.toLowerCase() })),
  );
  return pairs.length > 0
    ? pairs
    : [{ slug: PLACEHOLDER_PARAM, id: PLACEHOLDER_PARAM }];
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  return params.then(({ slug, id }) => {
    const loaded = loadAllCases().find((c) => c.record.slug === slug);
    const study = loaded?.studies.find((s) => s.id.toLowerCase() === id);
    return { title: study ? `Study ${study.id}` : "Not found" };
  });
}

const label = "font-mono text-[11px] uppercase tracking-[0.16em] text-faint";

export default async function StudyPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const loaded = loadAllCases().find((c) => c.record.slug === slug);
  const study = loaded?.studies.find((s) => s.id.toLowerCase() === id);
  if (!loaded || !study) notFound();
  const pending = isPendingStudy(study);
  const supersededBy = loaded.studies.find((s) => s.supersedes === study.id);
  const research = loaded.research.filter((r) =>
    study.researchIds.includes(r.id),
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <p className={label}>
        <Link href={`/cases/${slug}/`} className="text-copper hover:underline">
          {loaded.record.title}
        </Link>{" "}
        · study {study.id}
      </p>
      <h1 className="font-serif text-4xl tracking-tight mt-3">{study.title}</h1>
      <p className="mt-3 text-ink-soft max-w-2xl">{study.question}</p>

      {pending ? (
        <div className="mt-6 border border-copper/50 bg-paper px-5 py-4 max-w-2xl">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.18em] text-copper">
            pre-registered — collection pending since {study.criteria.frozenOn}
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
            The criteria below were frozen before any data was collected.
            Whatever the collected table shows, it publishes here — a
            pre-registration that quietly disappears would be a finding
            suppressed.
          </p>
        </div>
      ) : null}
      {supersededBy ? (
        <div className="mt-6 border border-line bg-paper px-5 py-4 max-w-2xl">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.18em] text-faint">
            superseded by{" "}
            <Link
              href={`/cases/${slug}/studies/${supersededBy.id.toLowerCase()}/`}
              className="text-copper hover:underline"
            >
              {supersededBy.id}
            </Link>
          </p>
        </div>
      ) : null}

      <section className="mt-10 max-w-3xl">
        <h2 className="font-serif text-2xl tracking-tight">
          Frozen criteria
          <span className="ml-3 font-mono text-[11px] tracking-[0.14em] text-faint">
            frozen {study.criteria.frozenOn} · hash{" "}
            {study.criteria.criteriaHash}
          </span>
        </h2>
        <p className="mt-1.5 text-[13.5px] text-ink-soft">
          Fixed before data collection; any later edit fails the site build.
          A correction would be a new study superseding this one.
        </p>
        <div className="mt-4 grid sm:grid-cols-2 gap-6">
          <div>
            <p className={label}>include</p>
            <ul className="mt-2 space-y-1.5 text-[14px] leading-relaxed list-disc pl-4">
              {study.criteria.inclusion.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className={label}>exclude</p>
            <ul className="mt-2 space-y-1.5 text-[14px] leading-relaxed list-disc pl-4">
              {study.criteria.exclusion.map((c) => (
                <li key={c}>{c}</li>
              ))}
              {study.criteria.exclusion.length === 0 ? <li>—</li> : null}
            </ul>
          </div>
        </div>
        <p className={`${label} mt-6`}>search protocol (re-runnable)</p>
        <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-line">
          {study.criteria.searchProtocol}
        </p>
        {study.criteria.knownCandidates.length > 0 ? (
          <>
            <p className={`${label} mt-6`}>
              candidates known at freeze time — dispositions pre-committed
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[13.5px] border border-line">
                <thead>
                  <tr className="bg-paper font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                    <th className="text-left px-3 py-2 border-b border-line">candidate</th>
                    <th className="text-left px-3 py-2 border-b border-line">disposition</th>
                    <th className="text-left px-3 py-2 border-b border-line">reason</th>
                  </tr>
                </thead>
                <tbody>
                  {study.criteria.knownCandidates.map((c) => (
                    <tr key={c.name} className="border-b border-line/60 align-top">
                      <td className="px-3 py-2">{c.name}</td>
                      <td className="px-3 py-2 font-mono text-[12px]">{c.disposition}</td>
                      <td className="px-3 py-2 text-ink-soft">{c.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <section className="mt-10 max-w-3xl">
        <h2 className="font-serif text-2xl tracking-tight">Method</h2>
        <p className="mt-3 text-[14px] leading-relaxed whitespace-pre-line">
          {study.method}
        </p>
      </section>

      {!pending ? (
        <>
          <section className="mt-10">
            <h2 className="font-serif text-2xl tracking-tight">
              The table
              <span className="ml-3 font-mono text-[11px] tracking-[0.14em] text-faint">
                {study.rows.length} row{study.rows.length === 1 ? "" : "s"}
              </span>
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-[13.5px] border border-line">
                <thead>
                  <tr className="bg-paper font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                    {study.columns.map((c) => (
                      <th key={c} className="text-left px-3 py-2 border-b border-line">
                        {c}
                      </th>
                    ))}
                    <th className="text-left px-3 py-2 border-b border-line">source</th>
                  </tr>
                </thead>
                <tbody>
                  {study.rows.map((row, i) => (
                    <tr key={i} className="border-b border-line/60 align-top">
                      {study.columns.map((c) => (
                        <td key={c} className="px-3 py-2">
                          {row.cells[c] ?? "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <span className="text-ink-soft">
                          {row.citation.url ? (
                            <a
                              href={row.citation.url}
                              className="text-copper hover:underline"
                              rel="nofollow noopener"
                            >
                              {row.citation.text}
                            </a>
                          ) : (
                            row.citation.text
                          )}
                          {row.citation.locator ? ` · ${row.citation.locator}` : ""}
                        </span>{" "}
                        <VerificationBadge state={row.citation.verification} />
                        {row.independenceNote ? (
                          <p className="mt-1 text-[12px] text-faint">
                            independence: {row.independenceNote}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10 max-w-3xl">
            <h2 className="font-serif text-2xl tracking-tight">Findings</h2>
            <ul className="mt-3 space-y-3">
              {study.findings.map((f, i) => (
                <li key={i} className="text-[14.5px] leading-relaxed">
                  {f.statement}
                  {f.evidenceId ? (
                    <span className="ml-2 font-mono text-[11px] text-faint">
                      → ledger record {f.evidenceId}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10 max-w-3xl">
            <h2 className="font-serif text-2xl tracking-tight">Limitations</h2>
            <ul className="mt-3 space-y-1.5 text-[14px] leading-relaxed list-disc pl-4">
              {study.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      <section className="mt-12 max-w-3xl border-t border-line pt-6">
        <p className={label}>provenance</p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          AI-authored project work ({study.model}), run {study.runId} on{" "}
          {study.date}, prompt {study.promptVersion}
          {study.humanReviewed ? ", human-reviewed" : " — not human-reviewed"}.
          A study is secondary synthesis of published material under
          criteria frozen in advance; it never grades a claim. Whatever it
          shows enters the case only as ordinary evidence records, judged
          by the independent model panel like everything else.
        </p>
        {research.length > 0 ? (
          <p className="mt-3 text-[13px] text-ink-soft">
            Executes research item{research.length === 1 ? "" : "s"}:{" "}
            {research.map((r, i) => (
              <span key={r.id}>
                {i > 0 ? ", " : ""}
                <Link
                  href={`/cases/${slug}/#research`}
                  className="text-copper hover:underline"
                >
                  {r.id}
                </Link>{" "}
                ({r.title})
              </span>
            ))}
          </p>
        ) : null}
      </section>
    </div>
  );
}
