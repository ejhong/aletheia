/**
 * What a failed sitting says, as the text of one issue (scripts/
 * report-failed-sitting.mjs posts it). Pure, so the wording is tested.
 *
 * The loop ran unattended for three weeks with no way to say it had
 * stopped: on 2026-09-28 the scheduled sitting failed at its last step, its
 * records sat on a branch with no pull request, and nothing told anyone.
 * The notice names the step that failed, what it means for the money and
 * the records, and the one act that mends it.
 *
 * @param {{ runUrl: string, date: string, steps: { token?: string, chain?: string, pr?: string }, branch?: string | null, founderLogin?: string | null }} p
 * @returns {{ title: string, body: string }}
 */
export function failedSittingNotice({ runUrl, date, steps, branch = null, founderLogin = null }) {
  const lines = [];
  if (steps.token === "failure") {
    lines.push(
      "**The token that opens the sitting's pull request was refused.** `MAINTENANCE_PAT` is expired or revoked. The sitting did not start: no model was called and nothing was spent.",
      "",
      "To mend it: create a fine-grained token for this repository with read and write access to contents and pull requests, store it with `gh secret set MAINTENANCE_PAT`, and run the Chain workflow again. Until then no sitting runs, and a passing change is not merged on its own.",
    );
  } else if (steps.pr === "failure") {
    lines.push(
      "**The sitting ran, and its pull request could not be opened.** What it spent is spent; its records are not on `main` and the panel has not seen them.",
      "",
      branch
        ? `Its records are on the branch \`${branch}\`. To put them before the panel: \`gh pr create --head ${branch} --label needs-approval\`.`
        : "No branch for this run was found on the remote: the step failed before the push, and the run log is the only record of what the sitting did.",
    );
  } else if (steps.chain === "failure") {
    lines.push(
      "**A step of the sitting failed.** The sitting stops at the first step that does not complete; what it wrote before that, and every spend row, is in the pull request it opened.",
      "",
      "The run log names the verb and the reason (a cap reached, a vendor refusing, a record that would not validate).",
    );
  } else {
    lines.push("**The workflow failed outside the sitting's own steps** (checkout, install, or the harvest). The run log says where.");
  }
  lines.push("", `Run: ${runUrl}`, `Steps: token check ${steps.token ?? "not run"}; the sitting ${steps.chain ?? "not run"}; the pull request ${steps.pr ?? "not run"}.`);
  if (founderLogin) lines.push("", `cc @${founderLogin}`);
  return { title: `Loop failure: the sitting of ${date} did not finish`, body: lines.join("\n") };
}

/** The title prefix every such issue carries; one is open at a time, and a later failure is a comment on it. */
export const FAILED_SITTING_TITLE = "Loop failure:";
