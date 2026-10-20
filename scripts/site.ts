#!/usr/bin/env node
/**
 * `site` — the engine's one command line: the tools the operator works with,
 * the checks CI runs, and the steps the workflows take. Run from the
 * repository root: `node scripts/site.ts <command> …`.
 *
 *   status [--json]                         where every case stands, and the money left
 *   read <url|doi> [--page N] [--find TEXT] [--from N] [--chars N] [--fresh]
 *                                           a source's text, as the quote check will read it
 *   ids <case> [claim|evidence|research|study] [count]
 *                                           the next free record ids for a case
 *   stamp <case>                            bind editions/new.yaml (and assessments/new.yaml) to the ledger
 *   archive <url>                           a Wayback Machine snapshot for a source's archivedUrl
 *   check-quotes [--base REF] [--head REF]  every quoted passage a change adds, found in its source (the review); --head
 *                                           reads the change from that commit instead of the working tree
 *   check-names                             no forbidden name (config/site.yaml) on the rendered site (CI)
 *   panel <case> [--seats a,b] [--dry-run]  the blind check: the panel judges the ledger as it stands
 *   review --base REF [--head REF] --title T [--body-file F] [--previous F | --previous-comments F] [--out F] [--json F]
 *                                           the review of a change (the gate; the review workflow), read from git
 *   guard-session --run ID                  the staged work of an operator session holds nothing only the founder or
 *                                           the engine writes (the workflow's publish job, from main's code)
 *   harvest                                 closed changes' reviews into governance/reviews/ (and their cost)
 *   budget [--cap|--line] [--ahead]         the budget as it stands; --cap prints what a session may spend, --line says it
 *                                           in a sentence; --ahead for a session started by hand, which runs ahead of the pace
 *   session-close --report F --run ID --subject S --model M --prompt-version V
 *                                           an operator session's run record and spend rows
 *   session-trace --run ID (--digest F | --summary)
 *                                           the digest of a session's trace (made on its machine by scripts/session-trace.ts),
 *                                           checked and kept as runs/<ID>/trace.yaml; --summary says it for the pull request
 *   plan-session [--rounds F]               the session's mode: answer a held change, or new work (the workflow)
 *   kickoff --run ID --mode M --cap N [--pr N --branch B --rounds F] [--case C] [--focus T]
 *                                           the session's first message (the workflow)
 *   log-meta --run ID                       a session log's front matter: title, cases, panel (the workflow)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { parse as parseYaml } from "yaml";
import { loadOperation } from "../src/domain/governance.ts";
import { guardSession, openChanges, planSession, roundsForOperator } from "../src/engine/operator.ts";
import { loadModels } from "../src/lib/models.mjs";
import { archiveUrl } from "../src/engine/archive.ts";
import { runCheck } from "../src/engine/check.ts";
import { harvest } from "../src/engine/harvest.ts";
import { nextIds, type Kind, KINDS } from "../src/engine/ids.ts";
import { formatQuoteCheck, quoteCheck } from "../src/engine/quotecheck.ts";
import { findInText, pagesOf, readSource } from "../src/engine/read.ts";
import { blobFromComment, reviewBlob, reviewComment, runReview } from "../src/engine/review.ts";
import { closeSession, traceSummary, writeTrace, type SessionReport } from "../src/engine/session.ts";
import { stamp } from "../src/engine/stamp.ts";
import { budgetLine, budgetState, formatStatus, siteStatus } from "../src/engine/status.ts";
import { site } from "../src/config/site.ts";

const [command, ...rest] = process.argv.slice(2);
const flags = new Map<string, string | true>();
const positional: string[] = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith("--")) {
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(a.slice(2), next);
      i++;
    } else flags.set(a.slice(2), true);
  } else positional.push(a);
}
const flag = (name: string): string | undefined => {
  const v = flags.get(name);
  return typeof v === "string" ? v : undefined;
};
const need = (name: string): string => {
  const v = flag(name);
  if (!v) {
    console.error(`--${name} is required`);
    process.exit(2);
  }
  return v;
};
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

async function main() {
  switch (command) {
    case "status": {
      const s = siteStatus();
      console.log(flags.has("json") ? JSON.stringify(s, null, 2) : formatStatus(s));
      return;
    }
    case "read": {
      const what = positional[0] ?? fail("usage: read <url|doi> [--page N] [--find TEXT] [--from N] [--chars N] [--fresh]");
      const target = /^10\.\d{4,9}\//.test(what) ? { doi: what } : { url: what };
      const r = await readSource(target, { fresh: flags.has("fresh") });
      if (!r.ok || r.text === null) fail(`not readable: ${r.reason}`);
      const text = r.text!;
      const pages = pagesOf(text);
      console.log(`# ${r.url}${r.via ? `\n# via: ${r.via}` : ""}${r.pageTitle ? `\n# title: ${r.pageTitle}` : ""}\n# ${text.length.toLocaleString("en-US")} characters${pages.size > 1 ? `, ${pages.size} pages ([p. N] markers)` : ""}${r.cached ? `; cached at ${r.cached}` : ""}\n`);
      const find = flag("find");
      if (find) {
        const hits = findInText(text, find);
        console.log(hits.length ? hits.map((h) => `[p. ${h.page}] …${h.excerpt}…`).join("\n\n") : `"${find}" does not occur in the text`);
        return;
      }
      const page = flag("page");
      if (page) {
        console.log(pages.get(Number(page)) ?? `no page ${page} (pages: ${[...pages.keys()].join(", ")})`);
        return;
      }
      const from = Number(flag("from") ?? 0);
      const chars = Number(flag("chars") ?? 12000);
      console.log(text.slice(from, from + chars));
      if (from + chars < text.length) console.log(`\n[… ${(text.length - from - chars).toLocaleString("en-US")} more characters: --from ${from + chars}]`);
      return;
    }
    case "ids": {
      const c = positional[0] ?? fail("usage: ids <case> [claim|evidence|research|study] [count]");
      const kinds = positional[1] ? [positional[1] as Kind] : (Object.keys(KINDS) as Kind[]);
      for (const k of kinds) console.log(`${k}: ${nextIds(c, k, Number(positional[2] ?? 1)).join(" ")}`);
      return;
    }
    case "stamp": {
      const c = positional[0] ?? fail("usage: stamp <case>");
      const models = loadModels();
      const r = stamp(c, {
        model: flag("model") ?? process.env.OPERATOR_MODEL ?? models.operator?.model ?? fail("no model: pass --model or set OPERATOR_MODEL"),
        promptVersion: flag("prompt-version") ?? process.env.OPERATOR_PROMPT_VERSION ?? fail("no prompt version: pass --prompt-version or set OPERATOR_PROMPT_VERSION"),
        producedBy: flag("session") ?? process.env.SESSION_RUN_ID ?? fail("no session: pass --session or set SESSION_RUN_ID"),
      });
      if (!r.ok) fail(`stamp refused:\n${r.errors.map((e) => `- ${e}`).join("\n")}`);
      console.log(`stamped: ${[r.assessment, r.edition].filter(Boolean).join(", ")}`);
      return;
    }
    case "archive": {
      const url = positional[0] ?? fail("usage: archive <url>");
      const a = await archiveUrl(url);
      console.log(a.archivedUrl ?? `no snapshot: ${a.note}`);
      return;
    }
    case "check-names": {
      // The names the rendered site must never contain (config/site.yaml, `forbiddenNames`), in any casing.
      const names = site.forbiddenNames.map((n) => n.toLowerCase());
      const hits: string[] = [];
      const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = `${dir}/${e.name}`;
          if (e.isDirectory()) walk(p);
          else if (!/\.(png|jpe?g|gif|webp|ico|pdf|woff2?)$/i.test(e.name)) {
            const text = fs.readFileSync(p, "utf8").toLowerCase();
            for (const n of names) if (text.includes(n)) hits.push(`${p}: contains "${n}"`);
          }
        }
      };
      if (names.length) for (const d of ["content", "src", "app", "public"]) walk(d);
      console.log(hits.length ? hits.join("\n") : `no forbidden name in content/, src/, app/, public/ (${names.length} checked)`);
      if (hits.length) process.exit(1);
      return;
    }
    case "check-quotes": {
      const r = await quoteCheck({ base: flag("base") ?? "origin/main", head: flag("head") });
      console.log(formatQuoteCheck(r));
      if (r.failures.length) process.exit(1);
      return;
    }
    case "guard-session": {
      // The session's work, staged in a fresh tree by the publish job: data, checked by main's code before any of it is published.
      const run = need("run");
      const files = execFileSync("git", ["diff", "--cached", "--name-status", "--no-renames"], { encoding: "utf8" })
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [status, file] = line.split("\t");
          return { status: status[0], file };
        });
      const problems = guardSession(files, (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null), run);
      if (problems.length) {
        console.log(`The session's work holds what only the founder or the engine writes, so none of it is published:\n${problems.map((p) => `- ${p}`).join("\n")}`);
        process.exit(1);
      }
      console.log(`${files.length} file(s) changed; none of them is the founder's or the engine's to write.`);
      return;
    }
    case "panel": {
      const c = positional[0] ?? fail("usage: panel <case> [--seats a,b] [--dry-run]");
      if (loadOperation().state !== "live" && !flags.has("even-if-paused")) fail("governance/operation.yaml says paused; the panel does not sit");
      const seats = flag("seats")?.split(",").filter(Boolean);
      const r = await runCheck(c, { ...(seats ? { seats } : {}), dryRun: flags.has("dry-run") });
      console.log(`${r.outcome}: ${r.reason ?? ""}`);
      if (r.outcome === "failed") process.exit(1);
      return;
    }
    case "review": {
      // Earlier rounds: their machine records, given directly (--previous) or as the PR's comment bodies (--previous-comments).
      const read = (f: string | undefined) => (f && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);
      const previous = read(flag("previous")) ?? ((read(flag("previous-comments")) as string[] | null) ?? []).map(blobFromComment).filter(Boolean);
      const r = await runReview({
        root: process.cwd(),
        base: need("base"),
        head: flag("head"),
        title: need("title"),
        body: flag("body-file") && fs.existsSync(flag("body-file")!) ? fs.readFileSync(flag("body-file")!, "utf8") : "",
        previous,
        siteName: site.name,
      });
      const comment = reviewComment(r);
      if (flag("out")) fs.writeFileSync(flag("out")!, comment);
      if (flag("json")) fs.writeFileSync(flag("json")!, JSON.stringify(reviewBlob(r), null, 2));
      console.log(`${r.tally.outcome}: ${r.tally.reason}`);
      // The exit code is the gate: only a change the reviewers judge better publishes.
      if (r.tally.outcome !== "publish") process.exit(1);
      return;
    }
    case "harvest": {
      const written = harvest();
      console.log(written.length ? written.join("\n") : "nothing new to harvest");
      return;
    }
    case "budget": {
      const b = budgetState(undefined, undefined, { ahead: flags.has("ahead") });
      console.log(flags.has("cap") ? b.sessionCap.toFixed(2) : flags.has("line") ? budgetLine(b) : JSON.stringify(b, null, 2));
      return;
    }
    case "plan-session": {
      // The session's mode, before the operator starts: answer a held change, else new work; withdraw what was
      // answered twice without publishing (src/engine/operator.ts).
      const plan = planSession(openChanges());
      for (const c of plan.withdraw) {
        execFileSync("gh", ["pr", "close", String(c.number), "--comment", `Withdrawn: reviewed ${c.rounds.length} times without being judged better (the last round: ${c.rounds.at(-1)!.reason}). The branch and every review stay on the record; a later session may take the work up again from what the reviewers said. (src/engine/operator.ts)`], { stdio: "inherit" });
      }
      if (plan.mode === "answer") fs.writeFileSync(flag("rounds") ?? "review-rounds.md", roundsForOperator(plan.change));
      console.log(JSON.stringify(plan.mode === "answer" ? { mode: "answer", pr: plan.change.number, branch: plan.change.branch } : { mode: "new", waiting: plan.waiting }));
      return;
    }
    case "kickoff": {
      // The session's first message: what it is for and what it may spend. Its standing instructions are the charter.
      const mode = need("mode");
      const rounds = flag("rounds") && fs.existsSync(flag("rounds")!) ? fs.readFileSync(flag("rounds")!, "utf8") : "";
      const lines = [
        `This is operator session ${need("run")} on ${site.name}, ${new Date().toISOString().slice(0, 10)}. Your standing instructions are operator/charter.md and config/site-rules.md, which you have.`,
        mode === "answer"
          ? `This session answers the review of your change #${need("pr")} (branch ${need("branch")}, checked out). Read every round below, answer each harm and note — by a fix or by a reasoned reply in your log — and change nothing else.`
          : `This session is new work.${flag("case") ? ` The founder asks for work on the case ${flag("case")}.` : " Choose it by the charter."}${flag("focus") ? ` The founder's focus: ${flag("focus")}` : ""}`,
        `You may spend up to $${need("cap")}; the session ends at the cap.`,
        `Begin with \`node scripts/site.ts status\`. Write your log at runs/${need("run")}/log.md, its front matter first. You do not commit, push or open pull requests: when you finish, the workflow records your session, convenes the panel on any case your log names under \`panel:\`, and opens the pull request with your log as its description.`,
      ];
      console.log(lines.join("\n\n") + (rounds ? `\n\n## The review rounds\n\n${rounds}` : ""));
      return;
    }
    case "log-meta": {
      // A session log's front matter, for the workflow: the pull request's title, the cases, the panel asked for.
      const file = `runs/${need("run")}/log.md`;
      const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      const m = /^---\n([\s\S]*?)\n---/.exec(text);
      const meta = (m ? parseYaml(m[1]) : {}) as { title?: string; cases?: string[]; panel?: string[] };
      console.log(JSON.stringify({ title: meta.title ?? null, cases: meta.cases ?? [], panel: meta.panel ?? [] }));
      return;
    }
    case "session-close": {
      const report = JSON.parse(fs.readFileSync(need("report"), "utf8")) as SessionReport;
      const r = closeSession({
        runId: need("run"),
        date: new Date().toISOString().slice(0, 10),
        subject: flag("subject") ?? "site",
        model: need("model"),
        promptVersion: need("prompt-version"),
        report,
      });
      console.log(`${r.files.join("\n")}\ncost: ${r.usd === null ? "unpriced" : `$${r.usd.toFixed(2)}`}`);
      return;
    }
    case "session-trace": {
      // The digest arrives from the session's machine: data, kept only once main's schema finds it a digest.
      const run = need("run");
      if (flags.has("summary")) {
        console.log(traceSummary(run));
        return;
      }
      console.log(writeTrace(run, JSON.parse(fs.readFileSync(need("digest"), "utf8"))));
      return;
    }
    default:
      {
        const own = fs.readFileSync(new URL(import.meta.url), "utf8").split("\n");
        console.error(own.slice(2, own.findIndex((l) => l.startsWith(" */"))).join("\n").replace(/^ \* ?/gm, ""));
      }
      process.exit(command ? 2 : 0);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
