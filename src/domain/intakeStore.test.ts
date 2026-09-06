import { githubBudgetFetchFixture } from "./fixtures/aiBudget";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import {
  readIntakeDecisions,
  writeIntakeDecisions,
  INTAKE_DIR,
} from "../../scripts/lib/intake-store.mjs";
import {
  agendaContext,
  agendaScore,
  agendaWasProposed,
  readAgendaCandidates,
  readAgendaTallies,
} from "../../scripts/lib/intake-agenda.mjs";
import { renderProposalFile } from "../../scripts/lib/agenda-propose.mjs";
import {
  readIntakeMemory,
  watchCaseTriaged,
  intakeContext,
} from "../../scripts/lib/intake-memory.mjs";
import { resolveCaseDirectory } from "../../scripts/lib/case-snapshot.mjs";
import { migrateIntake } from "../../scripts/migrate-intake.mjs";
import { topicSeed } from "../../scripts/lib/topic-seed.mjs";

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => fs.rmSync(root, { recursive: true, force: true })),
);
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-decisions-"));
  roots.push(root);
  const write = (file: string, data: unknown) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), stringify(data));
  };
  write("content/cases/alpha/case.yaml", { id: "TEST-CASE", slug: "alpha" });
  write("content/cases/alpha/sources.yaml", []);
  return { root, write };
}
const stamp = {
  date: "2026-09-06",
  generatedAt: "2026-09-06T01:00:00.000Z",
  runId: "fixture-run",
  model: "fixture-model",
  promptVersion: "fixture-v1",
};
const source = {
  title: "Synthetic source for intake tests",
  url: "https://example.org/intake-test",
};
const archived = {
  ...stamp,
  case: "alpha",
  stage: "watch-triage",
  decision: "archive",
  source,
  reason: "Outside this case's scope.",
  inputHash: "old-inputs",
  details: { watchRunId: "watch-fixture" },
};
const proposal = {
  id: "fixture-run/alpha/1",
  caseSlug: "alpha",
  runDir: "fixture-run",
  index: 1,
  kind: "study",
  title: "A test of an earlier research idea",
  question: "Which independent controls can settle this question?",
  closestExisting: "TEST-R001 — the earlier comparison lacked controls",
  wouldSettle: "The result discriminates the competing explanations.",
  effortTier: "desk",
};

describe("durable intake history", () => {
  it("survives watch cleanup and preserves different cases, reasons, and inputs", () => {
    const { root, write } = fixture();
    write("proposals/watch/watch-fixture/alpha.yaml", { items: [source] });
    writeIntakeDecisions(root, [
      archived,
      archived,
      { ...archived, case: "beta" },
      { ...archived, reason: "A different objection." },
      { ...archived, inputHash: "changed-inputs" },
    ]);
    expect(readIntakeDecisions(root)).toHaveLength(4);
    expect(writeIntakeDecisions(root, [archived]).added).toBe(0);
    fs.rmSync(path.join(root, "proposals/watch"), { recursive: true });
    expect(
      intakeContext(source, "alpha", readIntakeMemory(root)).priorDecisions,
    ).toHaveLength(3);
    expect(
      readIntakeDecisions(root).some(
        (entry) => entry.reason === archived.reason,
      ),
    ).toBe(true);
  });

  it("concurrent writers preserve every decision and identical writes converge", async () => {
    const { root } = fixture();
    const storeModuleUrl = pathToFileURL(
      path.resolve("scripts/lib/intake-store.mjs"),
    ).href;
    const code = `import {writeIntakeDecisions} from ${JSON.stringify(storeModuleUrl)}; writeIntakeDecisions(process.argv[1], JSON.parse(process.argv[2]));`;
    const execute = promisify(execFile);
    await Promise.all([
      execute(process.execPath, [
        "--input-type=module",
        "-e",
        code,
        root,
        JSON.stringify([archived]),
      ]),
      execute(process.execPath, [
        "--input-type=module",
        "-e",
        code,
        root,
        JSON.stringify([archived, { ...archived, case: "beta" }]),
      ]),
    ]);
    expect(readIntakeDecisions(root)).toHaveLength(2);
    expect(
      fs
        .readdirSync(path.join(root, INTAKE_DIR))
        .every((file) => file.endsWith(".yaml")),
    ).toBe(true);
  });

  it("fails closed on corrupt history and invalid stage/outcome combinations", () => {
    const { root } = fixture();
    expect(() =>
      writeIntakeDecisions(root, [{ ...archived, decision: "promoted" }]),
    ).toThrow(/outcome/);
    const result = writeIntakeDecisions(root, [archived]);
    const file = path.join(root, result.file!);
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, "utf8")
        .replace(archived.reason, "An altered reason."),
    );
    expect(() => readIntakeDecisions(root)).toThrow(/hash mismatch/);
    expect(() =>
      writeIntakeDecisions(root, [{ ...archived, case: "beta" }]),
    ).toThrow(/hash mismatch/);
  });

  it("an operational failure leaves a watch case due for retry", () => {
    const { root } = fixture();
    writeIntakeDecisions(root, [
      { ...archived, decision: "failed", retryable: true },
    ]);
    expect(
      watchCaseTriaged(
        "watch-fixture",
        "alpha",
        [source],
        readIntakeDecisions(root),
      ),
    ).toBe(false);
  });

  it("records a zero-result reading and rests the same unchanged request on retry", () => {
    const { root, write } = fixture();
    for (const [file, value] of Object.entries(topicSeed({ id: "TST-001", slug: "alpha", title: "Synthetic fixture",
      question: "Does this synthetic source add an observation?", domain: "Tests only", date: "2026-09-06" })))
      fs.writeFileSync(path.join(root, "content/cases/alpha", file), value);
    write("proposals/inbox/fixture-run/sources-alpha.yaml", {
      kind: "source-proposals",
      case: "alpha",
      sources: [source],
    });
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      PATH: process.env.PATH,
      OPENAI_API_KEY: "fixture-only-never-used",
      BUDGET_GITHUB_TOKEN: "synthetic-only",
    };
    const preload = path.join(root, "mock-fetch.mjs");
    fs.writeFileSync(preload, `${githubBudgetFetchFixture()}globalThis.fetch = async (url, init) => {
      const accounting = await fixtureBudgetFetch(url, init);
      if (accounting) return accounting;
      if (String(url).includes("api.openai.com")) {
        const request = JSON.parse(init.body);
        return new Response(JSON.stringify({ id: "synthetic-response", model: request.model, status: "completed",
          usage: { input_tokens: 100, output_tokens: 50 }, output: [{ content: [{ type: "output_text",
            text: JSON.stringify({ outcome: "no_change", reason: "The synthetic text adds no useful observation." }) }] }] }));
      }
      return new Response("This is a synthetic source used only in a test. It contains no useful new observation, and is not a real publication.",
        { headers: { "content-type": "text/plain" } });
    };`);
    const run = () =>
      execFileSync(
        process.execPath,
        ["--import", preload, path.resolve("scripts/promote-imports.mjs")],
        { cwd: root, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] },
      );
    expect(run().trim()).toBe("0");
    expect(readIntakeDecisions(root)).toHaveLength(1);
    expect(readIntakeDecisions(root)[0]).toMatchObject({
      stage: "research-run",
      decision: "no_change",
    });
    expect(run().trim()).toBe("0");
    expect(readIntakeDecisions(root)).toHaveLength(1);
  });
});

describe("agenda reconsideration and review memory", () => {
  it("allows a revised argument under the same title and does not mistake a rename for new substance", () => {
    const { root } = fixture();
    writeIntakeDecisions(root, [
      {
        ...stamp,
        stage: "agenda-proposal",
        case: "alpha",
        decision: "proposed",
        proposal,
        inputHash: "old-inputs",
      },
    ]);
    const history = readIntakeDecisions(root);
    expect(
      agendaWasProposed(
        { ...proposal, title: "A different title" },
        "alpha",
        "old-inputs",
        history,
      ),
    ).toBe(true);
    expect(
      agendaWasProposed(
        {
          ...proposal,
          closestExisting:
            "TEST-R001 — a revised control answers the earlier objection",
        },
        "alpha",
        "old-inputs",
        history,
      ),
    ).toBe(false);
    expect(
      agendaWasProposed(proposal, "alpha", "changed-inputs", history),
    ).toBe(false);
    expect(agendaContext("alpha", history).entries[0].score).toBeNull();
  });

  it("keeps each seat's reason, enforces the score rubric, and detaches scores from an edited proposal", () => {
    const { root } = fixture();
    const review = ["a", "b", "c", "d", "e"].map((seat) => ({
      seat,
      score: "high",
      concern: null,
      reasoning: `Seat ${seat} explains its assessment.`,
    }));
    const score = {
      highs: 5,
      advances: true,
      concerns: [],
      seats: review.map((seat) => `${seat.seat}: high`),
    };
    const entry = {
      ...stamp,
      case: "alpha",
      stage: "agenda-score",
      decision: "scored",
      proposal,
      review,
      score,
    };
    writeIntakeDecisions(root, [entry]);
    const history = readIntakeDecisions(root);
    expect(agendaScore(proposal, history)?.review?.[0].reasoning).toBe(
      review[0].reasoning,
    );
    expect(
      agendaScore(
        { ...proposal, question: "An altered research question" },
        history,
      ),
    ).toBeNull();
    expect(() =>
      writeIntakeDecisions(root, [
        {
          ...entry,
          review: review.map((seat, index) =>
            index === 4
              ? { ...seat, concern: "A constitutional concern" }
              : seat,
          ),
        },
      ]),
    ).toThrow(/scores disagree/);
  });

  it("resolves a public case slug to its directory without changing historical attribution", () => {
    const { root, write } = fixture();
    write("content/cases/alpha/case.yaml", {
      id: "TEST-CASE",
      slug: "renamed-topic",
    });
    const renamed = { ...proposal, caseSlug: "renamed-topic" };
    writeIntakeDecisions(root, [
      {
        ...stamp,
        case: "alpha",
        stage: "agenda-proposal",
        decision: "proposed",
        proposal: renamed,
      },
    ]);
    expect(resolveCaseDirectory(root, "renamed-topic")).toBe("alpha");
    expect(
      agendaContext("renamed-topic", readIntakeDecisions(root)).total,
    ).toBe(1);
  });

  it("does not expose an incomplete panel as an actionable proposal score", () => {
    const { root } = fixture();
    const dir = path.join(root, "proposals/agenda/fixture-run");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "alpha.md"),
      renderProposalFile(
        "alpha",
        [
          {
            ...proposal,
            closestExisting: ["TEST-R001"],
            gap: "the earlier comparison lacked controls",
          },
        ],
        stamp,
      ),
    );
    const candidate = readAgendaCandidates(root)[0];
    const review = ["a", "b", "c", "d", "e"].map((seat, index) => ({
      seat,
      score: index < 3 ? "high" : null,
      concern: null,
      reasoning: index < 3 ? "A reason" : null,
    }));
    writeIntakeDecisions(root, [
      {
        ...stamp,
        case: "alpha",
        stage: "agenda-score",
        decision: "failed",
        proposal: candidate,
        retryable: true,
        reason: "Incomplete panel",
        review,
        score: {
          highs: 3,
          advances: false,
          concerns: [],
          seats: review.map(
            (seat) => `${seat.seat}: ${seat.score ?? "failed"}`,
          ),
        },
      },
    ]);
    expect(readIntakeDecisions(root)[0].review).toHaveLength(5);
    expect(readAgendaTallies(root)).toEqual([]);
  });
});

describe("migration replay", () => {
  function legacyFixture() {
    const setup = fixture();
    const original = {
      key: "url:https://example.org/intake-test",
      case: "alpha",
      ...source,
      date: "2026-09-01",
      reason: "Outside scope",
      triageRun: "legacy-run",
    };
    setup.write("proposals/watch/archive-ledger.yaml", { items: [original] });
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: setup.root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    git("init", "-q");
    git("add", ".");
    git(
      "-c",
      "user.name=Intake test",
      "-c",
      "user.email=intake-test@example.org",
      "commit",
      "-qm",
      "fixture",
    );
    return { ...setup, original, git };
  }

  it("preserves the committed row and unknown receipts, then retires the old store idempotently", () => {
    const { root, original, git } = legacyFixture();
    const before = git("rev-parse", "HEAD").trim();
    expect(migrateIntake(root, { write: true }).added).toBe(1);
    expect(
      fs.existsSync(path.join(root, "proposals/watch/archive-ledger.yaml")),
    ).toBe(false);
    const record = readIntakeDecisions(root)[0];
    expect(record.legacy).toMatchObject({ commit: before, record: original });
    expect(record.model).toBeNull();
    expect(record.inputHash).toBeNull();
    git("add", "-A");
    git(
      "-c",
      "user.name=Intake test",
      "-c",
      "user.email=intake-test@example.org",
      "commit",
      "-qm",
      "migration",
    );
    expect(migrateIntake(root, { write: true }).added).toBe(0);
    expect(readIntakeDecisions(root)).toHaveLength(1);
  });

  it("refuses to remove a legacy file that changed after the migration's committed basis", () => {
    const { root, original, write } = legacyFixture();
    write("proposals/watch/archive-ledger.yaml", {
      items: [original, { ...original, reason: "Later decision" }],
    });
    expect(() => migrateIntake(root, { write: true })).toThrow(
      /unrecorded decisions/,
    );
    expect(
      fs.existsSync(path.join(root, "proposals/watch/archive-ledger.yaml")),
    ).toBe(true);
    expect(readIntakeDecisions(root)).toHaveLength(0);
  });

  it("preserves a failed legacy case without marking its watch items triaged", () => {
    const { root, write, git } = legacyFixture();
    const failure = {
      case: "alpha",
      judged: false,
      errors: ["model reply could not be parsed"],
    };
    write("proposals/watch/watch-fixture/triage.yaml", {
      date: "2026-09-01",
      runId: "legacy-run",
      cases: [failure],
    });
    git("add", ".");
    git(
      "-c",
      "user.name=Intake test",
      "-c",
      "user.email=intake-test@example.org",
      "commit",
      "-qm",
      "failed triage fixture",
    );
    migrateIntake(root, { write: true });
    const decisions = readIntakeDecisions(root);
    expect(
      decisions.find((entry) => entry.decision === "failed"),
    ).toMatchObject({ retryable: true, legacy: { record: failure } });
    expect(
      watchCaseTriaged("watch-fixture", "alpha", [source], decisions),
    ).toBe(false);
  });

  it("requires consequential review to alter existing intake history", () => {
    const { root, git } = legacyFixture();
    const first = writeIntakeDecisions(root, [archived]);
    const commit = (message: string) => {
      git("add", "-A");
      git(
        "-c",
        "user.name=Intake test",
        "-c",
        "user.email=intake-test@example.org",
        "commit",
        "-qm",
        message,
      );
    };
    commit("initial decision");
    const base = git("rev-parse", "HEAD").trim();
    writeIntakeDecisions(root, [{ ...archived, case: "beta" }]);
    commit("new decision");
    const classify = () =>
      execFileSync(
        process.execPath,
        [path.resolve("scripts/classify-pr-risk.mjs"), base],
        { cwd: root, encoding: "utf8" },
      )
        .trim()
        .split("\n")
        .at(-1);
    expect(classify()).toBe("low-risk");
    fs.unlinkSync(path.join(root, first.file!));
    commit("remove history");
    expect(classify()).toBe("needs-approval");
  });
});
