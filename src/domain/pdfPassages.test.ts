import { describe, expect, it } from "vitest";
import { inspectPdf, pdfInput, pageImageInput } from "../../scripts/lib/pdf-passages.mjs";
import { locatePassage, retrieveSource, sha256 } from "../../scripts/lib/source-passages.mjs";
import { PassageSchema } from "./researchProposal";

const bytes = Buffer.from("%PDF-1.4\nsynthetic fixture, not a publication");
const container = (pages = 4, encrypted = "no") => async () => ({ stdout: `Pages: ${pages}\nEncrypted: ${encrypted}\n`, stderr: "" });

describe("bounded PDF reading", () => {
  it("inspects byte, page, encryption and header limits before model input", async () => {
    expect(await inspectPdf(bytes, { run: container() })).toEqual({ pages: 4, bytes: bytes.length });
    await expect(inspectPdf(bytes, { run: container(61) })).rejects.toThrow(/1–60 pages/);
    await expect(inspectPdf(bytes, { run: container(0) })).rejects.toThrow(/1–60 pages/);
    await expect(inspectPdf(bytes, { run: container(4, "yes") })).rejects.toThrow(/encrypted/);
    await expect(inspectPdf(Buffer.from("not a PDF"))).rejects.toThrow(/header/);
    await expect(inspectPdf(Buffer.alloc(10000001))).rejects.toThrow(/10 MB/);
    expect(() => pdfInput({ data: bytes.toString("base64"), pages: 61 })).toThrow(/bounded/);
    expect(() => pdfInput({ data: "invalid", pages: 1 })).toThrow(/bytes/);
  });
  it("labels the mechanically selected page image and rejects mismatched page bounds", () => {
    const document = { pages: 4, data: bytes.toString("base64") };
    const image = { page: 3, data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString("base64") };
    const parts = pageImageInput(image, document);
    expect(parts[0].text).toContain("physical PDF page 3");
    expect(parts[1].image_url).toContain(image.data);
    expect(() => pageImageInput({ ...image, page: 5 }, document)).toThrow(/invalid/);
    expect(() => pageImageInput({ ...image, data: "invalid" }, document)).toThrow(/PNG/);
  });
  it("binds the actual downloaded PDF, keeps no invented text hash and bounds streamed bytes", async () => {
    const fetchImpl = async () => new Response(bytes, { headers: { "content-type": "application/pdf" } });
    const readPdf = async () => ({ pages: 4, bytes: bytes.length });
    const capture = await retrieveSource("https://example.org/fixture.pdf", { fetchImpl, readPdf });
    expect(capture).toMatchObject({ responseHash: sha256(bytes), textHash: null, text: null,
      extractor: "pdf-pages-v1", pdf: { pages: 4 } });
    expect(pdfInput(capture.document).file_data).toBe(`data:application/pdf;base64,${bytes.toString("base64")}`);
    await expect(retrieveSource("https://example.org/fixture.pdf", { fetchImpl, readPdf, maxPdfBytes: 10 })).rejects.toThrow(/byte limit/);
    const anchor = locatePassage(capture, "This synthetic passage is visible on page three.", "SRC-TST", 3);
    expect(PassageSchema.safeParse(anchor).success).toBe(false); // no independent page check yet
    const checked = { ...anchor, pageCheck: { model: "synthetic-reader", inputHash: sha256("packet"),
      quoteSupported: true, locatorSupported: true } };
    expect(PassageSchema.safeParse(checked).success).toBe(true);
    expect(PassageSchema.safeParse({ ...checked, textHash: sha256(bytes) }).success).toBe(false);
    expect(() => locatePassage(capture, anchor.quote, "SRC-TST", 5)).toThrow(/valid physical/);
    expect(() => locatePassage(capture, anchor.quote, "SRC-TST")).toThrow(/valid physical/);
  });
});
