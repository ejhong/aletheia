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
 *   check-quotes [--base REF]               every quoted passage a change adds, found in its source (CI)
 *   panel <case> [--seats a,b] [--dry-run]  the blind check: the panel judges the ledger as it stands
 *   review --base REF --title T [--body-file F] [--previous F] [--out F] [--json F]
 *                                           the review of a change (the gate; the review workflow)
 *   harvest                                 closed changes' reviews into governance/reviews/ (and their cost)
 *   budget [--cap]                          the budget as it stands; --cap prints what a session may spend
 *   session-close --report F --run ID --subject S --model M --prompt-version V
 *                                           an operator session's run record and spend rows
 */
import fs from "node:fs";
import { loadOperation } from "../src/domain/governance.ts";
import { loadModels } from "../src/lib/models.mjs";
import { archiveUrl } from "../src/engine/archive.ts";
import { runCheck } from "../src/engine/check.ts";
import { harvest } from "../src/engine/harvest.ts";
import { nextIds, type Kind, KINDS } from "../src/engine/ids.ts";
import { formatQuoteCheck, quoteCheck } from "../src/engine/quotecheck.ts";
import { findInText, pagesOf, readSource } from "../src/engine/read.ts";
import { reviewBlob, reviewComment, runReview } from "../src/engine/review.ts";
import { closeSession, type SessionReport } from "../src/engine/session.ts";
import { stamp } from "../src/engine/stamp.ts";
import { budgetState, formatStatus, siteStatus } from "../src/engine/status.ts";
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
    case "check-quotes": {
      const r = await quoteCheck({ base: flag("base") ?? "origin/main" });
      console.log(formatQuoteCheck(r));
      if (r.failures.length) process.exit(1);
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
      const previous = flag("previous") && fs.existsSync(flag("previous")!) ? JSON.parse(fs.readFileSync(flag("previous")!, "utf8")) : [];
      const r = await runReview({
        root: process.cwd(),
        base: need("base"),
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
      const b = budgetState();
      console.log(flags.has("cap") ? b.sessionCap.toFixed(2) : JSON.stringify(b, null, 2));
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
    default:
      console.error(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(2, 26).join("\n").replace(/^ \* ?/gm, ""));
      process.exit(command ? 2 : 0);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
