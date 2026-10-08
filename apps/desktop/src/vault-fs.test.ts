import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertNotRoot,
  assertRenameTargetFree,
  createExclusive,
  listIndexableRels,
  MAX_INDEXED_BYTES,
  rewriteLinksAfterRename,
} from "./vault-fs.js";

let root: string;

function write(rel: string, content: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const deps = {
  lock: <T>(_abs: string, task: () => Promise<T>) => task(),
  log: () => {},
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-fs-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("assertNotRoot", () => {
  it("rejects paths that resolve to the vault root", () => {
    expect(() => assertNotRoot(root, path.resolve(root))).toThrow();
    expect(() => assertNotRoot(`${root}/`, root)).toThrow();
    expect(() => assertNotRoot(root, path.join(root, "a.md"))).not.toThrow();
  });
});

describe("assertRenameTargetFree", () => {
  it("allows a free target", async () => {
    write("a.md", "a");
    await expect(
      assertRenameTargetFree(
        path.join(root, "a.md"),
        path.join(root, "b.md"),
        "b.md",
      ),
    ).resolves.toBeUndefined();
  });

  it("refuses to replace another file or folder", async () => {
    write("a.md", "a");
    write("b.md", "b");
    fs.mkdirSync(path.join(root, "dir"));
    await expect(
      assertRenameTargetFree(
        path.join(root, "a.md"),
        path.join(root, "b.md"),
        "b.md",
      ),
    ).rejects.toThrow('"b.md" already exists');
    await expect(
      assertRenameTargetFree(
        path.join(root, "a.md"),
        path.join(root, "dir"),
        "dir",
      ),
    ).rejects.toThrow("already exists");
  });

  it("allows a target that is the source itself (case-only rename)", async () => {
    write("a.md", "a");
    fs.linkSync(path.join(root, "a.md"), path.join(root, "A.md"));
    await expect(
      assertRenameTargetFree(
        path.join(root, "a.md"),
        path.join(root, "A.md"),
        "A.md",
      ),
    ).resolves.toBeUndefined();
  });
});

describe("createExclusive", () => {
  it("creates the requested name when free", async () => {
    await expect(createExclusive(root, "Notes/New.md", "x")).resolves.toBe(
      "Notes/New.md",
    );
    expect(read("Notes/New.md")).toBe("x");
  });

  it("suffixes instead of replacing an existing file", async () => {
    write("Untitled.md", "keep me");
    await expect(createExclusive(root, "Untitled.md", "new")).resolves.toBe(
      "Untitled 1.md",
    );
    expect(read("Untitled.md")).toBe("keep me");
    expect(read("Untitled 1.md")).toBe("new");
  });

  it("gives concurrent creates distinct names", async () => {
    const rels = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createExclusive(root, "Untitled.md", `n${i}`),
      ),
    );
    expect(new Set(rels).size).toBe(5);
    const contents = rels.map(read).sort();
    expect(contents).toEqual(["n0", "n1", "n2", "n3", "n4"]);
  });

  it("refuses the vault root itself", async () => {
    await expect(createExclusive(root, ".", "x")).rejects.toThrow();
  });
});

describe("listIndexableRels", () => {
  it("skips notes over the index size cap", async () => {
    write("small.md", "hi");
    write("huge.md", "x".repeat(MAX_INDEXED_BYTES + 1));
    await expect(listIndexableRels(root)).resolves.toEqual(["small.md"]);
  });
});

describe("rewriteLinksAfterRename", () => {
  it("rewrites links and reports skipped notes", async () => {
    write("New.md", "renamed note");
    write("a.md", "see [[Old]]");
    write("b.md", "also [[Old]]");
    write("c.md", "unrelated");

    const result = await rewriteLinksAfterRename(
      root,
      "Old.md",
      "New.md",
      new Set(["b.md"]),
      deps,
    );

    expect(result).toEqual({
      updatedFiles: 1,
      skippedFiles: ["b.md"],
      failedFiles: [],
    });
    expect(read("a.md")).toBe("see [[New]]");
    expect(read("b.md")).toBe("also [[Old]]");
    expect(read("c.md")).toBe("unrelated");
  });

  it("collects failures instead of aborting the rewrite", async () => {
    write("a.md", "[[Old]]");
    write("b.md", "[[Old]]");
    const log = vi.fn();
    const result = await rewriteLinksAfterRename(
      root,
      "Old.md",
      "New.md",
      new Set(),
      {
        log,
        lock: async (abs, task) => {
          if (abs.endsWith("a.md")) throw new Error("disk full");
          return task();
        },
      },
    );
    expect(result.failedFiles).toEqual(["a.md"]);
    expect(result.updatedFiles).toBe(1);
    expect(read("b.md")).toBe("[[New]]");
    expect(log).toHaveBeenCalledOnce();
  });
});
