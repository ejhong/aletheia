import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { changedRecords, citationOf, locatorPages, quoteCheck } from "./quotecheck.ts";
import { findInText, pagesContaining, pagesOf } from "./read.ts";

/**
 * The quote check is the fail-closed half of "real citations only": a quoted passage the source does not contain, a
 * locator on the wrong page, an evidence record with nothing quoted, or a DOI that resolves to nothing each fail the
 * change. Records on the base were checked when they entered and are not read again.
 */

const TEXT = "[p. 1]\nThe first page says nothing much.\n[p. 2]\nThe pounders were used in one position until the bruising surface had become flat.\n[p. 3]\nA passage that runs over the\n[p. 4]\npage break is on both pages.";

function repo(evidence: object[], claims: object[] = [], sources: object[] = [{ id: "SRC-A", title: "A", url: "https://example.test/a.pdf", sourceType: "report" }]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quotecheck-"));
  const dir = path.join(root, "content", "cases", "x");
  fs.mkdirSync(dir, { recursive: true });
  const write = (e: object[], c: object[], s: object[]) => {
    fs.writeFileSync(path.join(dir, "evidence.yaml"), stringify(e));
    fs.writeFileSync(path.join(dir, "claims.yaml"), stringify(c));
    fs.writeFileSync(path.join(dir, "sources.yaml"), stringify(s));
  };
  write([], [], sources.filter((s) => (s as { id: string }).id === "SRC-A"));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "add", ".");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
  write(evidence, claims, sources);
  return root;
}
const ev = (id: string, sourceStatement: string, exactLocator?: string) => ({ id, sourceId: "SRC-A", sourceStatement, reviewState: "ai_extracted", ...(exactLocator ? { exactLocator } : {}) });
const read = async () => ({ text: TEXT });
const resolve = async (cs: { kind: string; id: string }[]) => cs.map((c) => ({ ...c, status: c.id.includes("bad") ? "fails" : "resolves", note: "test" }));

describe("the quote check", () => {
  it("passes a quoted passage the source contains, on the page its locator names", async () => {
    const root = repo([ev("X-E001", 'The source shows "the pounders were used in one position until the bruising surface".', "p. 2")]);
    const r = await quoteCheck({ base: "HEAD", root, read, resolve });
    expect(r.failures).toEqual([]);
    expect(r.checked).toEqual([{ case: "x", record: "X-E001", spans: 1 }]);
  });
  it("fails a passage the source does not contain, and a locator on the wrong page", async () => {
    const root = repo([ev("X-E001", '"the pounders were used in a single position"'), ev("X-E002", '"the pounders were used in one position until the bruising"', "p. 1")]);
    const r = await quoteCheck({ base: "HEAD", root, read, resolve });
    expect(r.failures.map((f) => f.record)).toEqual(["X-E001", "X-E002"]);
    expect(r.failures[0].problem).toMatch(/not found in the text of SRC-A/);
    expect(r.failures[1].problem).toMatch(/names p\. 1; the passage .* is on p\. 2/);
  });
  it("warns, and does not fail, on a locator past the document's last page (a journal's pagination)", async () => {
    const r = await quoteCheck({ base: "HEAD", root: repo([ev("X-E001", '"the pounders were used in one position"', "p. 1234")]), read, resolve });
    expect(r.failures).toEqual([]);
    expect(r.warnings[0].problem).toMatch(/past the document's 4/);
  });
  it("finds a passage that runs over a page break on both pages", () => {
    expect(pagesContaining(TEXT, "runs over the page break is on both")).toEqual([3, 4]);
  });
  it("fails an evidence record that quotes nothing, and one whose source cannot be read; skips provisional and rejected records", async () => {
    const root = repo([ev("X-E001", "A paraphrase with no quotation at all."), ev("X-E002", '"some passage of the source"'), { ...ev("X-E003", '"not checked at all here"'), reviewState: "provisional" }]);
    const r = await quoteCheck({ base: "HEAD", root, read: async () => ({ text: null, reason: "HTTP 403" }), resolve });
    expect(r.failures.map((f) => [f.record, f.problem.slice(0, 40)])).toEqual([
      ["X-E001", "an evidence record must quote its source"],
      ["X-E002", "the text of SRC-A could not be read (HTT"],
    ]);
  });
  it("checks a claim's anchor and its further passages", async () => {
    const claim = { id: "X-C001", reviewState: "ai_extracted", sourceAnchor: { locator: "p. 2", sourceId: "SRC-A", quote: "until the bruising surface had become flat", also: [{ locator: "p. 1", quote: "a passage nobody wrote" }] } };
    const r = await quoteCheck({ base: "HEAD", root: repo([], [claim]), read, resolve });
    expect(r.failures).toEqual([{ case: "x", record: "X-C001", problem: 'quoted passage not found in the text of SRC-A: "a passage nobody wrote"' }]);
  });
  it("fails a new source whose DOI does not resolve", async () => {
    const sources = [
      { id: "SRC-A", title: "A", url: "https://example.test/a.pdf", sourceType: "report" },
      { id: "SRC-B", title: "B", identifier: "10.9999/bad.doi", sourceType: "paper" },
    ];
    const r = await quoteCheck({ base: "HEAD", root: repo([], [], sources), read, resolve });
    expect(r.failures).toEqual([{ case: "x", record: "SRC-B", problem: "doi 10.9999/bad.doi does not resolve (test)" }]);
  });
});

describe("the check's parts", () => {
  it("reads the pages a locator names", () => {
    expect(locatorPages("Nature 2026, p. 12")).toEqual([12, 12]);
    expect(locatorPages("pp. 12–14, fig. 2")).toEqual([12, 14]);
    expect(locatorPages("page 7")).toEqual([7, 7]);
    expect(locatorPages("§6, (6)")).toBeNull();
  });
  it("finds a source's DOI or arXiv id", () => {
    expect(citationOf({ id: "S", identifier: "doi:10.1038/x-1" })).toEqual({ kind: "doi", id: "10.1038/x-1" });
    expect(citationOf({ id: "S", url: "https://www.nature.com/articles/s41598-026-48805-8" })).toEqual({ kind: "doi", id: "10.1038/s41598-026-48805-8" });
    expect(citationOf({ id: "S", identifier: "arXiv:1510.06537" })).toEqual({ kind: "arxiv", id: "1510.06537" });
    expect(citationOf({ id: "S", url: "https://example.test/" })).toBeNull();
  });
  it("finds what changed by id, a reordering being no change", () => {
    const a = { id: "A", x: 1 };
    const b = { id: "B", x: 2 };
    expect(changedRecords([a, b], [b, a])).toEqual([]);
    expect(changedRecords([a], [a, b]).map((r) => r.id)).toEqual(["B"]);
    expect(changedRecords([a, b], [{ id: "A", x: 9 }, b]).map((r) => r.id)).toEqual(["A"]);
  });
  it("finds a phrase with its page and the words around it", () => {
    expect(pagesOf(TEXT).size).toBe(4);
    expect(findInText(TEXT, "bruising   SURFACE", { context: 10 })).toEqual([{ page: 2, excerpt: "until the bruising surface had becom" }]);
  });
});

describe("what counts as a passage added", () => {
  it("is a change to the quoted words, their locator, their source or the record's state — not to anything else on the record", async () => {
    const root = repo([ev("X-E001", '"the pounders were used in one position"')]);
    // Commit that record as the base, then change only a field that carries no passage.
    const git = (...a: string[]) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qam", "evidence");
    const file = path.join(root, "content", "cases", "x", "evidence.yaml");
    fs.writeFileSync(file, stringify([{ ...ev("X-E001", '"the pounders were used in one position"'), limitations: ["a note added later"] }]));
    const unread = async () => ({ text: null, reason: "never read" });
    expect((await quoteCheck({ base: "HEAD", root, read: unread, resolve })).checked).toEqual([]);
    fs.writeFileSync(file, stringify([ev("X-E001", '"the pounders were used in one position until"')]));
    expect((await quoteCheck({ base: "HEAD", root, read, resolve })).checked.map((c) => c.record)).toEqual(["X-E001"]);
  });
});
