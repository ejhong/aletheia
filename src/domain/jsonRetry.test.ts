import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { anthropicJson } from "../pipeline/models.ts";

/** A strict structured-output reply that is not JSON (2026-09-16: the fallback
 *  model answered a verify split with a truncated array, and that one reply
 *  ended the sitting). The transport asks once more with the schema as
 *  instructions and says so; a second bad reply fails the call, quoting what
 *  came back. Both calls are billed — the ledger first, whatever the reply. */

const ev = (type: string, body: object) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...body })}\n\n`;
const streamed = (text: string) =>
  new Response(
    ev("message_start", {
      message: {
        id: "msg_1",
        model: "claude-test",
        stop_reason: null,
        content: [],
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    }) +
      ev("content_block_start", {
        index: 0,
        content_block: { type: "text", text: "" },
      }) +
      ev("content_block_delta", {
        index: 0,
        delta: { type: "text_delta", text },
      }) +
      ev("content_block_stop", { index: 0 }) +
      ev("message_delta", {
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 5 },
      }) +
      ev("message_stop", {}),
    { status: 200 },
  );

const opts = {
  model: "claude-test",
  system: "Split the statement into its propositions.",
  user: "one compound statement",
  schema: {
    type: "object",
    properties: { parts: { type: "array", items: { type: "string" } } },
    required: ["parts"],
    additionalProperties: false,
  },
};

let root = "";
const meter = () => ({
  runId: "test-run",
  verb: "verify" as const,
  case: null,
  root,
});

/** Each fetch answers with the next reply; the last one repeats. A bare root has no tariffs, so the budget gate is told to let an unpriced call through. */
function arrange(replies: string[]) {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-json-retry-"));
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("ALETHEIA_ALLOW_UNPRICED", "1");
  vi.spyOn(console, "error").mockImplementation(() => {});
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return streamed(replies[Math.min(bodies.length, replies.length) - 1]);
    }),
  );
  return bodies;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

describe("anthropicJson when the strict reply is not JSON", () => {
  it("asks once more with the schema as instructions, returns that reply as non-strict, and bills both calls", async () => {
    const bodies = arrange(['{"parts": ["a", "b"', '{"parts": ["a", "b"]}']);
    const r = await anthropicJson<{ parts: string[] }>(opts, meter());
    expect(r.data).toEqual({ parts: ["a", "b"] });
    expect(r.strict).toBe(false);
    expect(bodies).toHaveLength(2);
    expect(
      (bodies[0].output_config as { format?: unknown }).format,
    ).toBeDefined();
    expect(
      (bodies[1].output_config as { format?: unknown }).format,
    ).toBeUndefined();
    expect(String(bodies[1].system)).toContain("JSON Schema");
    const rows = parse(
      fs.readFileSync(path.join(root, "governance", "spend.yaml"), "utf8"),
    ) as { runId: string }[];
    expect(rows.map((x) => x.runId)).toEqual(["test-run", "test-run"]);
  });

  it("fails on a second bad reply and quotes what came back", async () => {
    const bodies = arrange([
      '{"parts": ["a"',
      "Here is the split, in prose: a, then b.",
    ]);
    await expect(anthropicJson(opts, meter())).rejects.toThrow(
      /not the JSON the schema demanded, twice .*Here is the split, in prose/,
    );
    expect(bodies).toHaveLength(2);
  });
});
