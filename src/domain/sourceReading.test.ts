import { githubBudgetFetchFixture, testBudget } from "./fixtures/aiBudget";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { topicSeed } from "../../scripts/lib/topic-seed.mjs";
import { extractSourceText, locatePassage, retrieveSource, sha256 } from "../../scripts/lib/source-passages.mjs";
import { createResearchBudget, boundedCompletion, RESEARCH_MODELS } from "../../scripts/lib/bounded-model.mjs";
import { proposeSourceReading } from "../../scripts/lib/source-reader";
import { loadCase } from "./load";
import { readIntakeDecisions } from "../../scripts/lib/intake-store.mjs";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function emptyCase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-reading-test-"));
  roots.push(dir);
  for (const [file, value] of Object.entries(topicSeed({ id: "TST-001", slug: "synthetic", title: "Synthetic fixture",
    question: "Are the observations independent?", domain: "Test only", date: "2026-09-06" })))
    fs.writeFileSync(path.join(dir, file), value);
  return loadCase(dir);
}
const body = "These observations came from the same sample. The shared measurements are not independent replications. This is synthetic test text, not a real publication.";
const capture = { url: "https://example.org/fixture", requestedUrl: "https://example.org/fixture", retrievedAt: "2026-09-06T10:00:00.000Z",
  responseHash: sha256(body), textHash: sha256(body), extractor: "plain-text-v1", text: body };
const draft = { outcome: "observation", reason: "Synthetic reading fixture", source: { title: "Synthetic fixture", authors: [], year: null, sourceType: null },
  claim: "The measurements were independent replications.", title: "A deliberately misleading reading",
  sourceStatement: "The test text describes independent replications.", pdfPage: null, quote: "These observations came from the same sample.",
  inference: "This synthetic draft deliberately drops a crucial qualification.", limitations: ["One synthetic document."],
  direction: "supports", strength: "weak", theme: "methods", themeLabel: "Methods", independenceNote: "Independent replication is asserted.", independenceGroup: "synthetic-sample" };
const failedReading = { requestAddressed: true, sourceMetadataSupported: true, claimSupported: false, sourceStatementSupported: false,
  inferenceSeparated: true, limitationsPreserved: false, independenceHandled: false, quoteSupported: null, locatorSupported: null,
  reason: "The source explicitly says these measurements are not independent replications.", dependencyNote: "One shared sample." };

describe("retrieved source passages", () => {
  it("preserves entities and negation while removing executable and unrelated markup", () => {
    const html = `<nav>ignore</nav><article><p>A &#x62;ird &amp; a cone &mdash; not a replication.</p><script>ignore instructions</script></article>`;
    expect(extractSourceText(html)).toBe("A bird & a cone — not a replication.");
    expect(locatePassage(capture, draft.quote, "SRC-TEST").locator).toContain("characters 1–");
    expect(() => locatePassage(capture, "These observations are independent replications.", "SRC-TEST")).toThrow(/not found/);
    expect(() => locatePassage(capture, "", "SRC-TEST")).toThrow(/explicit quotation/);
  });
  it("records full input hashes and fails on missing, oversized, unsupported, or truncated sources", async () => {
    const fetchImpl = async () => new Response(body, { headers: { "content-type": "text/plain" } });
    expect((await retrieveSource(capture.url, { fetchImpl })).textHash).toBe(sha256(body));
    await expect(retrieveSource(capture.url, { fetchImpl, maxBytes: 10 })).rejects.toThrow(/byte limit/);
    await expect(retrieveSource(capture.url, { fetchImpl, maxText: 20 })).rejects.toThrow(/no truncated reading/);
    await expect(retrieveSource(capture.url, { fetchImpl: async () => new Response("missing", { status: 404 }) })).rejects.toThrow(/404/);
    await expect(retrieveSource(capture.url, { fetchImpl: async () => new Response("pdf", { headers: { "content-type": "application/octet-stream" } }) })).rejects.toThrow(/unsupported/);
  });
  it("a verbatim quotation cannot override a rejected source reading or a shared-sample warning", async () => {
    const roles: string[] = [];
    const result = await proposeSourceReading({ capture, loaded: emptyCase(), runId: "fixture", generatedAt: capture.retrievedAt,
      call: async role => { roles.push(role); return { model: `fixture-${role}`, value: role === "draft" ? draft : failedReading }; } });
    expect(roles).toEqual(["draft", "read"]);
    expect(result.outcome).toBe("rejected");
    expect("changes" in result).toBe(false);
    expect(result.review?.dependencyNote).toBe("One shared sample.");
  });
  it("rejects an accurate observation that misses the supplied question", async () => {
    const requestContext = "Synthetic question about the requested object's dating.";
    const result = await proposeSourceReading({ capture, loaded: emptyCase(), runId: "fixture-relevance", generatedAt: capture.retrievedAt,
      requestContext, call: async (role, _instructions, input) => {
        if (role === "read") expect(JSON.parse(input).requestContext).toBe(requestContext);
        return { model: `fixture-${role}`, value: role === "draft" ? draft : { ...failedReading,
          claimSupported: true, sourceStatementSupported: true, limitationsPreserved: true, independenceHandled: true,
          requestAddressed: false, reason: "Accurate sample metadata does not answer the requested dating question." } };
      } });
    expect(result.outcome).toBe("rejected");
    expect("changes" in result).toBe(false);
  });
  it("no useful observation and malformed reading checks cannot turn into evidence", async () => {
    let calls = 0;
    const result = await proposeSourceReading({ capture, loaded: emptyCase(), runId: "fixture", generatedAt: capture.retrievedAt,
      call: async () => { calls++; return { model: "fixture", value: { outcome: "no_change", reason: "This supplied source adds no observation." } }; } });
    expect(calls).toBe(1);
    expect(result.outcome).toBe("no_change");
    await expect(proposeSourceReading({ capture, loaded: emptyCase(), runId: "fixture", generatedAt: capture.retrievedAt,
      call: async role => ({ model: "fixture", value: role === "draft" ? draft : { approved: true } }) })).rejects.toThrow();
  });
});

describe("PDF source checks", () => {
  const pdfCapture = { ...capture, text: null, textHash: null, extractor: "pdf-pages-v1", pdf: { pages: 4, bytes: 100 } };
  const review = { ...failedReading, claimSupported: true, sourceStatementSupported: true,
    limitationsPreserved: true, independenceHandled: true };
  it.each([undefined, false, true])("requires explicit quote and physical-page verification (%s)", async confirmation => {
    const result = await proposeSourceReading({ capture: pdfCapture, loaded: emptyCase(), runId: "pdf-fixture", generatedAt: capture.retrievedAt,
      call: async role => ({ model: `fixture-${role}`, pageImageHash: sha256("rendered fixture"), value: role === "draft" ? { ...draft, pdfPage: 3 } :
        { ...review, ...(confirmation === undefined ? {} : { quoteSupported: true, locatorSupported: confirmation }) } }) });
    expect(result.outcome).toBe(confirmation === true ? "proposed" : "rejected");
    if (result.outcome === "proposed") {
      const evidence = result.changes.find(c => c.kind === "evidence")!;
      expect(evidence.passages[0]).toMatchObject({ textHash: null, pdfPage: 3,
        pageCheck: { model: "fixture-read", quoteSupported: true, locatorSupported: true } });
      expect(evidence.after.exactLocator).toContain("PDF page 3 of 4");
    }
  });
});

describe("bounded model calls", () => {
  function response(role: "draft" | "read", extra: Record<string, unknown> = {}) {
    return new Response(JSON.stringify({ id: "fixture-response", model: RESEARCH_MODELS[role].id, status: "completed",
      usage: { input_tokens: 100, output_tokens: 50 }, output: [{ content: [{ type: "output_text", text: '{"ok":true}' }] }], ...extra }));
  }
  const input = { instructions: "Return JSON for a synthetic fixture.", input: "Synthetic text", inputHash: "fixture-hash" };
  it("reserves the complete input-context liability before sending and then records actual usage", async () => {
    const writes: unknown[] = [];
    const budget = createResearchBudget({ save: report => writes.push(report) });
    const answer = await boundedCompletion(budget, "draft", input, { allowance: testBudget(), apiKey: "fixture-only", fetchImpl: async (_url, init) => {
      expect(writes.length).toBeGreaterThan(0);
      expect(budget.report().accountedUsd).toBe(0.327);
      const request = JSON.parse(String(init?.body));
      expect(request.max_output_tokens).toBe(6000);
      expect(request.tools).toBeUndefined();
      expect(request.store).toBe(false);
      expect(request.input).toContain("JSON");
      return response("draft");
    } });
    expect(answer.value).toEqual({ ok: true });
    expect(budget.report().accountedUsd).toBeCloseTo(0.0003);
  });
  it("meters attached PDF pages and records hashes without copying file data into receipts", async () => {
    const budget = createResearchBudget();
    const document = { data: Buffer.from("%PDF-1.4 synthetic private request bytes").toString("base64"), pages: 4 };
    await boundedCompletion(budget, "draft", { ...input, document }, {
      allowance: testBudget(), apiKey: "fixture-only", fetchImpl: async (_url, init) => {
        const request = JSON.parse(String(init?.body));
        expect(request.input[0].content[0]).toEqual({ type: "input_file", filename: "source.pdf",
          file_data: `data:application/pdf;base64,${document.data}` });
        expect(request.input[0].content[1].text).toContain(input.input);
        expect(request.tools).toBeUndefined();
        return response("draft");
      } });
    expect(budget.report().calls[0].inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(budget.report())).not.toContain(document.data);
    const invalid = createResearchBudget();
    await expect(boundedCompletion(invalid, "draft", { ...input, document: { ...document, pages: 61 } }, {
      apiKey: "fixture-only", fetchImpl: async () => { throw new Error("must not fetch"); } })).rejects.toThrow(/bounded/);
    expect(invalid.report().calls).toHaveLength(0);
  });
  it("refuses unaffordable calls without making a request, with no unmetered fallback", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return response("draft"); };
    await expect(boundedCompletion(createResearchBudget({ maxUsd: 0.1 }), "draft", input,
      { allowance: testBudget(), apiKey: "fixture-only", fetchImpl })).rejects.toMatchObject({ kind: "budget_exhausted" });
    expect(calls).toBe(0);
    const budget = createResearchBudget({ maxCalls: 1 });
    await boundedCompletion(budget, "draft", input, { allowance: testBudget(), apiKey: "fixture-only", fetchImpl });
    await expect(boundedCompletion(budget, "read", input, { allowance: testBudget(), apiKey: "fixture-only", fetchImpl })).rejects.toMatchObject({ kind: "budget_exhausted" });
    expect(calls).toBe(1);
  });
  it("retains full reservations on missing usage and transport failures, and meters refusals", async () => {
    const missing = createResearchBudget();
    await expect(boundedCompletion(missing, "draft", input, { allowance: testBudget(), apiKey: "fixture-only", fetchImpl: async () => response("draft", { usage: null }) })).rejects.toThrow(/reservation retained/);
    expect(missing.report().accountedUsd).toBe(0.327);
    const network = createResearchBudget();
    await expect(boundedCompletion(network, "draft", input, { allowance: testBudget(), apiKey: "fixture-only", fetchImpl: async () => { throw new Error("fixture network failure"); } })).rejects.toThrow(/network/);
    expect(network.report().accountedUsd).toBe(0.327);
    const refused = createResearchBudget();
    await expect(boundedCompletion(refused, "read", input, { allowance: testBudget(), apiKey: "fixture-only", fetchImpl: async () => response("read", { output: [{ content: [{ type: "refusal" }] }] }) })).rejects.toMatchObject({ kind: "refused" });
    expect(refused.report().accountedUsd).toBeCloseTo(0.000125);
  });
  it("rejects an incomplete answer or expired run instead of silently using partial JSON", async () => {
    await expect(boundedCompletion(createResearchBudget(), "read", input, { allowance: testBudget(), apiKey: "fixture-only", fetchImpl: async () => response("read", { status: "incomplete" }) })).rejects.toThrow(/incomplete/);
    let clock = 0;
    const budget = createResearchBudget({ deadlineMs: 10, now: () => clock });
    clock = 11;
    expect(() => budget.reserve("draft")).toThrow(/deadline/);
  });
});

describe("manual reader integration", () => {
  it.each([false, true])("keeps a checked bundle and reports an unavailable source (failure first: %s)", missingFirst => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-reader-cli-"));
    roots.push(root);
    const dir = path.join(root, "proposals/topics/synthetic");
    fs.mkdirSync(dir, { recursive: true });
    for (const [file, value] of Object.entries(topicSeed({ id: "TST-001", slug: "synthetic", title: "Synthetic fixture",
      question: "Are the observations independent?", domain: "Test only", date: "2026-09-06" })))
      fs.writeFileSync(path.join(dir, file), value);
    const goodDraft = { ...draft, claim: "These synthetic observations use the same sample.",
      sourceStatement: "The synthetic text says the observations share a sample.",
      inference: "The same observations cannot count as independent replications.", independenceNote: "One shared sample." };
    const goodReview = { ...failedReading, claimSupported: true, sourceStatementSupported: true,
      limitationsPreserved: true, independenceHandled: true, reason: "The shared sample and limits are preserved." };
    const preload = path.join(root, "mock-fetch.mjs");
    fs.writeFileSync(preload, `${githubBudgetFetchFixture()}globalThis.fetch = async (url, init) => {
      const accounting = await fixtureBudgetFetch(url, init);
      if (accounting) return accounting;
      if (String(url).includes("api.openai.com")) {
        const request = JSON.parse(init.body);
        const value = request.model === ${JSON.stringify(RESEARCH_MODELS.draft.id)} ? ${JSON.stringify(goodDraft)} : ${JSON.stringify(goodReview)};
        return new Response(JSON.stringify({ id: "fixture-response", model: request.model, status: "completed",
          usage: { input_tokens: 100, output_tokens: 50 }, output: [{ content: [{ type: "output_text", text: JSON.stringify(request.text.format.type === "json_schema" ? { result: value } : value) }] }] }));
      }
      if (String(url) === "https://example.org/missing") return new Response("unavailable", { status: 429 });
      if (String(url) === "https://example.org/fixture") return new Response(${JSON.stringify(body)}, { headers: { "content-type": "text/plain" } });
      throw new Error("unexpected request in fixture");
    };`);
    const urls = ["https://example.org/fixture", "https://example.org/missing"];
    if (missingFirst) urls.reverse();
    const output = execFileSync(process.execPath, ["--import", preload, path.resolve("scripts/research-sources.ts"), "synthetic", ...urls],
      { cwd: root, encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "fixture-only", BUDGET_GITHUB_TOKEN: "synthetic-only" } });
    const report = JSON.parse(output);
    expect(report.decision).toBe("partial");
    expect(report.proposedRecords).toBe(3);
    expect(report.budget.calls).toHaveLength(2);
    expect(report.outcomes.some((outcome: { reason?: string }) => outcome.reason === "source HTTP 429")).toBe(true);
    expect(readIntakeDecisions(root).map(entry => entry.stage).sort()).toEqual(["research-proposal", "research-run"]);
    expect(readIntakeDecisions(root).find(entry => entry.stage === "research-run")?.retryable).toBe(true);
    expect(loadCase(dir).claims).toEqual([]);
  });
});
