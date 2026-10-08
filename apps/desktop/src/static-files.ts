import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

export const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function isImageFile(file: string): boolean {
  const mime = MIME_TYPES[path.extname(file).toLowerCase()];
  return !!mime && mime.startsWith("image/");
}

export type ByteRange =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

/** Interprets a single-range `Range` header against a file of `size` bytes. */
export function parseRange(range: string | null, size: number): ByteRange {
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!match) return { kind: "full" };
  const [, startStr, endStr] = match;
  if (!startStr && !endStr) return { kind: "full" };

  let start: number;
  let end = size - 1;
  if (startStr) {
    start = Number(startStr);
    if (endStr) end = Math.min(Number(endStr), size - 1);
  } else {
    // suffix range, e.g. "bytes=-500" for the last 500 bytes
    const suffix = Number(endStr);
    if (suffix === 0) return { kind: "unsatisfiable" };
    start = Math.max(0, size - suffix);
  }
  if (start >= size || start > end) return { kind: "unsatisfiable" };
  return { kind: "partial", start, end };
}

// electron's net.fetch() ignores the Range header on file:// URLs — it always
// returns the full file as a 200 with no Content-Length, which breaks <video>
// playback for any mp4 that needs a byte-range seek (e.g. to read a trailing
// moov atom). Serve local files ourselves so range requests get a real 206.
export async function serveLocalFile(
  filePath: string,
  range: string | null,
): Promise<Response> {
  const stat = await fs.promises.stat(filePath);
  const headers: Record<string, string> = {
    "content-type":
      MIME_TYPES[path.extname(filePath).toLowerCase()] ??
      "application/octet-stream",
    "accept-ranges": "bytes",
  };

  const parsed = parseRange(range, stat.size);
  if (parsed.kind === "unsatisfiable") {
    headers["content-range"] = `bytes */${stat.size}`;
    return new Response(null, { status: 416, headers });
  }

  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (parsed.kind === "partial") {
    ({ start, end } = parsed);
    status = 206;
    headers["content-range"] = `bytes ${start}-${end}/${stat.size}`;
  }

  headers["content-length"] = String(end - start + 1);
  if (stat.size === 0) return new Response(null, { status, headers });
  const body = Readable.toWeb(
    fs.createReadStream(filePath, { start, end }),
  ) as ReadableStream<Uint8Array>;
  return new Response(body, { status, headers });
}
