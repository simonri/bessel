import { describe, expect, it } from "vitest";
import type { VaultEntry } from "../vault-types";
import { buildTree, filterTree } from "./tree";

function entry(rel: string, kind: VaultEntry["kind"] = "md"): VaultEntry {
  return { rel, kind, mtimeMs: 0, size: 0 };
}

describe("buildTree", () => {
  it("nests files under their folder", () => {
    const tree = buildTree([entry("Journal/2026-08-19.md"), entry("Fiske.md")]);
    const journal = tree.find((n) => n.name === "Journal");
    expect(journal?.kind).toBe("dir");
    expect(journal?.children.map((c) => c.rel)).toEqual([
      "Journal/2026-08-19.md",
    ]);
  });

  it("synthesizes intermediate folders that have no explicit dir entry", () => {
    const tree = buildTree([entry("a/b/c.md")]);
    const a = tree.find((n) => n.rel === "a");
    expect(a?.kind).toBe("dir");
    const b = a?.children.find((n) => n.rel === "a/b");
    expect(b?.kind).toBe("dir");
    expect(b?.children.map((c) => c.rel)).toEqual(["a/b/c.md"]);
  });

  it("puts folders before files at the same level", () => {
    const tree = buildTree([entry("z.md"), entry("A/note.md")]);
    expect(tree.map((n) => n.name)).toEqual(["A", "z.md"]);
  });

  it("sorts case-insensitively with natural numeric order", () => {
    const tree = buildTree([
      entry("note 10.md"),
      entry("Note 2.md"),
      entry("note 1.md"),
      entry("apple.md"),
      entry("Banana.md"),
    ]);
    expect(tree.map((n) => n.name)).toEqual([
      "apple.md",
      "Banana.md",
      "note 1.md",
      "Note 2.md",
      "note 10.md",
    ]);
  });

  it("merges explicit dir entries with synthesized ones without duplicating", () => {
    const tree = buildTree([entry("Journal", "dir"), entry("Journal/note.md")]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children.map((c) => c.rel)).toEqual(["Journal/note.md"]);
  });
});

describe("filterTree", () => {
  const tree = buildTree([
    entry("Journal/2026-08-19.md"),
    entry("Journal/2026-08-18.md"),
    entry("Recipes/Pasta.md"),
    entry("Fiske.md"),
  ]);

  it("returns the tree unchanged for an empty query", () => {
    expect(filterTree(tree, "")).toBe(tree);
  });

  it("keeps only matching files and their ancestor folders", () => {
    const filtered = filterTree(tree, "pasta");
    expect(filtered.map((n) => n.name)).toEqual(["Recipes"]);
    expect(filtered[0]!.children.map((c) => c.rel)).toEqual([
      "Recipes/Pasta.md",
    ]);
  });

  it("matches case-insensitively across folders", () => {
    const filtered = filterTree(tree, "2026-08-19");
    expect(filtered.map((n) => n.name)).toEqual(["Journal"]);
    expect(filtered[0]!.children.map((c) => c.rel)).toEqual([
      "Journal/2026-08-19.md",
    ]);
  });
});
