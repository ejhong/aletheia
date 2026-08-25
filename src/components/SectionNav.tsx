"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Sticky case-page section navigator with a light scroll-spy: the section
 * currently under the reading line gets the copper accent. Labels are bold
 * so the navigator reads as a fixture, not a whisper.
 */
export function SectionNav({
  sections,
  slug,
}: {
  sections: ReadonlyArray<readonly [string, string]>;
  slug: string;
}) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let ticking = false;
    const stickyOffset = () => {
      const header = document.querySelector("header");
      const nav = document.getElementById("case-section-nav");
      return (header?.offsetHeight ?? 64) + (nav?.offsetHeight ?? 44);
    };
    const update = () => {
      ticking = false;
      let current: string | null = null;
      const threshold = stickyOffset();
      for (const [id] of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= threshold) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  return (
    <nav
      id="case-section-nav"
      className="border-b border-line bg-paper sticky top-16 z-10"
    >
      <div className="mx-auto max-w-6xl px-5 overflow-x-auto">
        <div className="flex gap-6 py-3 whitespace-nowrap">
          {sections.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? "location" : undefined}
              className={`font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                active === id
                  ? "text-copper underline decoration-copper/60 underline-offset-8"
                  : "text-ink-soft hover:text-copper"
              }`}
            >
              {label}
            </a>
          ))}
          <span className="ml-auto flex gap-6">
            <Link
              href={`/cases/${slug}/resources/`}
              className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-copper"
            >
              resources →
            </Link>
            <Link
              href={`/cases/${slug}/evidence/`}
              className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-copper"
            >
              all evidence →
            </Link>
            <Link
              href={`/cases/${slug}/claims/`}
              className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-copper"
            >
              all claims →
            </Link>
          </span>
        </div>
      </div>
    </nav>
  );
}
