import { describe, expect, it } from "vitest";
import { FAILED_SITTING_TITLE, failedSittingNotice } from "../lib/failed-sitting.mjs";

/**
 * A failed sitting says so in an issue. The wording is the whole feature:
 * it must name the step that failed, say what became of the money and the
 * records, and give the one act that mends it (2026-09-28: three failures
 * in one sitting and nothing told anyone).
 */
describe("the notice a failed sitting posts", () => {
  const base = { runUrl: "https://github.com/o/r/actions/runs/1", date: "2026-09-28", founderLogin: "founder" };

  it("an expired token: nothing ran, nothing was spent, and the mend is named", () => {
    const n = failedSittingNotice({ ...base, steps: { token: "failure", chain: "skipped", pr: "skipped" } });
    expect(n.title).toBe("Loop failure: the sitting of 2026-09-28 did not finish");
    expect(n.title.startsWith(FAILED_SITTING_TITLE)).toBe(true);
    expect(n.body).toMatch(/MAINTENANCE_PAT` is expired or revoked/);
    expect(n.body).toMatch(/no model was called and nothing was spent/);
    expect(n.body).toMatch(/gh secret set MAINTENANCE_PAT/);
    expect(n.body).toContain("cc @founder");
    expect(n.body).toContain(base.runUrl);
  });

  it("a pull request that could not be opened: the branch that holds the records is named, or its absence said", () => {
    const pushed = failedSittingNotice({ ...base, steps: { token: "success", chain: "success", pr: "failure" }, branch: "chain/2026-09-28-36433402293" });
    expect(pushed.body).toMatch(/What it spent is spent/);
    expect(pushed.body).toContain("gh pr create --head chain/2026-09-28-36433402293 --label needs-approval");
    const unpushed = failedSittingNotice({ ...base, steps: { token: "success", chain: "success", pr: "failure" } });
    expect(unpushed.body).toMatch(/No branch for this run was found on the remote/);
  });

  it("a failed step of the sitting, and a failure outside it, are told apart", () => {
    expect(failedSittingNotice({ ...base, steps: { token: "success", chain: "failure", pr: "success" } }).body).toMatch(/A step of the sitting failed/);
    const outside = failedSittingNotice({ ...base, founderLogin: null, steps: {} });
    expect(outside.body).toMatch(/failed outside the sitting's own steps/);
    expect(outside.body).not.toContain("cc @");
    expect(outside.body).toContain("token check not run; the sitting not run; the pull request not run");
  });
});
