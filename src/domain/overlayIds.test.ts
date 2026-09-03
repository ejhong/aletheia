import { describe, expect, it } from "vitest";
import { hhmmssUTC, overlayRunId } from "../../scripts/lib/overlay-ids.mjs";

/**
 * These are the invariants PR #156 broke, so the tests are written as the
 * two failure modes rather than as a description of the format: an id that
 * is not unique across branches collides on merge and mints two panel runs
 * under one runId, and an id that is not monotonic makes the loader's
 * same-date tie-break rank the older overlay newer.
 */
const at = (iso: string) => new Date(iso);

describe("overlayRunId", () => {
  it("is unique across concurrent runs that cannot see each other's files", () => {
    // The #156 scenario: two runs, each branching off a main where no such
    // overlay exists, so each one's local probe says "free".
    const a = overlayRunId(["2026-09-03", "check", "gpt"], {
      now: at("2026-09-03T04:19:53Z"),
      exists: () => false,
    });
    const b = overlayRunId(["2026-09-03", "check", "gpt"], {
      now: at("2026-09-03T09:44:57Z"),
      exists: () => false,
    });
    expect(a).not.toBe(b);
  });

  it("is monotonic: a later id sorts after an earlier one on the same date", () => {
    const morning = overlayRunId(["2026-09-03", "auto"], { now: at("2026-09-03T04:19:53Z") });
    const evening = overlayRunId(["2026-09-03", "auto"], { now: at("2026-09-03T21:47:19Z") });
    expect(evening > morning).toBe(true);
    // Sorting a shuffled batch must recover chronological order, which is
    // exactly what latestCheckPerModel relies on.
    expect([evening, morning].sort()).toEqual([morning, evening]);
  });

  it("sorts after a legacy unsuffixed id sharing its prefix", () => {
    const legacy = "2026-09-03-check-gpt";
    const fresh = overlayRunId(["2026-09-03", "check", "gpt"], {
      now: at("2026-09-03T00:00:01Z"),
    });
    expect(fresh > legacy).toBe(true);
  });

  it("keeps the date as the first ten characters", () => {
    const id = overlayRunId(["2026-09-03", "check", "kimi"], {
      now: at("2026-09-03T12:47:00Z"),
    });
    expect(id.slice(0, 10)).toBe("2026-09-03");
    expect(id).toBe("2026-09-03-check-kimi-124700");
  });

  it("falls back to -r2, -r3 only for a same-second collision in one tree", () => {
    const now = at("2026-09-03T12:47:00Z");
    const taken = new Set(["2026-09-03-auto-124700", "2026-09-03-auto-124700-r2"]);
    expect(overlayRunId(["2026-09-03", "auto"], { now, exists: (id) => taken.has(id) })).toBe(
      "2026-09-03-auto-124700-r3",
    );
    // And the suffixed fallback stays monotonic against its own stem.
    expect("2026-09-03-auto-124700-r3" > "2026-09-03-auto-124700").toBe(true);
  });
});

describe("hhmmssUTC", () => {
  it("is UTC, zero-padded, and separator-free so it sorts lexically", () => {
    expect(hhmmssUTC(at("2026-09-03T04:07:09Z"))).toBe("040709");
    expect(hhmmssUTC(at("2026-09-03T23:59:59Z"))).toBe("235959");
    expect(hhmmssUTC(at("2026-09-03T04:07:09Z")) < hhmmssUTC(at("2026-09-03T23:59:59Z"))).toBe(
      true,
    );
  });

  it("ignores local timezone, so runners in different zones stay comparable", () => {
    // Same instant, two offsets: the id must not depend on the runner.
    expect(hhmmssUTC(at("2026-09-03T12:00:00Z"))).toBe(
      hhmmssUTC(at("2026-09-03T14:00:00+02:00")),
    );
  });
});
