import { describe, expect, it } from "vitest";
import { leadsNamedInReport, parseLead, referenceOf, resolveLead } from "../pipeline/resolve.ts";
import { bestMatch } from "../pipeline/match.ts";

/** Leads into documents: the report's named-but-unopened works are pinned through the open indexes and matched by the
 *  one matcher the inbox's references use — a title that is the title, or a named author and the year (2026-09-17). */

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
  it("parses the Named, not opened section: quoted titles, years, authors; bare text stays a text lead; 'none' is not a lead", () => {
    const leads = leadsNamedInReport(REPORT);
    expect(leads.map((l) => l.title ?? null)).toEqual(["Fascial Components of the Myofascial Pain Syndrome", "The Pyramids and Temples of Gizeh", null]);
    expect(leads[0]).toMatchObject({ year: "2013", authors: ["Stecco"] });
    expect(leads[1]).toMatchObject({ year: "1883", authors: ["Petrie"] });
    expect(leads[2].text).toBe("a bare mention of cortical smudging in chronic pain");
    expect(leadsNamedInReport("## Findings\nnothing here")).toEqual([]);
    expect(parseLead('- Moseley and Flor, 2012, "Targeting Cortical Representations in the Treatment of Chronic Pain" — body maps').authors).toEqual(["Moseley", "Flor"]);
    expect(referenceOf(leads[1])).toEqual({ title: "The Pyramids and Temples of Gizeh", authors: ["Petrie"], year: 1883, venue: null, url: null });
  });
  it("is judged by the shared matcher: the title rule, or author and year with a looser title", () => {
    const petrie = referenceOf(parseLead('- Petrie, 1883, "The Pyramids and Temples of Gizeh" — casing stones'));
    const results = [
      { title: "Egyptian temples", publication_year: 1990, authorships: [{ author: { display_name: "Someone Else" } }] },
      { title: "The pyramids and temples of Gizeh / by W. M. Flinders Petrie", publication_year: 1883, authorships: [{ author: { display_name: "Petrie, W. M. Flinders" } }] },
      { title: "The pyramids and temples of Gizeh", publication_year: 1990, authorships: [{ author: { display_name: "Petrie" } }] }, // the year is off by a century
    ];
    expect(bestMatch(petrie, results)?.publication_year).toBe(1883);
    expect(bestMatch({ ...petrie, year: 2001 }, results)).toBeNull();
  });
});

describe("resolveLead", () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  it("takes the matching candidate across the indexes, prefers a readable document to a DOI page, and finds none when nothing agrees", async () => {
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
    expect(r?.url).toBe("https://example.org/stecco2013.pdf");
    expect(r?.via).toMatch(/Semantic Scholar/);
    expect(r?.via).toMatch(/matched on title containment 1 \(at or above the 0\.7 threshold\); year 2013 exact; author surname "stecco" found in the index's "A\. Stecco"$/);
    expect(r?.similarity).toBe(1);
    expect(r?.agreed).toEqual(["title", "year", "author"]);
    expect(r?.checks).toHaveLength(3);
    // A lead that gave an author or a year is resolved only when they agree: the same title under another name, or without a year, does not settle it.
    expect(await resolveLead(parseLead('- Lehner, 2013, "Fascial Components of the Myofascial Pain Syndrome" — x'), fetchImpl)).toBeNull();
    const noYear = (async (input: string | URL | Request) => (String(input).startsWith("https://api.openalex.org/") ? json({ results: [{ title: "Fascial components of the myofascial pain syndrome", publication_year: null, doi: "https://doi.org/10.1007/s11916-013-0352-9", authorships: [{ author: { display_name: "Antonio Stecco" } }] }] }) : json({}))) as typeof fetch;
    expect(await resolveLead(parseLead('- Stecco et al., 2013, "Fascial Components of the Myofascial Pain Syndrome" — x'), noYear)).toBeNull();
    // A bare lead — no author, no year given — may resolve on the title alone, and the provenance says only that.
    const bare = await resolveLead({ text: "Fascial Components of the Myofascial Pain Syndrome" }, fetchImpl);
    expect(bare?.agreed).toEqual(["title"]);
    expect(bare?.via).toMatch(/matched on title containment 1 \(at or above the 0\.7 threshold\)$/);
    expect(bare?.checks).toEqual(["title containment 1 (at or above the 0.7 threshold)"]);
    expect(await resolveLead(parseLead('- Nobody, 1999, "A Title No Index Holds" — x'), fetchImpl)).toBeNull();
    expect(await resolveLead({ text: "short" }, fetchImpl)).toBeNull();
    const archiveOnly = (async (input: string | URL | Request) => (String(input).startsWith("https://archive.org/advancedsearch.php") ? json({ response: { docs: [{ identifier: "pyramidstemplesof00petr", title: "The pyramids and temples of Gizeh", year: "1883", creator: "Petrie, W. M. Flinders (William Matthew Flinders), Sir, 1853-1942" }] } }) : json({}))) as typeof fetch;
    const book = await resolveLead(parseLead('- Petrie, 1883, "The Pyramids and Temples of Gizeh" — casing stones'), archiveOnly);
    expect(book).toMatchObject({ identifier: "archive:pyramidstemplesof00petr", url: "https://archive.org/details/pyramidstemplesof00petr", year: "1883" });
    expect(book?.via).toMatch(/year 1883 exact; author surname "petrie" found in the index's "Petrie, W\. M\. Flinders \(William Matthew Flinders\), Sir, 1853-1942"$/);
    // A year within one is accepted, and the provenance says that is what happened rather than "the year agreed".
    const offByOne = (async (input: string | URL | Request) => (String(input).startsWith("https://archive.org/advancedsearch.php") ? json({ response: { docs: [{ identifier: "pyramidstemplesof00petr", title: "The pyramids and temples of Gizeh", year: "1884", creator: "Petrie, W. M. Flinders (William Matthew Flinders), Sir, 1853-1942" }] } }) : json({}))) as typeof fetch;
    const near = await resolveLead(parseLead('- Petrie, 1883, "The Pyramids and Temples of Gizeh" — casing stones'), offByOne);
    expect(near?.agreed).toEqual(["title", "year", "author"]);
    expect(near?.via).toMatch(/year within one \(the lead said 1883, the index 1884\); author surname "petrie"/);
  });
});
