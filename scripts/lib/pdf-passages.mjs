import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const PDF_EXTRACTOR = "pdf-pages-v1";
export const MAX_PDF_BYTES = 10000000;
export const MAX_PDF_PAGES = 60;
const execute = promisify(execFile);
const runInfo = async (file, args, options) => {
  const { stdout } = await execute(file, args, options);
  return { stdout: String(stdout) };
};

/** Inspect the container before any paid reading. pdfinfo does not render pages
 * or execute embedded actions. Both models later receive the same complete PDF. */
export async function inspectPdf(bytes, { timeoutMs = 20000, run = runInfo } = {}) {
  if (bytes.length > MAX_PDF_BYTES) throw new Error("PDF exceeds the 10 MB reading limit");
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("invalid PDF header");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aletheia-pdf-"));
  try {
    const file = path.join(dir, "source.pdf");
    await fs.writeFile(file, bytes);
    let result;
    try {
      result = await run("pdfinfo", [file], { timeout: timeoutMs, maxBuffer: 100000,
        encoding: "utf8", env: { ...process.env, LC_ALL: "C" } });
    } catch (error) {
      if (error.code === "ENOENT") throw new Error("PDF reading requires Poppler pdfinfo");
      throw new Error("PDF container inspection failed; no paid reading attempted", { cause: error });
    }
    const pages = Number(result.stdout.match(/^Pages:\s+(\d+)\s*$/m)?.[1]);
    if (!Number.isInteger(pages) || pages < 1 || pages > MAX_PDF_PAGES)
      throw new Error("PDF must contain 1–60 pages; no partial reading");
    if (!/^Encrypted:\s+no\s*$/m.test(result.stdout)) throw new Error("encrypted PDF is not supported");
    return { pages, bytes: bytes.length };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

/** Validate the same payload at the paid-call boundary too. Full bytes never
 * enter public receipts; the request hash binds them to the model response. */
export function pdfInput(document) {
  if (!document || !Number.isInteger(document.pages) || document.pages < 1 || document.pages > MAX_PDF_PAGES ||
    typeof document.data !== "string" || document.data.length > Math.ceil(MAX_PDF_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(document.data)) throw new Error("invalid bounded PDF payload");
  const bytes = Buffer.from(document.data, "base64");
  if (bytes.length > MAX_PDF_BYTES || bytes.subarray(0, 5).toString() !== "%PDF-" || bytes.toString("base64") !== document.data)
    throw new Error("invalid bounded PDF bytes");
  return { type: "input_file", filename: "source.pdf", file_data: `data:application/pdf;base64,${document.data}` };
}

/** Page counting is done by Poppler, not by the model reading the whole file.
 * The checker receives this explicit page beside the PDF's broader context. */
export async function renderPdfPage(document, page, { timeoutMs = 20000 } = {}) {
  pdfInput(document);
  if (!Number.isInteger(page) || page < 1 || page > document.pages) throw new Error("invalid PDF page to render");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aletheia-pdf-page-"));
  try {
    const file = path.join(dir, "source.pdf"), output = path.join(dir, "page");
    await fs.writeFile(file, Buffer.from(document.data, "base64"));
    await execute("pdftoppm", ["-f", String(page), "-singlefile", "-scale-to", "1800", "-png", file, output],
      { timeout: timeoutMs, maxBuffer: 100000 });
    const bytes = await fs.readFile(`${output}.png`);
    if (bytes.length > 6000000 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new Error("PDF page image outside bounded PNG limits");
    return { page, data: bytes.toString("base64") };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

export function pageImageInput(image, document) {
  if (!document || !image || !Number.isInteger(image.page) || image.page < 1 || image.page > document.pages ||
    typeof image.data !== "string" || image.data.length > 8000000) throw new Error("invalid PDF page image");
  const bytes = Buffer.from(image.data, "base64");
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString("base64") !== image.data)
    throw new Error("invalid PDF page PNG");
  return [{ type: "input_text", text: `The following image is physical PDF page ${image.page}, rendered directly from the attached file. Verify the quote on THIS image; do not guess its page from the book's printed pagination.` },
    { type: "input_image", image_url: `data:image/png;base64,${image.data}`, detail: "high" }];
}
