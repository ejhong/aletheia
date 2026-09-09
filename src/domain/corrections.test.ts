import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { applyCorrections, ledgerFileFor, setField } from "../pipeline/ledger-write.ts";

const FILE = [
  "# Claims — hand-written; folded scalars and flow lists must survive an edit next door.",
  "- id: GEO-C001",
  "  statement: >-",
  "    At least one megalithic monument contains cast stone.",
  "  theme: thesis",
  "  parentClaimIds: [GEO-C000]",
  "- id: GEO-C003",
  "  statement: >-",
  "    Accounts of Al-Ma'mun's entry (c. 820 AD) report salt.",
  "  theme: historical-record",
  "  # a comment inside the record",
  "  rung: observation",
  "- id: GEO-C004",
  '  statement: "A quoted one-liner."',
  "  theme: thesis",
  "",
].join("\n");

const tmpCase = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-corr-"));
  const dir = path.join(root, "content", "cases", "x");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "claims.yaml"), FILE);
  return { root, file: path.join(dir, "claims.yaml") };
};

describe("setField", () => {
  it("changes one field of one record and nothing else, byte for byte", () => {
    const { file } = tmpCase();
    setField(file, "GEO-C003", "statement", "Accounts of Al-Ma'mun's entry (c. 820 AD) report salt.", "Accounts of Al-Ma'mun's entry (AD 832) report salt.");
    const after = fs.readFileSync(file, "utf8");
    expect(parseYaml(after)[1].statement).toBe("Accounts of Al-Ma'mun's entry (AD 832) report salt.");
    // Everything outside the edited scalar is untouched: header comment, the neighbours, the in-record comment.
    expect(after.startsWith(FILE.split("\n").slice(0, 7).join("\n"))).toBe(true);
    expect(after).toContain("  # a comment inside the record\n  rung: observation\n- id: GEO-C004\n  statement: \"A quoted one-liner.\"");
  });

  it("adds a field a record lacks when the correction's from is null, at the end of the record", () => {
    const { file } = tmpCase();
    setField(file, "GEO-C001", "url", null, "https://example.test/paper");
    const after = fs.readFileSync(file, "utf8");
    expect(parseYaml(after)[0].url).toBe("https://example.test/paper");
    expect(after).toContain("  parentClaimIds: [GEO-C000]\n  url: https://example.test/paper\n- id: GEO-C003");
    expect(() => setField(file, "GEO-C001", "nope", "something", "x")).toThrow(/not the value the correction was written against/); // absent ≠ "something"
  });

  it("refuses when the field has moved since the correction was written, or the record is missing", () => {
    const { file } = tmpCase();
    expect(() => setField(file, "GEO-C003", "statement", "something else", "x")).toThrow(/not the value the correction was written against/);
    expect(() => setField(file, "GEO-C999", "statement", "a", "b")).toThrow(/no record GEO-C999/);
    expect(fs.readFileSync(file, "utf8")).toBe(FILE); // nothing written
  });

  it("knows which file a record id lives in", () => {
    expect(ledgerFileFor("GEO-C003")).toBe("claims.yaml");
    expect(ledgerFileFor("GEO-E027")).toBe("evidence.yaml");
    expect(ledgerFileFor("GEO-R010")).toBe("research.yaml");
    expect(ledgerFileFor("SRC-NEMOY-1939")).toBe("sources.yaml");
    expect(ledgerFileFor("IMG-GEO-P01")).toBe("images.yaml");
    expect(ledgerFileFor("STUDY-X")).toBeNull();
  });
});

describe("applyCorrections", () => {
  it("applies what still holds, reports what does not, and writes one history entry", () => {
    const { root } = tmpCase();
    const r = applyCorrections(
      "x",
      [
        { record: "GEO-C003", field: "statement", from: "Accounts of Al-Ma'mun's entry (c. 820 AD) report salt.", to: "Accounts of Al-Ma'mun's entry (AD 832) report salt.", reason: "Nemoy 1939 n. 7 dates the visit to 217/832." },
        { record: "GEO-C001", field: "statement", from: "stale", to: "x", reason: "r" },
      ],
      { date: "2026-09-08", actor: "test", proposalRef: "proposals/p", root },
    );
    expect(r.applied).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/not the value/);
    const history = parseYaml(fs.readFileSync(path.join(root, "content", "cases", "x", "history.yaml"), "utf8"));
    expect(history).toHaveLength(1);
    expect(history[0].change).toMatch(/GEO-C003\.statement/);
    expect(history[0].reason).toMatch(/Nemoy 1939/);
  });
});
