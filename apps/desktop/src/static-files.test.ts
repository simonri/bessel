import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseRange, serveLocalFile } from "./static-files.js";

describe("parseRange", () => {
  it("serves the whole file without a usable header", () => {
    expect(parseRange(null, 100)).toEqual({ kind: "full" });
    expect(parseRange("items=0-1", 100)).toEqual({ kind: "full" });
    expect(parseRange("bytes=-", 100)).toEqual({ kind: "full" });
  });

  it("parses closed, open-ended and suffix ranges", () => {
    expect(parseRange("bytes=10-19", 100)).toEqual({
      kind: "partial",
      start: 10,
      end: 19,
    });
    expect(parseRange("bytes=90-", 100)).toEqual({
      kind: "partial",
      start: 90,
      end: 99,
    });
    expect(parseRange("bytes=-500", 100)).toEqual({
      kind: "partial",
      start: 0,
      end: 99,
    });
  });

  it("clamps an end past EOF", () => {
    expect(parseRange("bytes=50-1000", 100)).toEqual({
      kind: "partial",
      start: 50,
      end: 99,
    });
  });

  it("rejects inverted, past-EOF and empty-suffix ranges", () => {
    expect(parseRange("bytes=20-10", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=100-", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=-0", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" });
  });
});

describe("serveLocalFile", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "static-files-"));
    fs.writeFileSync(path.join(dir, "data.bin"), "0123456789");
    fs.writeFileSync(path.join(dir, "empty.bin"), "");
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("returns 206 with the requested bytes", async () => {
    const res = await serveLocalFile(path.join(dir, "data.bin"), "bytes=2-4");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(await res.text()).toBe("234");
  });

  it("returns 416 for an unsatisfiable range", async () => {
    const res = await serveLocalFile(path.join(dir, "data.bin"), "bytes=20-");
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */10");
  });

  it("serves an empty file", async () => {
    const res = await serveLocalFile(path.join(dir, "empty.bin"), null);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("0");
    expect(await res.text()).toBe("");
  });
});
