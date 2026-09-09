import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { loadAllCases } from "./load.ts";
import { detectType, parseFrontMatter, readInbox, runInbox, supplierOf } from "../pipeline/inbox.ts";
import { bestMatch, resolveReferences } from "../pipeline/references.ts";
import { readRuns } from "../pipeline/store.ts";

function miniPdf(text: string): Uint8Array {
  const content = `BT /F1 18 Tf 40 700 Td (${text}) Tj ET`;
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>", `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aletheia-inbox-"));
  fs.mkdirSync(path.join(root, "inbox", "vasocomputation"), { recursive: true });
  fs.mkdirSync(path.join(root, "config"));
  for (const f of ["budget.yaml", "tariffs.yaml", "models.yaml"]) fs.copyFileSync(path.join(process.cwd(), "config", f), path.join(root, "config", f));
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "note.md"), "---\ncase: vasocomputation\neditor: Eugene\n---\nThe Shah 2015 review is the one to read on trigger points.\n");
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "essay.pdf"), miniPdf("Knots of Existence, a long essay naming Shah and Thaker 2015."));
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "essay.md"), "---\ncase: vasocomputation\neditor: Eugene\npermission: quote and cite it\nprovenance: written 2026-08-13, AI-generated text\n---\n");
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "orphan.pdf"), miniPdf("A paper somebody sent without saying so."));
  fs.writeFileSync(path.join(root, "inbox", "other-case.md"), "---\ncase: ydih\neditor: Eugene\n---\nNot ours.\n");
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "silent.pdf"), miniPdf("Own work sent without saying what may be done with it."));
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "silent.md"), "---\ncase: vasocomputation\neditor: Eugene\n---\n");
  return root;
}

describe("inbox items", () => {
  it("reads front matter, detects kinds, and requires a footing for documents", () => {
    expect(parseFrontMatter("---\ncase: x\n---\nbody").meta.case).toBe("x");
    expect(detectType({}, "https://a.test\nhttps://b.test\n", false)).toBe("links");
    expect(detectType({ editor: "E" }, "a short opinion", false)).toBe("commentary");
    expect(detectType({}, "x".repeat(5000), false)).toBe("document");
    expect(detectType({}, "anything", true)).toBe("document");
    expect(supplierOf({ editor: "Eugene" })).toBe("Eugene (own work)");
    expect(supplierOf({ from: "a researcher", permission: "email 2026-09-01" })).toMatch(/permission/);
    expect(supplierOf({ published: "https://x.test" })).toMatch(/published at/);
    expect(supplierOf({ from: "someone" })).toBeNull();
  });

  it("takes a case's items with their sidecars and leaves an unprovenanced document behind, saying why", async () => {
    const root = tmpRoot();
    const { items, left } = await readInbox("vasocomputation", root);
    expect(items.map((i) => i.name).sort()).toEqual(["vasocomputation/essay.pdf", "vasocomputation/note.md"]);
    const essay = items.find((i) => i.name.endsWith("essay.pdf"))!;
    expect(essay.kind).toBe("document");
    expect(essay.sidecar).toMatch(/essay\.md$/);
    expect(essay.pages).toBe(1);
    expect(essay.text).toMatch(/^\[p\. 1\]/);
    expect(left).toEqual([
      { name: "vasocomputation/orphan.pdf", reason: expect.stringMatching(/no statement of provenance/) },
      { name: "vasocomputation/silent.pdf", reason: expect.stringMatching(/no permission to publish or cite/) }, // own work, but nothing said about what may be done with it (§3.15)
    ]);
  });
});

describe("a founding-role document", () => {
  it("is registered as a narrative input at intake, with its extraction beside the original, and told to the drafter as a new source", async () => {
    const root = tmpRoot();
    const cases = loadAllCases();
    const vaso = cases.find((c) => c.record.slug === "vasocomputation")!;
    // A case directory copy for the inputs manifest the intake appends to.
    fs.mkdirSync(path.join(root, "content", "cases", vaso.dir, "inputs"), { recursive: true });
    fs.copyFileSync(path.join(process.cwd(), "content", "cases", vaso.dir, "inputs", "manifest.yaml"), path.join(root, "content", "cases", vaso.dir, "inputs", "manifest.yaml"));
    fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "new-essay.pdf"), miniPdf("Knots of Existence Hypotheses. Perforator trees carry the knots."));
    fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "new-essay.md"), "---\ncase: vasocomputation\neditor: Eugene\nrole: founding_narrative\npermission: publish it as the case's founding input and cite it\n---\n");
    const r = await runInbox("vasocomputation", { root, deps: { cases: () => cases, list: async () => [], search: async () => [] } });
    expect(r.outcome).toBe("completed");
    expect(r.reason).toMatch(/registered as founding input VASO-IN\d+/);
    expect(fs.existsSync(path.join(root, "research", vaso.dir, "new-essay.pdf"))).toBe(true);
    expect(fs.readFileSync(path.join(root, "research", vaso.dir, "new-essay.pdf.txt"), "utf8")).toMatch(/Perforator trees/);
    const manifest = parseYaml(fs.readFileSync(path.join(root, "content", "cases", vaso.dir, "inputs", "manifest.yaml"), "utf8"));
    const added = manifest.at(-1);
    expect(added.role).toBe("founding_narrative");
    expect(added.file).toBe(path.join("research", vaso.dir, "new-essay.pdf"));
    expect(added.title).toMatch(/Knots of Existence Hypotheses/);
    // The permission to publish is recorded as provenance (§3.15): who granted it, when, by what channel, where it is held.
    expect(added.license).toMatch(/^Permission in the supplier's words: "publish it as the case's founding input and cite it" — granted by Eugene \(own work\) on 2026-\d\d-\d\d through the inbox statement `new-essay\.md`/);
    expect(added.license).toMatch(/held at inbox\/processed\/2026-\d\d-\d\d-inbox-vasocomputation-\d{6}\/new-essay\.md/);
    const report = fs.readFileSync(r.reportFile!, "utf8");
    expect(report).toMatch(/NEW TO THE LEDGER AND SUPPLIED BY ITS AUTHOR \(Eugene\)/);
    expect(report).toMatch(/registered as founding input/);
  });
});

describe("references", () => {
  it("matches by title within the year window, and keeps a locator the text already gave", async () => {
    const ref = { title: "Myofascial trigger points then and now: a historical and scientific perspective", authors: ["Shah"], year: 2015, venue: null, url: null };
    const results = [
      { title: "Myofascial Trigger Points Then and Now: A Historical and Scientific Perspective", doi: "https://doi.org/10.1016/j.pmrj.2015.01.024", publication_year: 2015 },
      { title: "The prevalence of myofascial trigger points in neck and shoulder-related disorders", doi: "https://doi.org/10.1186/x", publication_year: 2018 },
    ];
    expect(bestMatch(ref, results)?.doi).toBe("https://doi.org/10.1016/j.pmrj.2015.01.024");
    expect(bestMatch({ ...ref, year: 2009 }, results)).toBeNull();
    // A descriptive reference resolves on author and year, never on a vague phrase alone.
    const descriptive = { title: "Microdialysis study of trigger point biochemistry", authors: ["Shah, Jay"], year: 2005, venue: null, url: null };
    const withAuthors = [
      { title: "An in vivo microanalytical technique for measuring the local biochemical milieu of human skeletal muscle", doi: "https://doi.org/10.1152/japplphysiol.01331.2004", publication_year: 2005, authorships: [{ author: { display_name: "Jay P. Shah" } }, { author: { display_name: "Terry M. Phillips" } }] },
      { title: "Microdialysis in muscle: a review", doi: "https://doi.org/10.1000/z", publication_year: 2005, authorships: [{ author: { display_name: "Someone Else" } }] },
    ];
    expect(bestMatch(descriptive, withAuthors)?.doi).toBe("https://doi.org/10.1152/japplphysiol.01331.2004"); // author + year + a shared stem (biochem…)
    expect(bestMatch({ ...descriptive, title: "Trigger point research" }, withAuthors)).toBeNull(); // author + year, no topic in common
    expect(bestMatch({ ...descriptive, year: null }, withAuthors)).toBeNull(); // no year: author alone is not enough
    expect(bestMatch({ ...descriptive, authors: [] }, withAuthors)).toBeNull();
    const out = await resolveReferences([ref, { ...ref, title: "Some paper", url: "https://doi.org/10.1000/abc" }, { ...ref, title: "short" }], async () => results);
    expect(out[0]).toMatchObject({ doi: "10.1016/j.pmrj.2015.01.024", url: "https://doi.org/10.1016/j.pmrj.2015.01.024" });
    expect(out[1]).toMatchObject({ doi: "10.1000/abc", note: "locator written in the text" });
    expect(out[2].url).toBeNull();
  });
});

describe("the inbox verb", () => {
  it("dry-runs without listing references or moving anything; a real run composes the report, keeps the text, and moves the originals", async () => {
    const root = tmpRoot();
    const cases = loadAllCases();
    const dry = await runInbox("vasocomputation", { dryRun: true, root, deps: { cases: () => cases } });
    expect(dry.outcome).toBe("dry-run");
    expect(dry.items).toBe(2);
    expect(fs.existsSync(path.join(root, "inbox", "vasocomputation", "essay.pdf"))).toBe(true);

    const real = await runInbox("vasocomputation", {
      root,
      deps: {
        cases: () => cases,
        list: async () => [{ title: "Myofascial trigger points then and now: a historical and scientific perspective", authors: ["Shah", "Thaker"], year: 2015, venue: "PM&R", url: null }],
        search: async () => [{ title: "Myofascial Trigger Points Then and Now: A Historical and Scientific Perspective", doi: "https://doi.org/10.1016/j.pmrj.2015.01.024", publication_year: 2015 }],
      },
    });
    expect(real.outcome).toBe("completed");
    const report = fs.readFileSync(real.reportFile!, "utf8");
    expect(report).toMatch(/^<!-- Inbox intake/);
    expect(report).toContain("## commentary: vasocomputation/note.md");
    expect(report).toContain("The Shah 2015 review is the one to read");
    expect(report).toContain("→ https://doi.org/10.1016/j.pmrj.2015.01.024");
    const dir = path.dirname(real.reportFile!);
    expect(fs.existsSync(path.join(dir, "documents", "essay.txt"))).toBe(true);
    const manifest = parseYaml(fs.readFileSync(path.join(dir, "manifest.yaml"), "utf8"));
    expect(manifest.items.find((i: { name: string }) => i.name.endsWith("essay.pdf")).sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.existsSync(path.join(root, "inbox", "vasocomputation", "essay.pdf"))).toBe(false);
    expect(fs.existsSync(path.join(root, "inbox", "vasocomputation", "orphan.pdf"))).toBe(true); // left, with its reason
    expect(fs.readdirSync(path.join(root, "inbox", "processed", real.runId)).sort()).toEqual(["vasocomputation__essay.md", "vasocomputation__essay.pdf", "vasocomputation__note.md"]);
    expect(readRuns(root).find((r) => r.runId === real.runId)?.verb).toBe("inbox");
  });
});
