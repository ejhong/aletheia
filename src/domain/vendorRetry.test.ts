import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../../scripts/lib/vendors.mjs";

/**
 * fetchWithRetry guards every vendor seat call: two consecutive panel runs
 * each lost a paid seat to transient runner-to-edge failures (an HTTP 520,
 * then a socket-level "fetch failed"). These tests pin the retry contract:
 * transient classes retry with backoff, everything else passes through.
 */

const ok = { ok: true, status: 200 } as Response;
const status = (s: number) => ({ ok: false, status: s }) as Response;
const networkError = () =>
  Object.assign(new TypeError("fetch failed"), {
    cause: new Error("ECONNRESET"),
  });

async function run(mock: ReturnType<typeof vi.fn>, attempts?: number) {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", mock);
  const p = fetchWithRetry("venice", "https://example.test", {}, attempts);
  // Silence expected rejections so the timer loop never sees an unhandled one.
  p.catch(() => {});
  await vi.runAllTimersAsync();
  return p;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("vendor fetch retry", () => {
  it("returns a first-try success without retrying", async () => {
    const mock = vi.fn().mockResolvedValue(ok);
    expect(await run(mock)).toBe(ok);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("retries a network-level fetch failure and succeeds", async () => {
    const mock = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue(ok);
    expect(await run(mock)).toBe(ok);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("retries HTTP 5xx and 429", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(status(520))
      .mockResolvedValueOnce(status(429))
      .mockResolvedValue(ok);
    expect(await run(mock)).toBe(ok);
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("does not retry other HTTP errors — the caller judges them", async () => {
    const mock = vi.fn().mockResolvedValue(status(401));
    expect(await run(mock)).toEqual(status(401));
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("returns the last 5xx response once attempts are exhausted", async () => {
    const mock = vi.fn().mockResolvedValue(status(520));
    expect(await run(mock)).toEqual(status(520));
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a deadline timeout", async () => {
    const timeout = Object.assign(new Error("timed out"), {
      name: "TimeoutError",
    });
    const mock = vi.fn().mockRejectedValue(timeout);
    await expect(run(mock)).rejects.toBe(timeout);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting attempts on persistent network failure", async () => {
    const mock = vi.fn().mockRejectedValue(networkError());
    await expect(run(mock)).rejects.toThrow(/after 3 attempts.*ECONNRESET/);
    expect(mock).toHaveBeenCalledTimes(3);
  });
});
