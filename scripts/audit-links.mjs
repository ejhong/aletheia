// Post-build link integrity check ("no dangling IDs", applied to the rendered
// site): verify every internal href in the exported out/ HTML resolves to an
// existing page, and every fragment to an existing element id on that page.
// Run after `npm run build`: node scripts/audit-links.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const OUT = new URL("../out", import.meta.url).pathname;

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith(".html")) yield p;
  }
}

// page path (e.g. "/cases/transients/") -> Set of element ids
const pages = new Map();
for (const file of htmlFiles(OUT)) {
  const rel = "/" + relative(OUT, file).replace(/index\.html$/, "").replace(/\.html$/, "/");
  const html = readFileSync(file, "utf8");
  const ids = new Set();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  pages.set(rel, { ids, html, file });
}

const problems = [];
for (const [page, { html }] of pages) {
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]*)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|#$)/.test(href)) continue;
    let path, frag;
    if (href.startsWith("#")) {
      path = page;
      frag = href.slice(1);
    } else {
      const [p, f] = href.split("#");
      path = p.startsWith("/") ? p : new URL(p, `http://x${page}`).pathname;
      frag = f;
    }
    if (!path.endsWith("/")) path += "/";
    const target = pages.get(path);
    if (!target) {
      // static assets (images, txt) live outside the page map
      try {
        statSync(join(OUT, path.replace(/\/$/, "")));
        continue;
      } catch {
        problems.push(`${page}: href="${href}" -> missing page ${path}`);
        continue;
      }
    }
    if (frag && !target.ids.has(frag)) {
      problems.push(`${page}: href="${href}" -> missing anchor #${frag} on ${path}`);
    }
  }
}

if (problems.length) {
  console.log(`${problems.length} broken internal links:`);
  for (const p of problems) console.log("  " + p);
  process.exit(1);
}
console.log(`OK: all internal links across ${pages.size} pages resolve.`);
