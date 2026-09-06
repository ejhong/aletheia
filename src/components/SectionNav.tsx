"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** A short reading navigator, with the complete record one disclosure away. */
export function SectionNav({
  sections,
  slug,
  hasStudies = false,
}: {
  sections: ReadonlyArray<readonly [string, string]>;
  slug: string;
  hasStudies?: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const threshold =
        (document.querySelector("header")?.offsetHeight ?? 64) +
        (document.getElementById("case-section-nav")?.offsetHeight ?? 44);
      let current: string | null = null;
      for (const [id] of sections) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= threshold)
          current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [sections]);

  const links = [
    ["claims", "All claims"],
    ["evidence", "Evidence ledger"],
    ["resources", "Sources & reading"],
    ...(hasStudies ? [["studies", "Studies"]] : []),
  ];
  return (
    <nav
      id="case-section-nav"
      aria-label="Case navigation"
      className="sticky top-16 z-10 border-b border-line bg-paper"
    >
      <div className="relative mx-auto flex max-w-6xl items-center gap-5 px-5">
        <div className="flex gap-6 py-3">
          {sections.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? "location" : undefined}
              className={`${id === "article" || id === "research" ? "" : "hidden sm:block"} font-mono text-[11px] font-bold uppercase tracking-[0.12em] ${active === id ? "text-copper underline underline-offset-8" : "text-ink-soft hover:text-copper"}`}
            >
              {label}
            </a>
          ))}
        </div>
        <details
          className="group ml-auto"
          onClick={(event) => {
            if ((event.target as Element).closest("a"))
              event.currentTarget.open = false;
          }}
        >
          <summary className="cursor-pointer list-none py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-copper">
            Explore{" "}
            <span aria-hidden className="inline-block group-open:rotate-180">
              ⌄
            </span>
          </summary>
          <div className="absolute right-5 top-full z-20 w-64 border border-line bg-paper p-2 shadow-lg">
            <div className="border-b border-line pb-2 sm:hidden">
              {sections
                .filter(([id]) => id !== "article" && id !== "research")
                .map(([id, label]) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="block px-3 py-3 text-sm text-ink-soft hover:bg-paper-deep"
                  >
                    {label}
                  </a>
                ))}
            </div>
            {links.map(([path, label]) => (
              <Link
                key={path}
                href={`/cases/${slug}/${path}/`}
                className="block px-3 py-3 text-sm text-ink-soft hover:bg-paper-deep"
              >
                {label} →
              </Link>
            ))}
          </div>
        </details>
      </div>
    </nav>
  );
}
