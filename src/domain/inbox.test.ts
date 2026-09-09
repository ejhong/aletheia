import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { loadAllCases } from "./load.ts";
import { execFileSync } from "node:child_process";
import { composeReport, detectType, founderDrop, parseFrontMatter, permissionRecord, readInbox, runInbox, supplierOf, type CommitVerifier } from "../pipeline/inbox.ts";
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
  for (const f of ["budget.yaml", "tariffs.yaml", "models.yaml", "founder.yaml"]) fs.copyFileSync(path.join(process.cwd(), "config", f), path.join(root, "config", f));
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "note.md"), "---\ncase: vasocomputation\neditor: Eugene\n---\nThe Shah 2015 review is the one to read on trigger points.\n");
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "essay.pdf"), miniPdf("Knots of Existence, a long essay naming Shah and Thaker 2015."));
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "essay.md"), "---\ncase: vasocomputation\neditor: Eugene\npermission: quote and cite it\ngranted: 2026-09-09\nprovenance: written 2026-08-13, AI-generated text\n---\n");
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "orphan.pdf"), miniPdf("A paper somebody sent without saying so."));
  fs.writeFileSync(path.join(root, "inbox", "other-case.md"), "---\ncase: ydih\neditor: Eugene\n---\nNot ours.\n");
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "silent.pdf"), miniPdf("Own work sent without saying what may be done with it."));
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "silent.md"), "---\ncase: vasocomputation\neditor: Eugene\n---\n");
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "withheld.pdf"), miniPdf("Sent with a permission that withholds."));
  fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "withheld.md"), "---\ncase: vasocomputation\nfrom: a colleague\npermission: private review only, do not publish\ngranted: 2026-09-09\n---\n");
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
      { name: "vasocomputation/silent.pdf", reason: expect.stringMatching(/^no permission to publish or cite/) }, // own work, but nothing said about what may be done with it (§3.15)
      { name: "vasocomputation/withheld.pdf", reason: expect.stringMatching(/^the permission uses words the gate does not grant on \(private, review, only, do, not\)/) }, // a permission that says "only" and "not" grants nothing here
    ]);
    const { permissionGap } = await import("../pipeline/inbox.ts");
    expect(permissionGap({ permission: "publish and cite", granted: "2026-09-09" })).toBeNull();
    expect(permissionGap({ permission: "publication prohibited", granted: "2026-09-09" })).toMatch(/does not grant on \(publication, prohibited\)/); // no list of forbidden words to evade: only known words pass
    expect(permissionGap({ permission: "for the site", granted: "2026-09-09" })).toMatch(/does not say it may be published/);
    expect(permissionGap({ permission: "publish", granted: "soon" })).toMatch(/no `granted:` date/);
  });
});

describe("a file the founder commits to the inbox", () => {
  const git = (root: string, ...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  it("needs no statement: the commit is the direction, and the record names it; a stranger's commit still needs one", async () => {
    const root = tmpRoot();
    git(root, "init", "-q");
    git(root, "config", "user.email", "ejhong@gmail.com");
    git(root, "config", "user.name", "ejhong");
    fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "dropped.pdf"), miniPdf("A paper the founder dropped from the phone, by Someone Else, 2019."));
    git(root, "add", "inbox/vasocomputation/dropped.pdf");
    git(root, "commit", "-q", "-m", "drop");
    git(root, "config", "user.email", "stranger@example.org");
    fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "stranger.pdf"), miniPdf("A paper someone else committed without a statement."));
    git(root, "add", "inbox/vasocomputation/stranger.pdf");
    git(root, "commit", "-q", "-m", "drop by a stranger");
    // GitHub's word stands in: it attributes the founder's commits to the login and reports them verified.
    const github: CommitVerifier = (sha, r) => {
      const email = execFileSync("git", ["log", "-1", "--format=%ae", sha], { cwd: r, encoding: "utf8" }).trim();
      return email === "ejhong@gmail.com" ? { login: "ejhong", verified: true, reason: "valid" } : { login: null, verified: false, reason: "unknown_key" };
    };
    const unverified: CommitVerifier = () => ({ login: "ejhong", verified: false, reason: "unsigned" });
    const { items, left } = await readInbox("vasocomputation", root, github);
    const dropped = items.find((i) => i.name.endsWith("dropped.pdf"))!;
    expect(dropped.supplier).toMatch(/^the founder \(ejhong\), by commit [0-9a-f]{10} on \d{4}-\d\d-\d\d, under the founder's standing direction of 2026-09-09$/);
    const d = founderDrop(path.join(root, "inbox", "vasocomputation", "dropped.pdf"), root, github);
    expect("drop" in d && d.drop.email).toBe("ejhong@gmail.com");
    expect(founderDrop(path.join(root, "inbox", "vasocomputation", "stranger.pdf"), root, github)).toEqual({ reason: expect.stringMatching(/not the founder's \(ejhong <stranger@example.org>\)/) });
    // An author line alone is not enough: without GitHub's verification the drop is nobody's.
    expect(founderDrop(path.join(root, "inbox", "vasocomputation", "dropped.pdf"), root, unverified)).toEqual({ reason: expect.stringMatching(/unverified \(unsigned\)/) });
    expect(left.map((l) => l.name)).toContain("vasocomputation/stranger.pdf");
    expect(left.find((l) => l.name.endsWith("stranger.pdf"))!.reason).toMatch(/not taken as the founder's drop/);
    // The drafter is told the drop says nothing about authorship; the license names the commit as the grant.
    const report = composeReport("vasocomputation", "r", "2026-09-09", [dropped], new Map());
    expect(report).toMatch(/DROPPED BY THE FOUNDER \(commit [0-9a-f]{10}, \d{4}-\d\d-\d\d; GitHub attributes it to ejhong.*under the founder's standing direction of 2026-09-09: "Files I commit.*read the author, date and venue from the document itself/);
    expect(report).toMatch(/Permission on which it is published: Permission: the founder's standing direction/);
    expect(permissionRecord(dropped, "2026-09-09", "run")).toMatch(/^Permission: the founder's standing direction in the founder's words — "Files I commit to inbox\/ .* — given 2026-09-09 by this file, .*; this file committed under it by ejhong <ejhong@gmail.com> on \d{4}-\d\d-\d\d in commit [0-9a-f]{40} \(GitHub attributes it to ejhong and reports the signature verified \(valid\); channel: git; held: that commit\)/);
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
    fs.writeFileSync(path.join(root, "inbox", "vasocomputation", "new-essay.md"), "---\ncase: vasocomputation\neditor: Eugene\nrole: founding_narrative\npermission: publish it as the case's founding input and cite it\ngranted: 2026-09-09\n---\n");
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
    expect(added.license).toMatch(/^Permission in the supplier's words: "publish it as the case's founding input and cite it" — granted by Eugene \(own work\) on 2026-09-09 in the inbox statement `new-essay\.md`, recorded at intake on 2026-\d\d-\d\d/);
    expect(added.license).toMatch(/held at inbox\/processed\/2026-\d\d-\d\d-inbox-vasocomputation-\d{6}\/new-essay\.md/);
    const report = fs.readFileSync(r.reportFile!, "utf8");
    expect(report).toMatch(/NEW TO THE LEDGER AND SUPPLIED BY ITS AUTHOR \(Eugene\)/);
    expect(report).toMatch(/registered as founding input/);
    expect(report).toMatch(/Permission on which it is published: Permission in the supplier's words: "publish it as the case's founding input and cite it"/);
    expect(report).toMatch(/carries that permission line, verbatim, in its `reliabilityNotes`/);
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
