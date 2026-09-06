import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AI_POLICY, PolicySchema, AllowanceSchema, parsePolicyConfig, BudgetStopped, microUsd } from "./ai-policy.mjs";

export const BUDGET_BRANCH = "automation-budget";
export const WORKLOADS = ["drafting", "research", "review", "operator", "images"];
const Amount = z.number().int().nonnegative();
const Entry = z.strictObject({
  id: z.uuid(), at: z.iso.datetime(), workload: z.enum(WORKLOADS), model: z.string().min(1),
  run: z.string(), reserved: Amount, accounted: Amount.optional(),
  terms: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  receipt: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
const Ledger = z.strictObject({ version: z.literal(1), month: z.string().regex(/^\d{4}-\d{2}$/), entries: z.array(Entry) })
  .superRefine((s, ctx) => {
    if (new Set(s.entries.map(e => e.id)).size !== s.entries.length || s.entries.some(e => !e.at.startsWith(s.month)))
      ctx.addIssue({ code: "custom", message: "duplicate reservation or wrong accounting month" });
  });

export function totals(state, at = new Date().toISOString()) {
  const sum = rows => rows.reduce((s, e) => s + (e.accounted ?? e.reserved), 0);
  return { month: sum(state.entries), day: sum(state.entries.filter(e => e.at.slice(0, 10) === at.slice(0, 10))),
    nonReview: sum(state.entries.filter(e => e.workload !== "review")),
    held: sum(state.entries.filter(e => e.accounted === undefined)),
    byWorkload: Object.fromEntries(WORKLOADS.map(w => [w, sum(state.entries.filter(e => e.workload === w))])) };
}

/** Store is a compare-and-swap register, shared across Actions jobs and local
 * runs. A lost write acknowledgement is resolved by the same UUID; it never
 * authorizes a second paid request. Reservations do not expire. */
export function createBudget(store, { policy = AI_POLICY, now = () => new Date().toISOString(),
  id = randomUUID, run = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_WORKFLOW}/${process.env.GITHUB_RUN_ID}/${process.env.GITHUB_RUN_ATTEMPT}` : "local" } = {}) {
  async function mutate(month, change) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const loaded = await store.read(month);
      const state = Ledger.parse(loaded.value ?? { version: 1, month, entries: [] });
      if (state.month !== month) throw new BudgetStopped("Budget month mismatch.");
      const next = change(structuredClone(state));
      if (!next) return state;
      if (await store.write(month, loaded.sha, Ledger.parse(next))) return next;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
    throw new BudgetStopped("Spending record is busy or unavailable; no new paid request was authorized.");
  }
  async function reserve({ workload, model, amount, terms = {} }) {
    const entry = Entry.parse({ id: id(), at: now(), workload, model, run, reserved: amount, terms });
    const month = entry.at.slice(0, 7);
    await mutate(month, s => {
      const prior = s.entries.find(e => e.id === entry.id);
      if (prior) {
        if (JSON.stringify(prior) !== JSON.stringify(entry)) throw new BudgetStopped("Conflicting spending reservation ID.");
        return null;
      }
      const used = totals(s, entry.at);
      if (!policy.enabled || used.month + amount > microUsd(policy.monthlyUsd) ||
        used.day + amount > microUsd(policy.dailyUsd) ||
        (workload !== "review" && used.nonReview + amount > microUsd(policy.monthlyUsd - policy.reviewReserveUsd)))
        throw new BudgetStopped(`AI allowance reached (month $${(used.month / 1e6).toFixed(2)}/${policy.monthlyUsd}; day $${(used.day / 1e6).toFixed(2)}/${policy.dailyUsd}). Work remains queued; review requirements are unchanged.`);
      s.entries.push(entry);
      return s;
    });
    return { id: entry.id, month, reserved: amount };
  }
  async function settle(ticket, amount, receipt = {}) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > ticket.reserved)
      throw new BudgetStopped("Usage exceeds the reservation or is invalid; full reservation retained.");
    await mutate(ticket.month, s => {
      const e = s.entries.find(e => e.id === ticket.id);
      if (!e || e.reserved !== ticket.reserved) throw new BudgetStopped("Unknown spending reservation.");
      if (e.accounted !== undefined) {
        if (e.accounted !== amount || JSON.stringify(e.receipt) !== JSON.stringify(receipt))
          throw new BudgetStopped("Conflicting usage receipt.");
        return null;
      }
      e.accounted = amount; e.receipt = receipt;
      return s;
    });
  }
  return { reserve, settle, async getPolicy() { return policy; }, async status(month = now().slice(0, 7)) {
    const s = Ledger.parse((await store.read(month)).value ?? { version: 1, month, entries: [] });
    return { ...s, totals: totals(s, now()), policy };
  } };
}

export function githubBudgetStore({ token = process.env.BUDGET_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
  repository = process.env.GITHUB_REPOSITORY || "ejhong/aletheia", fetchImpl = fetch } = {}) {
  if (!token) throw new BudgetStopped("Budget access is not configured. Set BUDGET_GITHUB_TOKEN (repository contents write); no paid call sent.");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new BudgetStopped("Invalid budget repository.");
  const endpoint = `https://api.github.com/repos/${repository}`;
  async function request(suffix, method = "GET", body) {
    try {
      return await fetchImpl(endpoint + suffix, { method,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    } catch { throw new BudgetStopped("Spending record unavailable; reservations retained, new paid calls paused."); }
  }
  const file = month => {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BudgetStopped("Invalid budget month.");
    return `/contents/months/${month}.json`;
  };
  async function jsonFile(suffix) {
    const res = await request(suffix);
    if (res.status === 404) return null;
    if (!res.ok) throw new BudgetStopped(`Budget policy read HTTP ${res.status}.`);
    const data = await res.json();
    if (data.encoding !== "base64" || !data.content) throw new BudgetStopped("Invalid budget policy encoding.");
    return JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
  }
  async function allowanceFile() {
    const res = await request(`/contents/allowance.json?ref=${BUDGET_BRANCH}`);
    if (!res.ok) throw new BudgetStopped("Initialize the shared allowance before paid work.");
    const body = await res.json();
    if (body.encoding !== "base64" || !body.sha || !body.content) throw new BudgetStopped("Invalid allowance record.");
    return { sha: body.sha, value: AllowanceSchema.parse(JSON.parse(Buffer.from(body.content, "base64").toString("utf8"))) };
  }
  return {
    async init() {
      const exists = await request(`/git/ref/heads/${BUDGET_BRANCH}`);
      if (!exists.ok && exists.status !== 404) throw new BudgetStopped(`Budget branch lookup HTTP ${exists.status}`);
      const main = await request("/git/ref/heads/main");
      if (!main.ok) throw new BudgetStopped(`Budget initialization HTTP ${main.status}`);
      const baseSha = (await main.json()).object.sha;
      if (!exists.ok) {
        const res = await request("/git/refs", "POST", { ref: `refs/heads/${BUDGET_BRANCH}`, sha: baseSha });
        if (!res.ok) throw new BudgetStopped(`Budget initialization HTTP ${res.status}`);
      }
      // Explicit, founder-authorized bootstrap for the first integration PR.
      // It is valid only until model policy first appears in main's history.
      const old = await jsonFile(`/contents/bootstrap-policy.json?ref=${BUDGET_BRANCH}`);
      if (!old) {
        const res = await request("/contents/bootstrap-policy.json", "PUT", { branch: BUDGET_BRANCH,
          message: "Initialize authorized AI allowance before the first metered review",
          content: Buffer.from(JSON.stringify({ baseSha, policy: AI_POLICY }) + "\n").toString("base64") });
        if (!res.ok) throw new BudgetStopped(`Budget policy initialization HTTP ${res.status}`);
      }
      const allowance = await jsonFile(`/contents/allowance.json?ref=${BUDGET_BRANCH}`);
      if (!allowance) {
        const { enabled, monthlyUsd, dailyUsd, reviewReserveUsd } = AI_POLICY;
        const res = await request("/contents/allowance.json", "PUT", { branch: BUDGET_BRANCH,
          message: "Initialize the founder's AI spending controls",
          content: Buffer.from(JSON.stringify({ enabled, monthlyUsd, dailyUsd, reviewReserveUsd }) + "\n").toString("base64") });
        if (!res.ok) throw new BudgetStopped(`Allowance initialization HTTP ${res.status}`);
      }
    },
    async configure(changes) {
      const patch = z.strictObject({ enabled: z.boolean().optional(), monthlyUsd: z.number().nonnegative().optional(),
        dailyUsd: z.number().nonnegative().optional(), reviewReserveUsd: z.number().nonnegative().optional() }).parse(changes);
      for (let attempt = 0; attempt < 12; attempt++) {
        const old = await allowanceFile();
        const value = AllowanceSchema.parse({ ...old.value, ...patch });
        const res = await request("/contents/allowance.json", "PUT", { branch: BUDGET_BRANCH, sha: old.sha,
          message: `Set AI allowance: ${value.enabled ? "running" : "paused"}, $${value.monthlyUsd}/month, $${value.dailyUsd}/day\n\nRequested by ${process.env.GITHUB_ACTOR || "local operator"}; workflow run ${process.env.GITHUB_RUN_ID || "local"}.`,
          content: Buffer.from(JSON.stringify(value) + "\n").toString("base64") });
        if (res.ok) return value;
        if (![409, 422].includes(res.status)) throw new BudgetStopped(`Allowance update HTTP ${res.status}`);
        await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
      }
      throw new BudgetStopped("Allowance update conflicted; inspect the live report before retrying.");
    },
    async policy() {
      const approved = await jsonFile("/contents/config/ai.json?ref=main");
      let models;
      if (approved) models = parsePolicyConfig(approved);
      else {
        const bootstrap = await jsonFile(`/contents/bootstrap-policy.json?ref=${BUDGET_BRANCH}`);
        const history = await request("/commits?path=config%2Fai.json&sha=main&per_page=1");
        const commits = history.ok ? await history.json() : null;
        if (!bootstrap || !Array.isArray(commits) || commits.length !== 0)
          throw new BudgetStopped("No approved AI policy. Bootstrap is allowed only before model policy has ever been published.");
        models = PolicySchema.parse(bootstrap.policy);
      }
      return PolicySchema.parse({ ...models, ...(await allowanceFile()).value });
    },
    async read(month) {
      const res = await request(file(month) + `?ref=${BUDGET_BRANCH}`);
      if (res.status === 404) {
        const branch = await request(`/git/ref/heads/${BUDGET_BRANCH}`);
        if (!branch.ok) throw new BudgetStopped("Initialize the spending branch with npm run ai:budget -- init before paid work.");
        return { sha: null, value: null };
      }
      if (!res.ok) throw new BudgetStopped(`Budget read HTTP ${res.status}; paid work paused.`);
      const body = await res.json();
      if (body.encoding !== "base64" || !body.sha || !body.content) throw new BudgetStopped("Invalid spending record encoding.");
      return { sha: body.sha, value: JSON.parse(Buffer.from(body.content, "base64").toString("utf8")) };
    },
    async write(month, sha, value) {
      let res;
      try {
        res = await request(file(month), "PUT", { branch: BUDGET_BRANCH,
          message: `AI allowance: ${month} (${value.entries.length} reservations)`,
          content: Buffer.from(JSON.stringify(value) + "\n").toString("base64"), ...(sha ? { sha } : {}) });
      } catch { return false; } // ambiguous write: re-read, using the same UUID
      if ([409, 422].includes(res.status)) return false;
      if (!res.ok) throw new BudgetStopped(`Budget write HTTP ${res.status}; paid work paused.`);
      return true;
    },
  };
}

/** @param {Pick<ReturnType<typeof githubBudgetStore>, "policy" | "read" | "write">} store */
export function sharedBudget(store = githubBudgetStore()) {
  // Read live controls for each admission, including within a long-running
  // worker. Running requests retain their recorded terms when controls change.
  const ready = async () => createBudget(store, { policy: await store.policy() });
  return {
    async getPolicy() { return (await ready()).getPolicy(); },
    async reserve(request) { return (await ready()).reserve(request); },
    async settle(ticket, amount, receipt = {}) { return (await ready()).settle(ticket, amount, receipt); },
    async status(month) { return (await ready()).status(month); },
  };
}
