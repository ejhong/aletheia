import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * The one place a model is chosen: config/models.yaml, parsed and validated
 * here and read by the verb chain (src/pipeline), the panel table
 * (scripts/lib/vendors.mjs), and the maintenance scripts' drafting helper
 * (scripts/lib/llm.mjs). Nothing else names a model id. The panel test pins
 * five seats with distinct vendors; the pipeline test pins that every model
 * named here has a tariff row.
 */

const AnthropicSeat = z.object({
  model: z.string().min(1),
  /** Server-side fallback on a safety decline; the run records the model that served. */
  fallback: z.string().min(1).optional(),
});

export const ModelsSchema = z.object({
  house: AnthropicSeat,
  reader: AnthropicSeat,
  research: z.object({
    default: z.enum(["anthropic", "openai"]),
    seats: z.object({
      anthropic: AnthropicSeat.extend({
        maxSearches: z.number().int().positive(),
        maxFetches: z.number().int().positive(),
      }),
      openai: z.object({ model: z.string().min(1), maxToolCalls: z.number().int().positive() }),
    }),
  }),
  panel: z.record(
    z.string(),
    z.object({
      model: z.string().min(1),
      label: z.string().min(1),
      tag: z.string().min(1),
      effort: z.enum(["low", "medium", "high", "max"]),
    }),
  ),
  legacy: z.object({ openaiChat: z.object({ model: z.string().min(1) }) }),
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
  const ids = [models.house.model, models.house.fallback, models.reader.model, models.reader.fallback];
  for (const seat of Object.values(models.research.seats)) ids.push(seat.model, seat.fallback);
  for (const seat of Object.values(models.panel)) ids.push(seat.model);
  ids.push(models.legacy.openaiChat.model);
  return [...new Set(ids.filter((id) => typeof id === "string"))];
}

/** The committed choice, loaded once from the repository root the process runs in. */
export const MODELS = loadModels();
