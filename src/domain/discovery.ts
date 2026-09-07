import { z } from "zod";

export const DISCOVERY_PROTOCOL = "bounded-discovery-v1";
const text = z.string().trim().min(10).max(3000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const DiscoveryPlanSchema = z.strictObject({
  question: text, whyNow: text, scope: text,
  inclusion: text, disconfirmers: text,
  queries: z.array(z.strictObject({ query: z.string().trim().min(5).max(300),
    purpose: z.enum(["primary", "counterevidence"]), reason: text })).max(3),
}).refine(p => !p.queries.length || p.queries.some(q => q.purpose === "counterevidence"), "include a counterevidence search")
  .refine(p => new Set(p.queries.map(q => q.query.toLowerCase())).size === p.queries.length, "duplicate search query");
export const DiscoverySelectionSchema = z.strictObject({
  leads: z.array(z.strictObject({ index: z.number().int().nonnegative(),
    reason: text, observationToCheck: text })).max(2),
  reason: text,
});
export const DiscoverySourceSchema = z.strictObject({ url: z.url(), title: z.string().max(2000) });
const Reply = z.strictObject({ model: z.string(), responseId: z.string(), inputHash: hash, text: z.string() });
const Search = z.strictObject({ queryIndex: z.number().int().nonnegative(), inputHash: hash,
  model: z.string(), responseId: z.string().optional(),
  // Search receipts, never evidence or a claim that we read a page.
  calls: z.array(z.record(z.string(), z.unknown())),
  sources: z.array(DiscoverySourceSchema).max(100), summary: z.string(), error: z.string().optional(),
});
export const DiscoveryRunSchema = z.strictObject({
  version: z.literal(1), promptVersion: z.literal(DISCOVERY_PROTOCOL),
  case: z.string().min(1), runId: z.string().min(1), generatedAt: z.iso.datetime(),
  basisHash: hash, packetHash: hash,
  reconsider: text.nullable(), plan: DiscoveryPlanSchema.nullable(),
  planning: Reply.nullable(), searches: z.array(Search).max(3), selection: Reply.nullable(),
  sources: z.array(DiscoverySourceSchema).max(300),
  selected: DiscoverySelectionSchema.nullable(),
  outcome: z.enum(["planned", "queued", "no_change", "failed", "stale"]),
  reason: z.string().min(1),
}).superRefine((run, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const queryIds = run.searches.map(s => s.queryIndex);
  if (new Set(queryIds).size !== queryIds.length || run.searches.some(s => !run.plan?.queries[s.queryIndex]))
    issue("search does not belong to the frozen plan");
  if (run.outcome === "planned" && (!run.plan || !run.planning)) issue("plan receipt required before searching");
  if (run.selected?.leads.some(l => !run.sources[l.index]) ||
      new Set(run.selected?.leads.map(l => l.index)).size !== (run.selected?.leads.length ?? 0))
    issue("selected lead must name a distinct returned source");
  if (run.outcome === "queued" && (!run.selected?.leads.length || !run.selection)) issue("queued run needs a selection");
  const returned = new Set(run.searches.flatMap(s => s.sources.map(v => v.url)));
  if (run.sources.some(s => !returned.has(s.url)) || new Set(run.sources.map(s => s.url)).size !== run.sources.length)
    issue("source pool differs from returned search URLs");
});
export type DiscoveryRun = z.infer<typeof DiscoveryRunSchema>;
export type DiscoveryPlan = z.infer<typeof DiscoveryPlanSchema>;
