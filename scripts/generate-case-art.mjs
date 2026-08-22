#!/usr/bin/env node
/**
 * Generate cover-art candidates for a case in the Aletheia house style
 * (see docs/IMAGE_STYLE.md) via the OpenAI Images API.
 *
 * Usage:  IMAGE_API_KEY=... node scripts/generate-case-art.mjs <case-slug> [count]
 *
 * Writes candidates to public/images/cases/<slug>/candidates/ and prints a
 * manifest entry skeleton for the chosen one. Designed to run inside the
 * generate-case-art GitHub workflow, which opens a PR with the results —
 * a human picks the winner during PR review.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const STYLE_VERSION = "style-v1";
const MODEL = "gpt-image-1";

const [slug, countArg] = process.argv.slice(2);
const count = Math.min(Number(countArg ?? 3) || 3, 4);

if (!slug) {
  console.error("usage: node scripts/generate-case-art.mjs <case-slug> [count]");
  process.exit(1);
}

const apiKey = process.env.IMAGE_API_KEY;
if (!apiKey) {
  console.error(
    [
      "",
      "ERROR: IMAGE_API_KEY is not set.",
      "",
      "This script calls the OpenAI Images API. To enable it:",
      "  1. Create an API key with image-generation access.",
      "  2. Add it as the repository secret IMAGE_API_KEY",
      "     (GitHub → Settings → Secrets and variables → Actions).",
      "  3. Re-run the 'generate-case-art' workflow.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const caseFile = path.join(process.cwd(), "content", "cases", slug, "case.yaml");
if (!fs.existsSync(caseFile)) {
  console.error(`No case at content/cases/${slug}/case.yaml`);
  process.exit(1);
}
const record = parseYaml(fs.readFileSync(caseFile, "utf8"));

// The canonical style-v1 template from docs/IMAGE_STYLE.md, with a subject
// derived from the case's own dossier fields (ideas, never evidence scenes).
const subject =
  `An allegorical emblem for a case titled "${record.title}" in the domain of ` +
  `${record.domain}: a symbolic, typological composition suggesting the ` +
  `question — ${record.subtitle} — without depicting any real site, artifact, ` +
  `or dataset as documentation.`;

const prompt =
  `19th-century scientific expedition lithograph, copperplate engraving. ` +
  `${subject} Fine cross-hatching and stipple shading, hand-engraved ` +
  `linework. Monochrome deep warm-black ink (#201b12) on aged warm cream ` +
  `paper (#f6f1e8), with one restrained oxidized-copper (#9a5b33) accent on ` +
  `the compositional focal point. Darwin-era natural-history journal plate ` +
  `aesthetic, generous plain paper margins, quiet composition. Absolutely no ` +
  `text, no labels, no captions, no border frame lines. Unmistakably an ` +
  `engraving — stylized editorial artwork, not photorealistic, no photograph.`;

const outDir = path.join(
  process.cwd(),
  "public",
  "images",
  "cases",
  slug,
  "candidates",
);
fs.mkdirSync(outDir, { recursive: true });

console.error(`Generating ${count} cover candidates for ${slug}...`);
for (let i = 1; i <= count; i++) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size: "1536x1024",
      quality: "high",
      n: 1,
    }),
  });
  if (!res.ok) {
    console.error(`Image API error ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    console.error("Image API returned no image data");
    process.exit(1);
  }
  const file = path.join(outDir, `cover-candidate-${i}.png`);
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  console.error(`  wrote ${path.relative(process.cwd(), file)}`);
}

console.log(`
# After picking a winner in PR review:
#   1. sips -s format jpeg -s formatOptions 75 -Z 1600 <winner>.png --out public/images/cases/${slug}/cover.jpg
#   2. delete the candidates/ directory
#   3. add to content/cases/${slug}/images.yaml:

- id: IMG-${slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}-COVER
  role: cover
  file: /images/cases/${slug}/cover.jpg
  alt: "TODO: describe the artwork"
  source: generated
  license: "Project artwork (AI-generated)"
  credit: "AI-generated editorial artwork, Aletheia house style"
  styleVersion: ${STYLE_VERSION}
  model: "${MODEL}"
  prompt: >-
    ${prompt}
`);
