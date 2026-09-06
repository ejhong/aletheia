#!/usr/bin/env node
import http from "node:http";
import { once } from "node:events";
import { meterOperator, anthropicStreamReceipt } from "./lib/operator-meter.mjs";
import { sharedBudget } from "./lib/ai-budget.mjs";
import { BudgetStopped } from "./lib/ai-policy.mjs";

// Actions-runner-local adapter, never part of the static site. The upstream
// host is fixed and no incoming authorization headers or URLs are forwarded.
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY required by the metered operator connection");
await sharedBudget().status(); // fail before advertising a usable connection
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (pathname === "/health" && req.method === "GET") { res.end("ready"); return; }
    if (req.method !== "POST" || !["/v1/messages", "/v1/messages/count_tokens"].includes(pathname)) {
      res.writeHead(404); res.end(); return;
    }
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 8_000_000) throw new Error("Operator input exceeds the explicit request limit");
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const counted = pathname.endsWith("/count_tokens");
    const call = counted ? null : await meterOperator(body);
    const headers = { "content-type": "application/json", "x-api-key": apiKey,
      "anthropic-version": "2023-06-01" };
    // Client protocol capabilities (e.g. fine-grained tool streaming) are
    // forwarded, but tier, model, output and hosted-tool limits remain ours.
    if (typeof req.headers["anthropic-beta"] === "string") headers["anthropic-beta"] = req.headers["anthropic-beta"];
    const upstream = await fetch(`https://api.anthropic.com${pathname}`, {
      method: "POST", headers, body: JSON.stringify(call?.request ?? body), signal: AbortSignal.timeout(900000),
    });
    if (!upstream.ok) {
      res.writeHead(upstream.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: `Upstream HTTP ${upstream.status}; reservation retained` } })); return;
    }
    if (!body.stream || counted) {
      const data = await upstream.json();
      if (call) await call.settle(data);
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(data)); return;
    }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    res.flushHeaders();
    const received = []; let receivedBytes = 0;
    for await (const chunk of upstream.body) {
      receivedBytes += chunk.length;
      if (receivedBytes > 32_000_000) throw new Error("Operator stream exceeds receipt limit");
      received.push(chunk);
      if (!res.write(chunk)) await once(res, "drain");
    }
    await call.settle(anthropicStreamReceipt(Buffer.concat(received).toString("utf8")));
    res.end();
  } catch (error) {
    console.error(error instanceof BudgetStopped ? error.message : "Operator connection failed; reservation retained.");
    if (res.headersSent) res.destroy();
    else {
      res.writeHead(402, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "permission_error", message: "AI allowance or receipt check stopped this request. See the budget report." } }));
    }
  }
});
server.listen(4319, "127.0.0.1", () => console.log("Metered operator connection ready on 127.0.0.1:4319"));
