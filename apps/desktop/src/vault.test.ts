import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  autoSuffixName,
  buildFileMeta,
  resolveInside,
  rewriteLinksInContent,
} from "./vault-core.js";

describe("resolveInside", () => {
  const root = "/vault";

  it("accepts nested relative paths", () => {
    expect(resolveInside(root, "Journal/2026-08-19.md")).toBe(
      path.join(root, "Journal/2026-08-19.md"),
    );
    expect(resolveInside(root, "a/b/c.md")).toBe(path.join(root, "a/b/c.md"));
  });

  it("rejects a '..' escape", () => {
    expect(() => resolveInside(root, "../x")).toThrow();
  });

  it("rejects an absolute path", () => {
    expect(() => resolveInside(root, "/abs")).toThrow();
  });

  it("rejects a nested '..' escape", () => {
    expect(() => resolveInside(root, "a/../../b")).toThrow();
  });

  it("rejects a null byte", () => {
    expect(() => resolveInside(root, "a\0b.md")).toThrow();
  });
});

describe("rewriteLinksInContent", () => {
  it("rewrites a basename-style link", () => {
    const { content, changed } = rewriteLinksInContent(
      "See [[Fiske]] for details.",
      "Places/Fiske.md",
      "Places/Fiskebutik.md",
    );
    expect(changed).toBe(true);
    expect(content).toBe("See [[Fiskebutik]] for details.");
  });

  it("rewrites a full-path-style link", () => {
    const { content, changed } = rewriteLinksInContent(
      "See [[Places/Fiske]] for details.",
      "Places/Fiske.md",
      "Places/Fiskebutik.md",
    );
    expect(changed).toBe(true);
    expect(content).toBe("See [[Places/Fiskebutik]] for details.");
  });

  it("preserves an alias", () => {
    const { content, changed } = rewriteLinksInContent(
      "[[Fiske|the fish place]]",
      "Places/Fiske.md",
      "Places/Fiskebutik.md",
    );
    expect(changed).toBe(true);
    expect(content).toBe("[[Fiskebutik|the fish place]]");
  });

  it("preserves a heading reference", () => {
    const { content, changed } = rewriteLinksInContent(
      "[[Fiske#Opening hours]]",
      "Places/Fiske.md",
      "Places/Fiskebutik.md",
    );
    expect(changed).toBe(true);
    expect(content).toBe("[[Fiskebutik#Opening hours]]");
  });

  it("preserves an embed marker", () => {
    const { content, changed } = rewriteLinksInContent(
      "![[Fiske]]",
      "Places/Fiske.md",
      "Places/Fiskebutik.md",
    );
    expect(changed).toBe(true);
    expect(content).toBe("![[Fiskebutik]]");
  });

  it("leaves non-matching links untouched", () => {
    const { content, changed } = rewriteLinksInContent(
      "[[Somewhere Else]] and [[Fiskehandlaren]]",
      "Places/Fiske.md",
      "Places/Fiskebutik.md",
    );
    expect(changed).toBe(false);
    expect(content).toBe("[[Somewhere Else]] and [[Fiskehandlaren]]");
  });
});

describe("buildFileMeta", () => {
  it("collects wikilinks with 0-based line numbers", () => {
    const content = [
      "Intro line",
      "See [[Other Note]] here.",
      "And [[Third|alias]] too.",
    ].join("\n");
    const meta = buildFileMeta("note.md", content);
    expect(meta.links).toEqual([
      {
        target: "Other Note",
        heading: null,
        alias: null,
        embed: false,
        line: 1,
      },
      { target: "Third", heading: null, alias: "alias", embed: false, line: 2 },
    ]);
  });

  it("captures headings", () => {
    const content = ["# Title", "## Subheading", "Not a heading #hashtag"].join(
      "\n",
    );
    const meta = buildFileMeta("note.md", content);
    expect(meta.headings).toEqual([
      { level: 1, text: "Title", line: 0 },
      { level: 2, text: "Subheading", line: 1 },
    ]);
  });

  it("collects inline tags but ignores ones inside code fences and URLs", () => {
    const content = [
      "Body #project tag here.",
      "```",
      "not a #tag in a fence",
      "```",
      "A url http://example.com/page#section should not count.",
      "`inline #code` also should not count.",
      "#2024 is purely numeric and should not count.",
    ].join("\n");
    const meta = buildFileMeta("note.md", content);
    expect(meta.tags.sort()).toEqual(["project"]);
  });

  it("reads frontmatter tags as a YAML list", () => {
    const content = [
      "---",
      "tags:",
      "  - work",
      "  - urgent",
      "---",
      "Body text.",
    ].join("\n");
    const meta = buildFileMeta("note.md", content);
    expect(meta.tags.sort()).toEqual(["urgent", "work"]);
  });

  it("reads frontmatter tags as a comma-separated string", () => {
    const content = ["---", "tags: work, urgent", "---", "Body text."].join(
      "\n",
    );
    const meta = buildFileMeta("note.md", content);
    expect(meta.tags.sort()).toEqual(["urgent", "work"]);
  });

  it("reads frontmatter aliases", () => {
    const content = [
      "---",
      "aliases: [Alt Name, Other Name]",
      "---",
      "Body text.",
    ].join("\n");
    const meta = buildFileMeta("note.md", content);
    expect(meta.aliases).toEqual(["Alt Name", "Other Name"]);
  });
});

describe("autoSuffixName", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vault-test-"));
  });

  afterEach(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  function existsIn(dir: string) {
    return (rel: string) => fs.existsSync(path.join(dir, rel));
  }

  it("returns the desired name when nothing collides", () => {
    expect(autoSuffixName("Untitled.md", existsIn(dir))).toBe("Untitled.md");
  });

  it("suffixes with an incrementing number on collision", async () => {
    await fs.promises.writeFile(path.join(dir, "Untitled.md"), "");
    expect(autoSuffixName("Untitled.md", existsIn(dir))).toBe("Untitled 1.md");

    await fs.promises.writeFile(path.join(dir, "Untitled 1.md"), "");
    expect(autoSuffixName("Untitled.md", existsIn(dir))).toBe("Untitled 2.md");
  });

  it("keeps the directory prefix intact", async () => {
    await fs.promises.mkdir(path.join(dir, "Attachments"), { recursive: true });
    await fs.promises.writeFile(
      path.join(dir, "Attachments", "Pasted image.png"),
      "",
    );
    expect(autoSuffixName("Attachments/Pasted image.png", existsIn(dir))).toBe(
      "Attachments/Pasted image 1.png",
    );
  });
});
