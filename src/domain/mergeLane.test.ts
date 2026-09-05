import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * The low-risk lane is the one place where a machine merges to main without
 * a human tap, so the guard on it is the highest-risk line in the repository:
 * every condition removed from it widens who may merge, and nothing else
 * would notice. These tests read the workflow as data and assert the guard
 * is intact — a future edit that drops a condition has to fail here rather
 * than pass quietly and let, say, a fork PR arm its own merge.
 */
type Step = {
  name?: string;
  if?: string;
  env?: Record<string, string>;
  run?: string;
};
const workflow = parse(
  readFileSync(new URL("../../.github/workflows/pr-risk-check.yml", import.meta.url), "utf8"),
) as {
  on: { pull_request: { types: string[] } };
  permissions: Record<string, string>;
  jobs: { classify: { steps: Step[] } };
};
const steps = workflow.jobs.classify.steps;
const arm = steps.find((s) => s.name === "Arm the low-risk lane") as Step;
const guard = arm.if ?? "";

describe("the low-risk merge lane", () => {
  it("arms only what the classifier certifies as low-risk", () => {
    expect(guard).toContain("steps.risk.outputs.class == 'low-risk'");
  });

  it("never arms a fork PR", () => {
    expect(guard).toContain("github.event.pull_request.head.repo.fork == false");
  });

  it("never arms a PR from an author without write access", () => {
    expect(guard).toContain("author_association");
    expect(guard).toContain('fromJSON(\'["OWNER","MEMBER","COLLABORATOR"]\')');
  });

  it("never arms a draft", () => {
    expect(guard).toContain("github.event.pull_request.draft == false");
  });

  it("treats a needs-approval label as a hold the classifier cannot override", () => {
    expect(guard).toMatch(/!contains\(github\.event\.pull_request\.labels\.\*\.name, 'needs-approval'\)/);
  });

  it("does not inherit the implicit success() gate it overrode", () => {
    // A step with a custom `if` runs even after an earlier step failed, so
    // the mislabel enforcement above would stop failing closed without this.
    expect(guard).toContain("success()");
  });

  it("reaches a PR that turns low-risk after it was opened", () => {
    // The gap this closed: arming used to happen only at creation, so a
    // low-risk PR opened any other way sat open with nothing watching it.
    for (const type of ["opened", "labeled", "ready_for_review", "synchronize"])
      expect(workflow.on.pull_request.types).toContain(type);
  });

  it("keeps the job's own token read-only", () => {
    // The merge authenticates with the maintenance PAT; if the job token
    // were writable, a future step could merge without that deliberate act.
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(arm.env?.GH_TOKEN).toBe("${{ secrets.MAINTENANCE_PAT }}");
  });

  it("merges directly only when no check has failed", () => {
    const run = arm.run ?? "";
    expect(run).toContain("clean status");
    expect(run).toMatch(/failed" != "0"/);
    // The direct merge is the last thing the step may do.
    expect(run.trimEnd().endsWith("gh pr merge --squash \"$PR\"")).toBe(true);
  });

  it("reads a check run that has not finished from .status, not .conclusion", () => {
    // A running check run reports conclusion: null, so a chain that stops at
    // .state scores it as a non-passing state and refuses a merge GitHub has
    // already declared clean — the sitting PR again, by a different route.
    expect(arm.run ?? "").toContain(".conclusion // .state // .status //");
    for (const pending of ["PENDING", "QUEUED", "IN_PROGRESS"])
      expect(arm.run ?? "").toContain(pending);
  });
});
