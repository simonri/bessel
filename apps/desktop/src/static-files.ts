import fs from "fs";
import path from "path";
import { Readable } from "stream";

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
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function isImageFile(file: string): boolean {
  const mime = MIME_TYPES[path.extname(file).toLowerCase()];
  return !!mime && mime.startsWith("image/");
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
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const headers: Record<string, string> = {
    "content-type":
      MIME_TYPES[path.extname(filePath).toLowerCase()] ??
      "application/octet-stream",
    "accept-ranges": "bytes",
  };

  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match) {
    const [, startStr, endStr] = match;
    if (startStr) {
      start = Number(startStr);
      if (endStr) end = Number(endStr);
    } else if (endStr) {
      // suffix range, e.g. "bytes=-500" for the last 500 bytes
      start = Math.max(0, stat.size - Number(endStr));
    }
    status = 206;
    headers["content-range"] = `bytes ${start}-${end}/${stat.size}`;
  }

  headers["content-length"] = String(end - start + 1);
  const body = Readable.toWeb(
    fs.createReadStream(filePath, { start, end }),
  ) as ReadableStream<Uint8Array>;
  return new Response(body, { status, headers });
}
