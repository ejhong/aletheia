#!/usr/bin/env node
/**
 * Add a Wikimedia Commons image as a numbered plate: downloads the file and
 * prints a ready-to-paste images.yaml entry with license/credit auto-filled
 * from the Commons API.
 *
 * Usage:
 *   node scripts/add-commons-image.mjs "File:Some image.jpg" <case-slug> [--width 1600]
 *
 * The script refuses files whose license does not permit reuse. It fills in
 * everything it can; you still write `depicts`, `alt`, `plateNumber`, and
 * `claimIds` yourself — those are editorial judgments.
 */
import fs from "node:fs";
import path from "node:path";

const [title, caseSlug] = process.argv.slice(2);
const widthArg = process.argv.indexOf("--width");
const width = widthArg > -1 ? Number(process.argv[widthArg + 1]) : 1600;

if (!title || !caseSlug) {
  console.error(
    'usage: node scripts/add-commons-image.mjs "File:Name.jpg" <case-slug> [--width 1600]',
  );
  process.exit(1);
}

const API = "https://commons.wikimedia.org/w/api.php";
const UA = "AletheiaImageBot/1.0 (static site; contact: repo issues)";

const OK_LICENSES =
  /^(pd|cc0|cc[ -]?by(?:[ -]?sa)?[ -]?\d|public domain|attribution)/i;

const params = new URLSearchParams({
  action: "query",
  titles: title,
  prop: "imageinfo",
  iiprop: "url|extmetadata|size",
  iiurlwidth: String(width),
  format: "json",
  formatversion: "2",
});

const res = await fetch(`${API}?${params}`, { headers: { "User-Agent": UA } });
if (!res.ok) throw new Error(`Commons API ${res.status}`);
const data = await res.json();
const page = data.query?.pages?.[0];
const info = page?.imageinfo?.[0];
if (!info) {
  console.error(`No image info for ${title} — check the exact File: title.`);
  process.exit(1);
}

const meta = info.extmetadata ?? {};
const strip = (html) => (html ?? "").replace(/<[^>]*>/g, "").trim();
const licenseShort = strip(meta.LicenseShortName?.value);
const licenseUrl = meta.LicenseUrl?.value ?? null;
const artist = strip(meta.Artist?.value) || "Unknown";
const dateOriginal = strip(meta.DateTimeOriginal?.value);
const descriptionUrl = info.descriptionurl;

if (!OK_LICENSES.test(licenseShort)) {
  console.error(
    `License "${licenseShort}" does not clearly permit reuse — refusing. Check ${descriptionUrl}`,
  );
  process.exit(1);
}

const slugified = title
  .replace(/^File:/, "")
  .replace(/\.[a-z]+$/i, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "")
  .slice(0, 60);
const downloadUrl = info.thumburl ?? info.url;
const ext =
  path.extname(new URL(downloadUrl).pathname).toLowerCase() || ".jpg";
const relPath = `images/cases/${caseSlug}/plates/${slugified}${ext}`;
const outPath = path.join(process.cwd(), "public", relPath);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
let fileRes;
for (let attempt = 1; ; attempt++) {
  fileRes = await fetch(downloadUrl, { headers: { "User-Agent": UA } });
  if (fileRes.ok) break;
  if (attempt >= 4) throw new Error(`download failed: ${fileRes.status}`);
  const wait = attempt * 3000;
  console.error(`HTTP ${fileRes.status}, retrying in ${wait / 1000}s...`);
  await new Promise((r) => setTimeout(r, wait));
}
fs.writeFileSync(outPath, Buffer.from(await fileRes.arrayBuffer()));
console.error(`downloaded -> public/${relPath}`);

const yamlEntry = `
- id: IMG-${caseSlug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}-PXX   # TODO: assign plate id
  role: plate
  file: /${relPath}
  alt: "TODO: describe for screen readers"
  source: commons
  license: "${licenseShort}"${licenseUrl ? `\n  licenseUrl: "${licenseUrl}"` : ""}
  credit: "${artist.replace(/"/g, "'")}, via Wikimedia Commons"
  plateNumber: 0   # TODO
  depicts: "TODO: what the photograph shows (observation, not interpretation)"
  provenance:
    photographer: "${artist.replace(/"/g, "'")}"${dateOriginal ? `\n    date: "${dateOriginal.replace(/"/g, "'")}"` : ""}
    sourceUrl: "${descriptionUrl}"
    originalTitle: "${title.replace(/"/g, "'")}"
  claimIds: []   # optional: claims this plate illustrates
`;
console.log(yamlEntry);
