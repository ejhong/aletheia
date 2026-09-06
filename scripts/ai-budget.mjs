#!/usr/bin/env node
import fs from "node:fs";
import { AI_POLICY } from "./lib/ai-policy.mjs";
import { sharedBudget, githubBudgetStore, BUDGET_BRANCH } from "./lib/ai-budget.mjs";

const args = process.argv.slice(2);
const command = args[0] ?? "status";
const dollars = amount => `$${(amount / 1e6).toFixed(2)}`;

if (command === "set") {
  const next = {};
  const fields = { "--monthly": "monthlyUsd", "--daily": "dailyUsd", "--review-reserve": "reviewReserveUsd" };
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--pause") next.enabled = false;
    else if (args[i] === "--resume") next.enabled = true;
    else if (fields[args[i]] && args[i + 1] !== undefined) next[fields[args[i++]]] = Number(args[i]);
    else throw new Error(`Unknown budget setting ${args[i]}`);
  }
  console.log(JSON.stringify(await githubBudgetStore().configure(next), null, 2));
  console.log("Updated the live AI allowance; its history is public on the spending branch. No model call was made.");
} else if (command === "config") {
  const { enabled, monthlyUsd, dailyUsd, reviewReserveUsd, ...models } = AI_POLICY;
  console.log(JSON.stringify({ ...models, rates: undefined, initialBudget: { enabled, monthlyUsd, dailyUsd, reviewReserveUsd } }, null, 2));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,
    `operator_model=${AI_POLICY.operator.model}\noperator_effort=${AI_POLICY.operator.effort}\n`);
} else if (command === "status" || command === "init") {
  const store = githubBudgetStore();
  if (command === "init") await store.init();
  const report = await sharedBudget().status();
  const policy = report.policy;
  const t = report.totals;
  const text = [
    `AI allowance · ${report.month} (UTC admission dates)`, "",
    `Approved policy: ${policy.enabled ? "running" : "paused"}; main writer: ${policy.main.model} (${policy.main.effort}).`,
    `Month: ${dollars(t.month)} / $${policy.monthlyUsd}. Today: ${dollars(t.day)} / $${policy.dailyUsd}.`,
    `Included above: ${dollars(t.held)} held for requests without a settled receipt.`,
    `$${policy.reviewReserveUsd} of the monthly allowance is reserved for independent review.`, "",
    "| Work | Accounted + held |", "| --- | ---: |",
    ...Object.entries(t.byWorkload).map(([work, amount]) => `| ${work} | ${dollars(amount)} |`), "",
    `Public receipts: https://github.com/${process.env.GITHUB_REPOSITORY || "ejhong/aletheia"}/tree/${BUDGET_BRANCH}/months`,
    "Conservative recorded-tariff accounting starts with this integration. Earlier bills, subscriptions, and work outside these repository workers are not included.",
  ].join("\n");
  console.log(args.includes("--json") ? JSON.stringify(report, null, 2) : text);
  if (args.includes("--summary") && process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${text}\n`);
} else {
  throw new Error("Usage: npm run ai:budget -- [status [--json|--summary] | init | config | set --monthly 150 --daily 25 --review-reserve 30 [--pause|--resume]]");
}
