// The weekly content-merge window, shared by the arbiter (scripts/arbiter.mjs) and the
// re-judging schedule (scripts/rejudge-parked.mjs): which landings on the base branch in
// the trailing week count against the autonomous lane, and which are excluded as supervised.
//
// --first-parent: one squash/merge = one landing on the base branch, so the budget counts
// what a reader saw change, not how many commits built it. Canon only: assessment overlays
// are mechanical and land every time a panel convenes. The window is the trailing week or
// the latest epoch, whichever is shorter; the epoch is the coarse remedy of last resort, the
// per-merge declaration below the fine one (the history of both is in scripts/arbiter.mjs
// and docs/DECISIONS.md).
import { execFileSync } from "node:child_process";
import { splitMergeLanes } from "../src/lib/arbiter-core.mjs";

export const GATE_EPOCH = Date.parse("2026-09-09T15:00:00Z");
export const CANON = ["content/cases/", ":(exclude)content/cases/*/assessments/**"];

/**
 * Merges declared supervised by hash — founder-directed construction landed without the
 * `Supervised-by:` trailer, whose messages, being immutable, cannot take it after the fact.
 * Each line names the squash commit, the PR, and the direction it answered.
 */
export const SUPERVISED_DECLARED = new Set([
  "2e1686b87afa5d250b98e1ab5f4aa177fdd0fed3", // #233 conjecture cards retired — founder: "please proceed", 2026-09-09
  "519d49c55036baba430f0d75327904b6c6b55df0", // #236 Deep Memory opens — founder: "and then deep memory", 2026-09-09
  "aa29f03dc2529c83bf34710f8f3dcd1f8b9d310e", // #238 second question-only edition — review note #237, in session
  "2639b9183935426ac50aa643f5ebfc569763d431", // #240 the drop on the founder's grant — founder: "Please make the drop", 2026-09-09
  "010aee324c1e1e22aff7fffcc1da09ab517eff48", // #241 image tooling and art — founder: "make the art and the plates", 2026-09-09
  "f07cf0ed0ab1b8c9fa6a49550bc7a758595476f8", // #243 plate captions — review note #242, in session
  "b46b3798bd5f9a1318350648d766b94dcc8ccf71", // #246 caption record, no second drop, opening tests — founder, in session
  "6f37578af34e2d372fd2681dc04b6c1c988cfe9a", // #249 the lab-site cover — founder: "switch it to that one", 2026-09-09
  "c28f3f064c8b809b01f14bdd2356e07982a25e05", // #250 five evidence corrections — founder: "do the pr to fix things", 2026-09-09
  // Two merges the founder made by hand on 2026-09-16 while the autonomous lane was at its cap, without the
  // trailer — founder, in session: "i merged them both by hand (forgot to add comment)". Both had passed the
  // panel (#305 5/5; #303 4/5 with a review note answered on the record) and were parked on the budget alone.
  "d91462670f5ff3916277fc68894aa56895a74851", // #305 provenance stamps stay only where they hold — founder hand merge, 2026-09-16
  "8fc3e2e3f41f62098160d5b0efadc32fca480b1f", // #303 chain sitting: immortality-key verify + edition, orch-or edition — founder hand merge, 2026-09-16
]);

/** The start of the window: seven days ago, or the epoch, whichever is later. */
export function windowSince(now = Date.now()) {
  return new Date(Math.max(now - 7 * 86400000, GATE_EPOCH)).toISOString();
}

/** The landings on `base` inside the window that touch canon, split into the autonomous and supervised lanes. */
export function mergeLanesOnBase(base, { cwd = process.cwd(), now = Date.now() } = {}) {
  // Hash + full message per commit, unit separator between fields and record separator between
  // commits: messages contain newlines and blank lines, so line-splitting cannot delimit them.
  const out = execFileSync("git", ["log", "--first-parent", `--since=${windowSince(now)}`, "--format=%H%x1f%B%x1e", base, "--", ...CANON], { cwd, encoding: "utf8" });
  const commits = out
    .split("\x1e")
    .map((rec) => {
      const [hash, message] = rec.replace(/^\s+/, "").split("\x1f");
      return { hash: (hash ?? "").trim(), message: message ?? "" };
    })
    .filter((c) => c.hash);
  return splitMergeLanes(commits, SUPERVISED_DECLARED);
}
