import { createBudget } from "../../../scripts/lib/ai-budget.mjs";
import fs from "node:fs";

/** Native CLI tests exercise the real HTTP adapter against this synthetic
 * GitHub, alongside their synthetic model replies. No network is permitted. */
export function githubBudgetFetchFixture() {
  const config = fs.readFileSync(new URL("../../../config/ai.json", import.meta.url), "utf8");
  const allowance = JSON.parse(config).initialBudget;
  const encoded = (text: string) => JSON.stringify(Buffer.from(text).toString("base64"));
  return `let syntheticBudgetState;
    async function fixtureBudgetFetch(url, init) {
      if (!String(url).includes("api.github.com")) return null;
      if (String(url).includes("/contents/config/ai.json")) return Response.json({ encoding: "base64", content: ${encoded(config)} });
      if (String(url).includes("/contents/allowance.json")) return Response.json({ sha: "allowance-fixture", encoding: "base64", content: ${encoded(JSON.stringify(allowance))} });
      if (String(url).includes("/git/ref/")) return Response.json({ object: { sha: "fixture" } });
      if (init.method === "PUT") { syntheticBudgetState = JSON.parse(Buffer.from(JSON.parse(init.body).content, "base64").toString()); return Response.json({}); }
      if (!syntheticBudgetState) return new Response("", { status: 404 });
      return Response.json({ sha: "fixture", encoding: "base64", content: Buffer.from(JSON.stringify(syntheticBudgetState)).toString("base64") });
    }
  `;
}

/** In-memory compare-and-swap fixture. Never exported by production code. */
export function memoryBudgetStore() {
  const values = new Map<string, { sha: string; value: unknown }>();
  let serial = 0;
  return {
    async read(month: string) { return structuredClone(values.get(month) ?? { sha: null, value: null }); },
    async write(month: string, sha: string | null, value: unknown) {
      if ((values.get(month)?.sha ?? null) !== sha) return false;
      values.set(month, { sha: String(++serial), value: structuredClone(value) }); return true;
    },
  };
}
export function testBudget() { return createBudget(memoryBudgetStore()); }
