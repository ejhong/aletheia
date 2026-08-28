#!/usr/bin/env node
/**
 * Generate cover-art candidates for a case in the Aletheia house style
 * (see docs/IMAGE_STYLE.md) via the OpenAI Images API.
 *
 * Usage:  IMAGE_API_KEY=... node scripts/generate-case-art.mjs <case-slug> [count]
 *         (falls back to OPENAI_API_KEY when IMAGE_API_KEY is not set)
 *
 * Writes candidates to public/images/cases/<slug>/candidates/ and prints a
 * manifest entry skeleton for the chosen one. Designed to run inside the
 * generate-case-art GitHub workflow, which opens a PR with the results —
 * a human picks the winner during PR review.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const STYLE_VERSION = "style-v2";
const MODEL = "gpt-image-1";

/**
 * style-v2 per-case tone assignments (see docs/IMAGE_STYLE.md, "Case tone
 * assignments" — keep the two in sync). Each case cover is full color in
 * subdued antique mineral pigments, with its own dominant tone.
 */
const CASE_TONES = {
  geopolymer:
    "yellow ochre and raw sienna sandstone tones on the stonework, umber " +
    "shadows, a pale grey-blue wash in the sky",
  vasocomputation:
    "madder red and oxblood on the vessel-like forms, faded rose flesh " +
    "tones, ivory bone, a faint sage undertone",
  transients:
    "deep Prussian blue and slate blue in the night sky, silver-cream " +
    "stars, one small warm brass accent on the instrument",
  "orch-or":
    "muted violet-grey and indigo forms, one antique-gold shaft of light",
  ydih:
    "sage and olive-green grassland, buff sky, one faded vermilion comet " +
    "streak",
  mpi:
    "verdigris and muted teal, grey-green shadows, one pale sulfur-yellow " +
    "accent on the butterfly",
  ccc:
    "deep charcoal-slate night sky, concentric rings in pale cream and " +
    "faded antique gold, one small ember-red accent at the rings' center",
  "zero-worlds":
    "faint graphite-grey and warm dove-grey washes over generous expanses " +
    "of bare cream paper — the sparest cover in the set — with one small " +
    "deep-lapis accent at the observer's lantern",
  "immortality-key":
    "muted Tyrian purple and wine-dark washes on the cup and vine, pale " +
    "barley-gold ears of grain, warm umber shadows, one small pale-mint " +
    "green accent on the herb sprig",
  "pre-columbian-amazon":
    "deep viridian and forest-green canopy washes, a pale ochre-gold " +
    "river meander, faint umber earthwork lines beneath the canopy, one " +
    "small vermilion accent on the chronicler's ribbon marker",
};

/**
 * Optional composition overrides for cases whose canonical cover subject is
 * more specific than what the dossier fields would generate.
 */
const CASE_SUBJECTS = {
  geopolymer:
    "A monumental polygonal megalithic wall of interlocking many-angled " +
    "cyclopean stones, viewed at a slight angle with raking light — an " +
    "allegorical, typological composition, not a depiction of any real " +
    "site as documentation.",
  ccc:
    "A seated allegorical muse with a laurel wreath, a closed book on her " +
    "knee, raising a small telescope toward an enormous disc of concentric " +
    "engraved rings filling the night sky, a globe on a tripod stand beside " +
    "her in a quiet rocky landscape — cycles within cycles, an allegorical " +
    "emblem, never a depiction of any real dataset as documentation.",
  "zero-worlds":
    "A small cloaked observer seen from behind, standing on a tiny island " +
    "of finely engraved ground that frays at its edges into blank paper, " +
    "holding up a lantern whose single beam is the only place a world " +
    "exists: within the beam, engraved hills, stars, and a thin geometric " +
    "lattice condense out of nothing; outside it, bare cream paper — " +
    "world as output, not backdrop. An allegorical emblem, never a " +
    "depiction of any real experiment or dataset as documentation.",
  "immortality-key":
    "A two-handled ancient Greek drinking cup standing on a plain stone " +
    "ledge in a quiet niche, sheaves of barley leaning beside it with a " +
    "few grain heads bearing darkened, hornlike sclerotia, a small sprig " +
    "of mint laid at its foot, and a grapevine climbing one handle; two " +
    "crossed unlit ceremonial torches rest behind the cup. The cup's " +
    "interior is dark and unreadable — the question is what it held. An " +
    "allegorical emblem, never a depiction of any real excavated vessel, " +
    "sanctuary, or laboratory result as documentation.",
  "pre-columbian-amazon":
    "A great river seen from high above, winding through dense engraved " +
    "forest canopy that fills the frame; beneath the canopy along its " +
    "banks, faint geometric enclosures — circles, squares, long causeway " +
    "lines — show through the foliage like a memory of settlement. In one " +
    "lower corner, small on a stone ledge, an open handwritten chronicle " +
    "with a quill laid across it. An allegorical emblem of an account and " +
    "a landscape answering one another — never a depiction of any real " +
    "site, survey, or LiDAR dataset as documentation.",
};

/** One reversible generation run: a single runId stamped on every record. */
const RUN_ID = `cover-${STYLE_VERSION}-${new Date().toISOString().slice(0, 10)}`;

const [slug, countArg] = process.argv.slice(2);
const count = Math.min(Number(countArg ?? 3) || 3, 4);

if (!slug) {
  console.error("usage: node scripts/generate-case-art.mjs <case-slug> [count]");
  process.exit(1);
}

const apiKey = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error(
    [
      "",
      "ERROR: neither IMAGE_API_KEY nor OPENAI_API_KEY is set.",
      "",
      "This script calls the OpenAI Images API. To enable it:",
      "  1. Create an OpenAI API key with image-generation access.",
      "  2. Add it as the repository secret IMAGE_API_KEY — or rely on",
      "     OPENAI_API_KEY, which is used as a fallback",
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

// The canonical style-v2 template from docs/IMAGE_STYLE.md, with a subject
// derived from the case's own dossier fields (ideas, never evidence scenes)
// and the case's assigned tone.
const subject =
  CASE_SUBJECTS[slug] ??
  `An allegorical emblem for a case titled "${record.title}" in the domain of ` +
    `${record.domain}: a symbolic, typological composition suggesting the ` +
    `question — ${record.subtitle} — without depicting any real site, artifact, ` +
    `or dataset as documentation.`;

const tone = CASE_TONES[slug];
if (!tone) {
  console.error(
    `No style-v2 tone assigned for "${slug}". Add it to CASE_TONES here and ` +
      `to the tone table in docs/IMAGE_STYLE.md, then re-run.`,
  );
  process.exit(1);
}

const prompt =
  `Hand-tinted 19th-century scientific expedition lithograph, ` +
  `chromolithograph plate from a vintage natural-history atlas. ${subject} ` +
  `Fine copperplate cross-hatching and stipple engraving beneath soft, ` +
  `translucent hand-applied watercolor washes. Full color in subdued ` +
  `antique mineral pigments — ${tone} — over warm-black ink linework on ` +
  `aged warm cream paper (#f6f1e8). Colors muted and slightly faded as if ` +
  `printed in 1870; never saturated modern digital color, no gradients, no ` +
  `glow. Darwin-era natural-history journal plate aesthetic, generous plain ` +
  `paper margins, quiet composition. Absolutely no text, no labels, no ` +
  `captions, no border frame lines. Unmistakably a hand-tinted engraving — ` +
  `stylized editorial artwork, not photorealistic, no photograph.`;

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
  runId: "${RUN_ID}"
  prompt: >-
    ${prompt}
`);
