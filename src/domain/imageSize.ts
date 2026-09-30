/**
 * The pixel size of an image file under public/, read from its header at
 * build time — so a page can reserve an image's place before it loads and
 * nothing jumps when it arrives (the plates load lazily, and without a
 * size each one opened as a sliver and then pushed the article down).
 * JPEG and PNG, which is every image the site holds; anything else, or a
 * file that cannot be read, has no size and the image is rendered as before.
 */
import fs from "node:fs";
import path from "node:path";

export interface ImageSize {
  width: number;
  height: number;
}

/** The size a PNG or JPEG header declares, or null. Pure over the bytes. */
export function sizeOf(bytes: Uint8Array): ImageSize | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: the signature, then IHDR's width and height as big-endian 32-bit integers.
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString("ascii", 12, 16) === "IHDR") {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  // JPEG: walk the segments to the first start-of-frame marker (SOF0–SOF15, less the three that are not frames).
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++; // fill byte
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2; // markers with no length
        continue;
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

const cache = new Map<string, ImageSize | null>();

/** The size of a public asset by its site path (e.g. "/images/cases/x/cover.jpg"), or null when it cannot be read. */
export function imageSize(file: string, root = process.cwd()): ImageSize | null {
  const full = path.join(root, "public", file);
  if (cache.has(full)) return cache.get(full)!;
  let size: ImageSize | null = null;
  try {
    const fd = fs.openSync(full, "r");
    try {
      // A JPEG's frame header follows its metadata segments, which can run to tens of kilobytes; the file's first 256 KB hold it.
      const head = Buffer.alloc(Math.min(fs.fstatSync(fd).size, 262_144));
      fs.readSync(fd, head, 0, head.length, 0);
      size = sizeOf(head);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    size = null;
  }
  cache.set(full, size);
  return size;
}
