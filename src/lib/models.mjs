import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * The one place a model is chosen: config/models.yaml, parsed and validated
 * here and read by the panel's table (src/lib/vendors.mjs) and the review
 * (src/engine/review.ts). Nothing else names a model id. A test pins five
 * panel seats with distinct vendors, the reviewers to seats of that panel,
 * and a tariff row for every model named.
 */

const Seat = z.object({
  model: z.string().min(1),
  label: z.string().min(1),
  tag: z.string().min(1),
  effort: z.enum(["low", "medium", "high", "max"]),
  /** The seat's ceiling on thinking and reply together, where the vendor counts them as one; absent, the caller's figure is used. */
  maxOutputTokens: z.number().int().positive().optional(),
});

export const ModelsSchema = z
  .object({
    /** The site's operator, when the file names one: the vendor and model whose sessions draft the site's changes. */
    operator: z.object({ vendor: z.string().min(1), model: z.string().min(1), effort: z.enum(["low", "medium", "high", "max"]) }).optional(),
    panel: z.record(z.string(), Seat),
    /** The panel's seats that review a change: never the vendor whose model drafted it. */
    review: z.object({ seats: z.array(z.string().min(1)).min(3) }),
  })
  .superRefine((m, ctx) => {
    for (const seat of m.review.seats) if (!m.panel[seat]) ctx.addIssue({ code: "custom", message: `review seat "${seat}" is not a seat of the panel` });
    if (m.operator && m.review.seats.includes(m.operator.vendor)) ctx.addIssue({ code: "custom", message: `the operator's vendor (${m.operator.vendor}) cannot review its own model's work` });
  });

export const modelsFile = (root = process.cwd()) => path.join(root, "config", "models.yaml");

/** Parse and validate config/models.yaml; a malformed file throws before any call is made. */
export function loadModels(root = process.cwd()) {
  const file = modelsFile(root);
  if (!fs.existsSync(file)) throw new Error("config/models.yaml is missing — no model can be chosen without it");
  return ModelsSchema.parse(parseYaml(fs.readFileSync(file, "utf8")));
}

/** Every distinct model id the file names, for the tariff cross-check. */
export function modelIds(models) {
  const ids = Object.values(models.panel).map((seat) => seat.model);
  if (models.operator) ids.push(models.operator.model);
  return [...new Set(ids)];
}

/** The committed choice, loaded once from the repository root the process runs in. */
export const MODELS = loadModels();
