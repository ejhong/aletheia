import { describe, expect, it } from "vitest";
import { snapshotFrom } from "../pipeline/archive.ts";
import { retrievalTargets } from "../pipeline/draft.ts";
import { archiveItemOf, doiFromUrl, doisInText, looksLikeWall, oaCandidates, pdfText, retrieve } from "../pipeline/fetch.ts";
import { noticeNote } from "../lib/citation-check.mjs";

/** A one-page PDF built by hand, so the extractor is tested without a fixture file. */
function miniPdf(text: string): Uint8Array {
  const content = `BT /F1 18 Tf 40 700 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("retrieval", () => {
  it("reads a PDF page by page with page markers", async () => {
    const { text, pages } = await pdfText(miniPdf("Cast, not carved: a test page"));
    expect(pages).toBe(1);
    expect(text).toMatch(/^\[p\. 1\]\nCast, not carved: a test page/);
  });

  it("finds the DOI a URL carries, and the DOIs a report writes bare", () => {
    expect(doiFromUrl("https://doi.org/10.1038/s41598-026-48805-8")).toBe("10.1038/s41598-026-48805-8");
    expect(doiFromUrl("https://www.nature.com/articles/s41598-026-48805-8")).toBe("10.1038/s41598-026-48805-8");
    expect(doiFromUrl("https://onlinelibrary.wiley.com/doi/10.1002/jqs.3352?x=1")).toBe("10.1002/jqs.3352");
    expect(doiFromUrl("https://www.geopolymer.org/archaeology/")).toBeNull();
    expect(doisInText("See 10.1016/S0140-6736(97)11096-0 and https://doi.org/10.1038/x-1 (again 10.1038/X-1).")).toEqual(["10.1016/s0140-6736(97)11096-0", "10.1038/x-1"]);
    const targets = retrievalTargets("Nemoy (Isis 1939) at https://www.jstor.org/stable/225578; Sessa et al. 10.1038/s41598-026-48805-8; also https://www.nature.com/articles/s41598-026-48805-8");
    expect(targets.map((t) => t.url)).toEqual(["https://www.jstor.org/stable/225578", "https://www.nature.com/articles/s41598-026-48805-8"]);
    expect(targets[1].doi).toBe("10.1038/s41598-026-48805-8"); // the bare DOI is covered by the Nature URL, not listed twice
  });

  it("orders OpenAlex open-access copies PDFs first, deduplicated", () => {
    const work = {
      best_oa_location: { pdf_url: "https://pub.test/a.pdf", landing_page_url: "https://doi.org/10.1/a" },
      open_access: { oa_url: "https://pub.test/a.pdf" },
      locations: [
        { is_oa: true, pdf_url: "https://repo.test/a.pdf", landing_page_url: "https://repo.test/a" },
        { is_oa: false, pdf_url: "https://paywall.test/a.pdf" },
      ],
    };
    expect(oaCandidates(work)).toEqual(["https://pub.test/a.pdf", "https://repo.test/a.pdf", "https://doi.org/10.1/a", "https://repo.test/a"]);
  });

  it("falls back to an open-access copy when the URL will not serve, keeping the original as the key", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://api.openalex.org/")) return new Response(JSON.stringify({ best_oa_location: { pdf_url: "https://repo.test/paper.pdf" } }), { headers: { "content-type": "application/json" } });
      if (url === "https://repo.test/paper.pdf") return new Response(Buffer.from(miniPdf("Open access text here")), { headers: { "content-type": "application/pdf" } });
      return new Response("forbidden", { status: 403 });
    }) as typeof fetch;
    const r = await retrieve({ url: "https://www.nature.com/articles/s41598-026-48805-8" }, { fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://www.nature.com/articles/s41598-026-48805-8");
    expect(r.via).toContain("https://repo.test/paper.pdf");
    expect(r.text).toContain("Open access text here");
    expect(calls[1]).toContain("api.openalex.org/works/https://doi.org/10.1038");
  });
});

describe("walls", () => {
  it("a short challenge page served with 200 is not a retrieval", () => {
    expect(looksLikeWall("Client Challenge\nA required part of this site couldn’t load. This may be due to a browser extension.")).toBe("bot challenge page");
    expect(looksLikeWall("Just a moment...\nEnable JavaScript and cookies to continue")).toBe("bot challenge page");
    expect(looksLikeWall("The Queen's Chamber — Pyramid of Khufu. " + "Petrie measured the chamber in 1881. ".repeat(200))).toBeNull();
  });
});

describe("provenance side-checks", () => {
  it("reads the closest Wayback snapshot from an availability reply, as https", () => {
    expect(snapshotFrom({ archived_snapshots: { closest: { available: true, url: "http://web.archive.org/web/20260908150724/https://x.test/", timestamp: "20260908150724" } } })).toEqual({
      url: "https://web.archive.org/web/20260908150724/https://x.test/",
      timestamp: "20260908150724",
    });
    expect(snapshotFrom({ archived_snapshots: {} })).toBeNull();
  });

  it("summarizes Crossref update notices, the strongest first", () => {
    const items = [
      { DOI: "10.1016/s0140-6736(04)15715-2", title: ["Retraction of an interpretation"], "update-to": [{ DOI: "10.1016/S0140-6736(97)11096-0", type: "correction", updated: { "date-parts": [[2004, 3, 6]] } }] },
      { DOI: "10.1016/s0140-6736(10)60175-4", title: ["Retraction"], "update-to": [{ DOI: "10.1016/s0140-6736(97)11096-0", type: "retraction", updated: { "date-parts": [[2010, 2, 6]] } }] },
      { DOI: "10.1000/other", "update-to": [{ DOI: "10.1000/unrelated", type: "retraction" }] },
    ];
    expect(noticeNote(items, "10.1016/S0140-6736(97)11096-0")).toBe("RETRACTED — retraction notice 10.1016/s0140-6736(10)60175-4 (2010-2-6); 1 further notice(s)");
    expect(noticeNote([], "10.1/x")).toBeNull();
  });
});

describe("arXiv: the abstract page is the key, the PDF is the text", () => {
  it("reads the PDF for an abstract URL, keeps the abstract as the key, and says where the text came from", async () => {
    const { arxivIdOf } = await import("../pipeline/fetch.ts");
    expect(arxivIdOf("https://arxiv.org/abs/2609.05105")).toBe("2609.05105");
    expect(arxivIdOf("https://arxiv.org/pdf/2609.09461v2")).toBe("2609.09461v2");
    expect(arxivIdOf("https://arxiv.org/abs/hep-th/9901001")).toBe("hep-th/9901001");
    expect(arxivIdOf("https://www.nature.com/articles/x")).toBeNull();
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://arxiv.org/pdf/2609.05105") return new Response(Buffer.from(miniPdf("The deficit increases in the full sample")), { headers: { "content-type": "application/pdf" } });
      return new Response("<html><body><h1>Abstract</h1><p>Only the abstract here.</p></body></html>", { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const r = await retrieve({ url: "https://arxiv.org/abs/2609.05105" }, { fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://arxiv.org/abs/2609.05105");
    expect(r.text).toContain("The deficit increases in the full sample");
    expect(r.via).toContain("https://arxiv.org/pdf/2609.05105");
    expect(calls[0]).toBe("https://arxiv.org/pdf/2609.05105");
    // A PDF URL is read as itself; when the PDF will not serve, the abstract page still answers.
    const abstractOnly = (async (input: string | URL | Request) => (String(input).includes("/pdf/") ? new Response("gone", { status: 404 }) : new Response("<html><body><p>Only the abstract here.</p></body></html>", { headers: { "content-type": "text/html" } }))) as typeof fetch;
    const fallback = await retrieve({ url: "https://arxiv.org/abs/2609.05105" }, { fetchImpl: abstractOnly });
    expect(fallback.ok).toBe(true);
    expect(fallback.via).toBeUndefined();
    expect(fallback.text).toContain("Only the abstract here.");
  });
});

describe("Internet Archive items", () => {
  it("reads the OCR text the Archive serves beside a scan, under the item page's key, as a stand-in; the item page is never passed off as the text", async () => {
    expect(archiveItemOf("https://archive.org/details/descubrimientod00carvgoog")).toBe("descubrimientod00carvgoog");
    expect(archiveItemOf("https://archive.org/download/historiageneral04fernguat/historiageneral04fernguat.pdf")).toBe("historiageneral04fernguat");
    expect(archiveItemOf("https://archive.org/stream/expeditionsintov00markrich/x_djvu.txt")).toBe("expeditionsintov00markrich");
    expect(archiveItemOf("https://www.nature.com/articles/x")).toBeNull();
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://archive.org/download/descubrimientod00carvgoog/descubrimientod00carvgoog_djvu.txt") return new Response("Relacion del nuevo descubrimiento del famoso rio grande. Vimos muchos pueblos en la ribera.", { headers: { "content-type": "text/plain; charset=utf-8" } });
      return new Response("<html><head><title>Descubrimiento del rio de las Amazonas</title></head><body><p>Item page.</p></body></html>", { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const r = await retrieve({ url: "https://archive.org/details/descubrimientod00carvgoog" }, { fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://archive.org/details/descubrimientod00carvgoog");
    expect(r.text).toContain("Vimos muchos pueblos en la ribera");
    expect(r.via).toContain("_djvu.txt");
    expect(r.substitute).toBe(true);
    expect(calls[0]).toContain("_djvu.txt");
    // The stream page serves the same text when download/ will not; a throttled first answer is asked once more.
    let hits = 0;
    const throttled = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/download/")) return new Response("slow down", { status: 429 });
      if (url.includes("/stream/")) return ++hits === 1 ? new Response("busy", { status: 503 }) : new Response("<html><body><pre>Vimos muchos pueblos en la ribera.</pre></body></html>", { headers: { "content-type": "text/html" } });
      return new Response("<html><head><title>Descubrimiento</title></head><body><p>Item page.</p></body></html>", { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const viaStream = await retrieve({ url: "https://archive.org/details/descubrimientod00carvgoog" }, { fetchImpl: throttled, retryDelayMs: 1 });
    expect(viaStream.ok).toBe(true);
    expect(viaStream.via).toContain("/stream/");
    expect(viaStream.text).toContain("Vimos muchos pueblos");
    // When no route serves the text, the item page is not passed off as it: the fetch fails, saying why, and keeps the page's title so the record can still be matched.
    const noText = (async (input: string | URL | Request) => (String(input).includes("_djvu.txt") ? new Response("gone", { status: 404 }) : new Response("<html><head><title>Descubrimiento del rio de las Amazonas</title></head><body><p>Item page only.</p></body></html>", { headers: { "content-type": "text/html" } }))) as typeof fetch;
    const failed = await retrieve({ url: "https://archive.org/details/descubrimientod00carvgoog" }, { fetchImpl: noText, retryDelayMs: 1 });
    expect(failed.ok).toBe(false);
    expect(failed.text).toBeNull();
    expect(failed.reason).toMatch(/OCR text not served .*the item page is a viewer, not the text/);
    expect(failed.pageTitle).toBe("Descubrimiento del rio de las Amazonas");
  });
});

describe("PubMed Central: the page is the key, Europe PMC's JATS is the text", () => {
  const jats = `<article><front><article-meta><article-title>Elastography for calf trigger points</article-title><abstract><p>Runners.</p></abstract></article-meta></front><body><sec><title>Results</title><p>Active points showed larger cross-sectional area (28 mm<sup>2</sup> vs. 17 mm<sup>2</sup>, p = 0.014)<xref ref-type="bibr" rid="CR3">3</xref>.</p><table-wrap><label>Table 2</label><caption><p>Comparison</p></caption><table><tr><th>Parameter</th><th>ATrPs</th></tr><tr><td>Mean VAS score</td><td>8.9 ± 0.7</td></tr></table></table-wrap></sec></body><back><ref-list><ref><mixed-citation>Noise 2001</mixed-citation></ref></ref-list></back></article>`;
  it("names the PMCID a URL carries and renders JATS as text — tables as rows, superscripts as the article shows them, citations and references dropped", async () => {
    const { pmcIdOf, jatsToText } = await import("../pipeline/fetch.ts");
    expect(pmcIdOf("https://pmc.ncbi.nlm.nih.gov/articles/PMC12647689/")).toBe("PMC12647689");
    expect(pmcIdOf("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/")).toBe("PMC1234567");
    expect(pmcIdOf("https://europepmc.org/article/PMC/PMC1234567")).toBe("PMC1234567");
    expect(pmcIdOf("https://www.nature.com/articles/x")).toBeNull();
    const text = jatsToText(jats);
    expect(text).toContain("Elastography for calf trigger points");
    expect(text).toContain("Active points showed larger cross-sectional area (28 mm² vs. 17 mm², p = 0.014).");
    expect(text).toContain("Mean VAS score | 8.9 ± 0.7");
    expect(text).toContain("Table 2");
    expect(text).not.toContain("Noise 2001");
    expect(text).not.toContain("CR3");
    // The same rendering for HTML, so a quote of a unit reads alike whichever route served the article.
    const { stripHtml } = await import("../pipeline/fetch.ts");
    expect(stripHtml("<p>area (28 mm<sup>2</sup> vs. 17 mm<sup>2</sup>, p = 0.014)</p>")).toBe("area (28 mm² vs. 17 mm², p = 0.014)");
  });
  it("reads Europe PMC's full text when the PMC page serves a challenge, keeps the page as the key and says so; a page that serves is read as itself", async () => {
    const calls: string[] = [];
    const challenged = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12647689/fullTextXML") return new Response(jats, { headers: { "content-type": "application/xml" } });
      return new Response("<html><body>Just a moment...</body></html>", { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const r = await retrieve({ url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12647689/" }, { fetchImpl: challenged });
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://pmc.ncbi.nlm.nih.gov/articles/PMC12647689/");
    expect(r.substitute).toBe(true);
    expect(r.via).toContain("Europe PMC full text (JATS XML) for PMC12647689");
    expect(r.pageTitle).toBe("Elastography for calf trigger points");
    expect(r.text).toContain("Mean VAS score | 8.9 ± 0.7");
    expect(calls[0]).toBe("https://pmc.ncbi.nlm.nih.gov/articles/PMC12647689/");
    const served = (async () => new Response(`<html><head><title>PMC</title></head><body><p>${"The article itself. ".repeat(40)}</p></body></html>`, { headers: { "content-type": "text/html" } })) as typeof fetch;
    const direct = await retrieve({ url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12647689/" }, { fetchImpl: served });
    expect(direct.ok).toBe(true);
    expect(direct.via).toBeUndefined();
    const none = (async () => new Response("gone", { status: 404 })) as typeof fetch;
    const failed = await retrieve({ url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12647689/" }, { fetchImpl: none });
    expect(failed.ok).toBe(false);
    expect(failed.reason).toContain("HTTP 404");
    expect(failed.reason).toContain("Europe PMC full text for PMC12647689: HTTP 404");
  });
  it("finds the PMCID by DOI when a walled page has no open copy OpenAlex knows", async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://api.openalex.org/")) return new Response(JSON.stringify({ open_access: {}, locations: [] }), { headers: { "content-type": "application/json" } });
      if (url.includes("europepmc/webservices/rest/search")) return new Response(JSON.stringify({ resultList: { result: [{ pmcid: "PMC12647689", doi: "10.1038/s41598-025-00001-1" }] } }), { headers: { "content-type": "application/json" } });
      if (url.endsWith("/PMC12647689/fullTextXML")) return new Response("<article><body><sec><p>The full text by DOI.</p></sec></body></article>", { headers: { "content-type": "application/xml" } });
      return new Response("<html><body>Please enable cookies</body></html>", { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const r = await retrieve({ url: "https://www.nature.com/articles/s41598-025-00001-1", doi: "10.1038/s41598-025-00001-1" }, { fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://www.nature.com/articles/s41598-025-00001-1");
    expect(r.text).toContain("The full text by DOI.");
    expect(r.via).toBe("Europe PMC full text (JATS XML) for PMC12647689, found by DOI 10.1038/s41598-025-00001-1");
  });
});
