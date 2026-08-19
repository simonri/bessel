// @lezer/markdown inline extensions for Obsidian syntax not covered by GFM:
// `[[wikilink]]` / `![[embed]]`, `#tag`, `==highlight==`. Modeled directly on
// the built-in Strikethrough/InlineCode parsers (see @lezer/markdown source)
// so precedence and delimiter-matching behave the same way.

import { tags as t } from "@lezer/highlight";
import type { MarkdownConfig } from "@lezer/markdown";

const CH_BRACKET_OPEN = 91; // [
const CH_BRACKET_CLOSE = 93; // ]
const CH_BANG = 33; // !
const CH_HASH = 35; // #
const CH_EQ = 61; // =
const CH_NEWLINE = 10;

const TAG_BODY = /^[\p{L}\p{N}_/-]+/u;
const TAG_NON_NUMERIC = /[\p{L}_]/u;
const WORD_CHAR = /[\p{L}\p{N}_]/u;

// Max scan length for a `[[...]]` body, so a stray unmatched `[[` on a huge
// line doesn't force a full-line scan for every occurrence.
const MAX_WIKILINK_SCAN = 400;

const wikiLink: MarkdownConfig = {
  defineNodes: [
    { name: "WikiLink", style: t.link },
    { name: "Embed", style: t.link },
  ],
  parseInline: [
    {
      name: "WikiLink",
      before: "Link",
      parse(cx, next, pos) {
        const bang = next === CH_BANG;
        const open = bang ? pos + 1 : pos;
        if (
          cx.char(open) !== CH_BRACKET_OPEN ||
          cx.char(open + 1) !== CH_BRACKET_OPEN
        )
          return -1;

        const scanEnd = Math.min(cx.end, open + 2 + MAX_WIKILINK_SCAN);
        let end = -1;
        for (let i = open + 2; i < scanEnd - 1; i++) {
          const c = cx.char(i);
          if (c === CH_NEWLINE) break;
          if (c === CH_BRACKET_CLOSE && cx.char(i + 1) === CH_BRACKET_CLOSE) {
            end = i + 2;
            break;
          }
        }
        if (end === -1) return -1;

        const link = cx.elt("WikiLink", open, end);
        return bang
          ? cx.addElement(cx.elt("Embed", pos, end, [link]))
          : cx.addElement(link);
      },
    },
  ],
};

const tag: MarkdownConfig = {
  defineNodes: [{ name: "Tag", style: t.labelName }],
  parseInline: [
    {
      name: "Tag",
      parse(cx, next, pos) {
        if (next !== CH_HASH) return -1;
        const before = pos > 0 ? cx.slice(pos - 1, pos) : "";
        if (before && WORD_CHAR.test(before)) return -1;

        const rest = cx.slice(pos + 1, cx.end);
        const m = TAG_BODY.exec(rest);
        if (!m) return -1;
        const word = m[0].replace(/[/-]+$/, "");
        if (!word || !TAG_NON_NUMERIC.test(word)) return -1;

        return cx.addElement(cx.elt("Tag", pos, pos + 1 + word.length));
      },
    },
  ],
};

const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };

const highlight: MarkdownConfig = {
  defineNodes: [
    { name: "Highlight", style: { "Highlight/...": t.inserted } },
    { name: "HighlightMark", style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: "Highlight",
      after: "Emphasis",
      parse(cx, next, pos) {
        if (next !== CH_EQ || cx.char(pos + 1) !== CH_EQ) return -1;
        const before = cx.slice(Math.max(pos - 1, 0), pos);
        const after = cx.slice(pos + 2, pos + 3);
        const spaceBefore = before === "" || /\s/.test(before);
        const spaceAfter = after === "" || /\s/.test(after);
        return cx.addDelimiter(
          HighlightDelim,
          pos,
          pos + 2,
          !spaceAfter,
          !spaceBefore,
        );
      },
    },
  ],
};

/** Passed as `extensions` to `markdown({ base: markdownLanguage, extensions: [obsidianMarkdown] })`. */
export const obsidianMarkdown: readonly MarkdownConfig[] = [
  wikiLink,
  tag,
  highlight,
];
