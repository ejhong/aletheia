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
    const update = () => {
      ticking = false;
      let current: string | null = null;
      for (const [id] of sections) {
        const el = document.getElementById(id);
        // The nav is ~44px tall; a section is "current" once its top passes
        // just below the stuck nav.
        if (el && el.getBoundingClientRect().top <= 96) current = id;
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
    <nav className="border-b border-line bg-paper sticky top-0 z-10">
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
          <Link
            href={`/cases/${slug}/claims/`}
            className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-copper ml-auto"
          >
            all claims →
          </Link>
        </div>
      </div>
    </nav>
  );
}
