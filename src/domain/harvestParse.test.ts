import { describe, expect, it } from "vitest";
import { parseLegacyArbiterComment } from "../../scripts/lib/harvest-parse.mjs";

/** Trimmed from the real pre-blob report format the first arbiter posted. */
const LEGACY = `<!-- aletheia-arbiter -->
## Constitutional arbiter — 🅿️ PARKED

**only 2 of 5 seats affirm compliance (4 required).**

Panel (aletheia-arbiter-v1, judged against \`AGENTS.md\` at \`cee34815d1\`):

| Seat | Vote | Rules cited |
|---|---|---|
| Opus 5 (Anthropic) | complies | — |
| Grok 4.6 (xAI) | unsure | §3.15 |

<details><summary><b>Opus 5 (Anthropic)</b> — complies</summary>

The visible pieces implement the mechanism faithfully.

</details>
<details><summary><b>Grok 4.6 (xAI)</b> — unsure</summary>

The omitted-files list is non-empty.

</details>`;

describe("parseLegacyArbiterComment", () => {
  it("reconstructs verdict, provenance and seats from the markdown", () => {
    const r = parseLegacyArbiterComment(LEGACY)!;
    expect(r.verdict).toBe("park");
    expect(r.judgedAgainst).toBe("cee34815d1");
    expect(r.promptVersion).toBe("aletheia-arbiter-v1");
    expect(r.seats).toHaveLength(2);
    expect(r.seats[1]).toMatchObject({ vote: "unsure", rules: ["§3.15"] });
    expect(r.seats[0].reasoning).toMatch(/faithfully/);
  });

  it("fails closed on anything that is not an arbiter report", () => {
    expect(parseLegacyArbiterComment("just a comment")).toBeNull();
    expect(parseLegacyArbiterComment("## Constitutional arbiter — ✅ PASS\nno table")).toBeNull();
  });
});
