import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertNotRoot,
  assertRenameTargetFree,
  atomicWrite,
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

describe("atomicWrite", () => {
  it("keeps the note's permissions", async () => {
    write("private.md", "before");
    fs.chmodSync(path.join(root, "private.md"), 0o600);
    write("shared.md", "before");
    fs.chmodSync(path.join(root, "shared.md"), 0o664);

    await atomicWrite(path.join(root, "private.md"), "after");
    await atomicWrite(path.join(root, "shared.md"), "after");

    const mode = (rel: string) =>
      fs.statSync(path.join(root, rel)).mode & 0o777;
    expect(read("private.md")).toBe("after");
    expect(mode("private.md")).toBe(0o600);
    expect(mode("shared.md")).toBe(0o664);
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

  it("leaves links to another note of the same name", async () => {
    // Archive/Fiske.md was just renamed; [[Fiske]] opens the shorter Fiske.md.
    write("Fiske.md", "the shop");
    write("Archive/Fiskebutik.md", "the old shop");
    write("a.md", "see [[Fiske]] and [[Archive/Fiske]]");
    write("Archive/b.md", "see [[Fiske]]");

    const result = await rewriteLinksAfterRename(
      root,
      "Archive/Fiske.md",
      "Archive/Fiskebutik.md",
      new Set(),
      deps,
    );

    expect(result.updatedFiles).toBe(1);
    expect(read("a.md")).toBe("see [[Fiske]] and [[Archive/Fiskebutik]]");
    expect(read("Archive/b.md")).toBe("see [[Fiske]]");
  });

  it("links by full path when the new name is another note's", async () => {
    write("Hamn.md", "the harbour");
    write("Archive/Hamn.md", "the shop, renamed");
    write("a.md", "see [[Fiske]]");

    await rewriteLinksAfterRename(
      root,
      "Archive/Fiske.md",
      "Archive/Hamn.md",
      new Set(),
      deps,
    );

    expect(read("a.md")).toBe("see [[Archive/Hamn]]");
    expect(read("Hamn.md")).toBe("the harbour");
  });

  it("rewrites links into a renamed folder", async () => {
    // "Places" was just renamed to "Ställen".
    write("Ställen/Fiske.md", "see [[Places/Hamn#Öppet]] and [[Hamn]]");
    write("Ställen/Hamn.md", "back to [[Places/Fiske]]");
    write("Placesbook.md", "not in the folder");
    write("b.md", "[[fiske]]");
    write("a.md", "[[Places/Fiske|the shop]], [[Fiske]], [[Placesbook]]");

    // Open with unsaved edits under its old path.
    const result = await rewriteLinksAfterRename(
      root,
      "Places",
      "Ställen",
      new Set(["Places/Hamn.md"]),
      deps,
    );

    expect(result).toEqual({
      updatedFiles: 2,
      skippedFiles: ["Ställen/Hamn.md"],
      failedFiles: [],
    });
    expect(read("Ställen/Hamn.md")).toBe("back to [[Places/Fiske]]");
    expect(read("b.md")).toBe("[[fiske]]");
    expect(read("a.md")).toBe(
      "[[Ställen/Fiske|the shop]], [[Fiske]], [[Placesbook]]",
    );
    expect(read("Ställen/Fiske.md")).toBe(
      "see [[Ställen/Hamn#Öppet]] and [[Hamn]]",
    );
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
