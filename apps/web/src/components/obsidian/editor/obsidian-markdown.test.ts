import { markdownLanguage } from "@codemirror/lang-markdown";
import type { MarkdownParser } from "@lezer/markdown";
import { describe, expect, it } from "vitest";
import { obsidianMarkdown } from "./obsidian-markdown";

// `markdownLanguage` is a plain Language wrapping a MarkdownParser (not an
// LRLanguage, so it has no `.configure()` of its own) — reconfigure the
// underlying parser directly, same as `markdown({ extensions })` does.
const parser = (markdownLanguage.parser as MarkdownParser).configure(
  obsidianMarkdown,
);

function parseNodes(doc: string) {
  const tree = parser.parse(doc);
  const nodes: { name: string; from: number; to: number; text: string }[] = [];
  tree.iterate({
    enter(node) {
      nodes.push({
        name: node.name,
        from: node.from,
        to: node.to,
        text: doc.slice(node.from, node.to),
      });
    },
  });
  return nodes;
}

describe("obsidianMarkdown", () => {
  const doc = "see [[Foo#Bar|baz]] and ![[img.png]] #tag ==hl== `code [[x]]`";
  const nodes = parseNodes(doc);

  it("parses a wikilink with heading and alias", () => {
    const link = nodes.find(
      (n) => n.name === "WikiLink" && n.text === "[[Foo#Bar|baz]]",
    );
    expect(link).toBeDefined();
  });

  it("parses an embed wrapping its wikilink", () => {
    const embed = nodes.find((n) => n.name === "Embed");
    expect(embed?.text).toBe("![[img.png]]");
    const nested = nodes.find(
      (n) =>
        n.name === "WikiLink" &&
        n.from >= (embed?.from ?? -1) &&
        n.to <= (embed?.to ?? -1),
    );
    expect(nested?.text).toBe("[[img.png]]");
  });

  it("parses a tag", () => {
    const tag = nodes.find((n) => n.name === "Tag");
    expect(tag?.text).toBe("#tag");
  });

  it("parses a highlight with HighlightMark children", () => {
    const highlight = nodes.find((n) => n.name === "Highlight");
    expect(highlight?.text).toBe("==hl==");
    const marks = nodes.filter(
      (n) =>
        n.name === "HighlightMark" &&
        n.from >= (highlight?.from ?? -1) &&
        n.to <= (highlight?.to ?? -1),
    );
    expect(marks).toHaveLength(2);
  });

  it("does not parse a wikilink inside inline code", () => {
    const codeStart = doc.indexOf("`code");
    const wikiLinksInsideCode = nodes.filter(
      (n) => n.name === "WikiLink" && n.from >= codeStart,
    );
    expect(wikiLinksInsideCode).toHaveLength(0);
  });

  it("does not treat a mid-word # as a tag", () => {
    const inline = parseNodes("see foo#bar here");
    expect(inline.some((n) => n.name === "Tag")).toBe(false);
  });

  it("leaves an empty heading marker alone", () => {
    const inline = parseNodes("just a # by itself");
    expect(inline.some((n) => n.name === "Tag")).toBe(false);
  });
});
