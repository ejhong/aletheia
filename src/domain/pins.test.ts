import { describe, expect, it } from "vitest";
import { pinIntegrityErrors } from "./pins";
import { PinSchema, type Claim, type Pin } from "./schema";

const claim = (over: Partial<Claim>): Claim =>
  ({
    id: "TST-C001",
    statement: "A test claim statement long enough to validate.",
    plainLanguage: "A plain-language gloss.",
    theme: "test",
    rung: "observation",
    tier: "featured",
    claimType: "observation",
    importance: "major",
    reviewState: "ai_extracted",
    origin: { ref: "test", extractedBy: "test", runId: "t", date: "2026-09-01" },
    ...over,
  }) as Claim;

const pin = (over: Partial<Pin>): Pin =>
  PinSchema.parse({
    id: "TST-PIN001",
    kind: "correction",
    statement: "The banked commitment this pin enforces, stated plainly.",
    origin: { date: "2026-09-01", ref: "unit test", attribution: "test" },
    checks: [],
    ...over,
  });

describe("pin integrity (the regression exam)", () => {
  it("passes when pinned strings and claims are intact", () => {
    const errors = pinIntegrityErrors({
      pins: [
        pin({
          checks: [
            { type: "claim_featured", claimId: "TST-C001" },
            {
              type: "string_present",
              file: "overview.md",
              value: "the hard-won correction",
            },
            {
              type: "string_absent",
              file: "overview.md",
              value: "the debunked misquote",
            },
          ],
        }),
      ],
      claims: [claim({})],
      files: { "overview.md": "An article containing the hard-won correction." },
    });
    expect(errors).toEqual([]);
  });

  it("survives YAML folding and prose reflow — words exact, whitespace free", () => {
    const errors = pinIntegrityErrors({
      pins: [
        pin({
          checks: [
            {
              type: "string_present",
              file: "evidence.yaml",
              value: "reasonable to attribute these anomalies to emulsion defects",
            },
          ],
        }),
      ],
      claims: [],
      files: {
        "evidence.yaml":
          'and "in\n    my experience, it is reasonable to attribute these anomalies to\n    emulsion defects," noting',
      },
    });
    expect(errors).toEqual([]);
  });

  it("fails when a rewrite drops a pinned string", () => {
    const errors = pinIntegrityErrors({
      pins: [
        pin({
          checks: [
            {
              type: "string_present",
              file: "overview.md",
              value: "the hard-won correction",
            },
          ],
        }),
      ],
      claims: [],
      files: { "overview.md": "A beautiful redraft that lost the lesson." },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("no longer contains");
  });

  it("fails when pinned-absent text sneaks back in", () => {
    const errors = pinIntegrityErrors({
      pins: [
        pin({
          checks: [
            {
              type: "string_absent",
              file: "claims.yaml",
              value: "the debunked misquote",
            },
          ],
        }),
      ],
      claims: [],
      files: { "claims.yaml": "…quoting the debunked misquote again…" },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("pinned-absent");
  });

  it("fails when a pinned claim is demoted, rejected, or missing", () => {
    const pins = [
      pin({ checks: [{ type: "claim_featured", claimId: "TST-C001" }] }),
    ];
    expect(
      pinIntegrityErrors({
        pins,
        claims: [claim({ tier: "catalog" })],
        files: {},
      })[0],
    ).toContain("lost featured tier");
    expect(
      pinIntegrityErrors({
        pins,
        claims: [claim({ reviewState: "rejected" })],
        files: {},
      })[0],
    ).toContain("rejected");
    expect(
      pinIntegrityErrors({ pins, claims: [], files: {} })[0],
    ).toContain("does not exist");
  });

  it("fails loudly when the pinned file itself is gone", () => {
    const errors = pinIntegrityErrors({
      pins: [
        pin({
          checks: [
            {
              type: "string_present",
              file: "research.yaml",
              value: "a pinned research commitment",
            },
          ],
        }),
      ],
      claims: [],
      files: {},
    });
    expect(errors[0]).toContain("missing from the case");
  });

  it("schema rejects pins with trivially short check strings", () => {
    expect(() =>
      PinSchema.parse({
        id: "TST-PIN002",
        kind: "directive",
        statement: "A directive statement long enough to validate.",
        origin: { date: "2026-09-01", ref: "unit test", attribution: "test" },
        checks: [{ type: "string_present", file: "overview.md", value: "short" }],
      }),
    ).toThrow();
  });
});
