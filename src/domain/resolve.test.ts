import { describe, expect, it } from "vitest";
import { acceptCandidate, leadsNamedInReport, parseLead, resolveLead, titleScore } from "../pipeline/resolve.ts";

/** Leads into documents: the report's named-but-unopened works are pinned through the open indexes and accepted only
 *  when title, year and an author agree (2026-09-17). */

const REPORT = `## Findings
- Something cited (https://doi.org/10.1/x).

## Coverage
Opened two things.

7. **Named, not opened**
- Stecco et al., 2013, "Fascial Components of the Myofascial Pain Syndrome" — the densification concept the essay leans on.
- Petrie, 1883, "The Pyramids and Temples of Gizeh" — the casing-stone measurements.
- a bare mention of cortical smudging in chronic pain
- none

## Something after
- not a lead`;

describe("leads in a report", () => {
  it("parses the Named, not opened section: quoted titles, years, authors; bare text stays a text lead", () => {
    const leads = leadsNamedInReport(REPORT);
    expect(leads.map((l) => l.title ?? null)).toEqual(["Fascial Components of the Myofascial Pain Syndrome", "The Pyramids and Temples of Gizeh", null, null]);
    expect(leads[0]).toMatchObject({ year: "2013", authors: ["Stecco"] });
    expect(leads[1]).toMatchObject({ year: "1883", authors: ["Petrie"] });
    expect(leads[2].text).toBe("a bare mention of cortical smudging in chronic pain");
    expect(leadsNamedInReport("## Findings\nnothing here")).toEqual([]);
    expect(parseLead('- Moseley and Flor, 2012, "Targeting Cortical Representations in the Treatment of Chronic Pain" — body maps').authors).toEqual(["Moseley", "Flor"]);
  });
  it("scores titles by the share of the lead's words carried, and accepts only on title, year and author", () => {
    expect(titleScore("The Pyramids and Temples of Gizeh", "The pyramids and temples of Gizeh / by W. M. Flinders Petrie")).toBe(1);
    expect(titleScore("The Pyramids and Temples of Gizeh", "Egyptian temples")).toBeLessThan(0.5);
    expect(titleScore("ab", "ab")).toBe(0);
    const lead = parseLead('- Petrie, 1883, "The Pyramids and Temples of Gizeh" — casing stones');
    const good = { title: "The pyramids and temples of Gizeh", year: "1883", authors: ["Petrie, W. M. Flinders"], url: "u", identifier: "archive:x", via: "v", score: 1 };
    expect(acceptCandidate(lead, good)).toBe(true);
    expect(acceptCandidate(lead, { ...good, year: "1990" })).toBe(false);
    expect(acceptCandidate(lead, { ...good, authors: ["Lehner, Mark"] })).toBe(false);
    expect(acceptCandidate(lead, { ...good, score: 0.5 })).toBe(false);
    expect(acceptCandidate({ text: "cortical smudging chronic pain body maps" }, { ...good, title: "Cortical smudging and body maps in chronic pain", authors: [], year: undefined, score: 0.75 })).toBe(true);
  });
});

describe("resolveLead", () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  it("takes the best agreeing candidate across the indexes and none when nothing agrees", async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://api.openalex.org/works?search=")) return json({ results: [{ title: "Fascial components of the myofascial pain syndrome", publication_year: 2013, doi: "https://doi.org/10.1007/s11916-013-0352-9", authorships: [{ author: { display_name: "Antonio Stecco" } }], open_access: { oa_url: null }, best_oa_location: null }, { title: "Something else about fascia", publication_year: 2013, doi: "https://doi.org/10.1/other", authorships: [{ author: { display_name: "Stecco" } }] }] });
      if (url.startsWith("https://api.semanticscholar.org/")) return json({ data: [{ title: "Fascial Components of the Myofascial Pain Syndrome", year: 2013, authors: [{ name: "A. Stecco" }], externalIds: { DOI: "10.1007/s11916-013-0352-9" }, openAccessPdf: { url: "https://example.org/stecco2013.pdf" } }] });
      if (url.startsWith("https://www.ebi.ac.uk/")) return json({ resultList: { result: [] } });
      if (url.startsWith("https://archive.org/advancedsearch.php")) return json({ response: { docs: [] } });
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
    const r = await resolveLead(parseLead('- Stecco et al., 2013, "Fascial Components of the Myofascial Pain Syndrome" — densification'), fetchImpl);
    expect(r?.identifier).toBe("doi:10.1007/s11916-013-0352-9");
    expect(r?.url).toBe("https://example.org/stecco2013.pdf"); // the open PDF is preferred over the DOI page
    expect(r?.via).toMatch(/Semantic Scholar|OpenAlex/);
    const none = await resolveLead(parseLead('- Nobody, 1999, "A Title No Index Holds" — x'), fetchImpl);
    expect(none).toBeNull();
    const archiveOnly = (async (input: string | URL | Request) => (String(input).startsWith("https://archive.org/advancedsearch.php") ? json({ response: { docs: [{ identifier: "pyramidstemplesof00petr", title: "The pyramids and temples of Gizeh", year: "1883", creator: "Petrie, W. M. Flinders (William Matthew Flinders), Sir, 1853-1942" }] } }) : json({}))) as typeof fetch;
    const book = await resolveLead(parseLead('- Petrie, 1883, "The Pyramids and Temples of Gizeh" — casing stones'), archiveOnly);
    expect(book).toMatchObject({ identifier: "archive:pyramidstemplesof00petr", url: "https://archive.org/details/pyramidstemplesof00petr" });
  });
});
