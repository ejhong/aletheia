"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { FeaturedClaimView } from "@/src/domain/caseView";
import { AssessmentBadge } from "./AssessmentBadge";
import { ProvenanceBadge } from "./ProvenanceBadge";

export interface ClaimEvidencePreview {
  claimId: string;
  evidenceId: string;
  direction: string;
  statement: string;
  sourceId: string;
  sourceTitle: string;
  sourceVerification: string;
  locator: string | null;
}

/** Progressive enhancement: every reference remains a real link without JS.
 * One native dialog owns focus, Escape, and dismissal for the entire essay.
 */
export function ArticleReader({
  children,
  claims,
  evidence,
}: {
  children: ReactNode;
  claims: FeaturedClaimView[];
  evidence: ClaimEvidencePreview[];
}) {
  const [selected, setSelected] = useState<FeaturedClaimView | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!selected || !element) return;
    const closed = () => {
      setSelected(null);
      trigger.current?.focus();
    };
    // Listen to the native lifecycle, including Escape. A closed dialog
    // must also clear selection so the same claim can be opened again.
    element.addEventListener("close", closed);
    element.showModal();
    return () => {
      element.removeEventListener("close", closed);
      if (element.open) element.close();
    };
  }, [selected]);

  function inspect(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      "a[data-claim-id]",
    );
    const claim = claims.find((c) => c.id === link?.dataset.claimId);
    if (!link || !claim) return;
    event.preventDefault();
    trigger.current = link;
    setSelected(claim);
  }

  return (
    <div onClickCapture={inspect}>
      {children}
      {selected &&
        createPortal(
          <dialog
            ref={dialog}
            aria-labelledby="inspected-claim-title"
            className="claim-dialog"
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const controls =
                event.currentTarget.querySelectorAll<HTMLElement>(
                  "button, a[href]",
                );
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
            onClick={(event) => {
              if (event.target !== event.currentTarget) return;
              const r = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < r.left ||
                event.clientX > r.right ||
                event.clientY < r.top ||
                event.clientY > r.bottom
              )
                dialog.current?.close();
            }}
          >
            <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
              <span className="font-mono text-[11px] tracking-[0.14em] text-copper">
                {selected.id}
              </span>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="px-3 py-2 text-[13px] text-ink-soft hover:text-copper"
                autoFocus
              >
                Back to the essay <span aria-hidden>×</span>
              </button>
            </div>
            <h2
              id="inspected-claim-title"
              className="mt-5 font-serif text-2xl leading-snug"
            >
              {selected.statement}
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <AssessmentBadge state={selected.credibility} />
              <ProvenanceBadge state={selected.reviewState} />
            </div>
            <p className="mt-2 text-[12px] text-faint">
              {selected.assessment
                ? `AI assessment · ${selected.assessment.date} · ${selected.assessment.standing}`
                : "Assessment recorded with the claim; absent from the current draft"}
            </p>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
              {selected.credibilitySummary}
            </p>
            <div className="mt-5 border-l-2 border-copper/50 pl-4">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-copper">
                What this does — and does not — establish
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                {selected.diagnosticitySummary}
              </p>
              <p className="mt-2 text-[11px] text-faint">
                Interpretation recorded with the claim.
              </p>
            </div>
            <div className="mt-5 space-y-4">
              {evidence
                .filter((e) => e.claimId === selected.id)
                .map((e) => (
                  <div key={e.evidenceId} className="border-t border-line pt-4">
                    <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                      {e.direction} · recorded source observation
                    </h3>
                    <p className="mt-2 text-[14px] leading-relaxed">
                      {e.statement}
                    </p>
                    <Link
                      href={`/sources/${e.sourceId}/`}
                      className="mt-2 block text-[12px] text-copper underline underline-offset-2"
                    >
                      {e.sourceTitle}
                      {e.locator
                        ? ` · ${e.locator}`
                        : " · locator not recorded"}
                    </Link>
                    <p className="mt-1 text-[11px] text-faint">
                      Source verification:{" "}
                      {e.sourceVerification.replaceAll("_", " ")}
                    </p>
                  </div>
                ))}
            </div>
            <Link
              href={`/claims/${selected.id}/`}
              className="mt-6 block border-t border-line pt-4 text-[14px] text-copper underline underline-offset-4"
            >
              Open the full claim, evidence, and history →
            </Link>
          </dialog>,
          document.body,
        )}
    </div>
  );
}
