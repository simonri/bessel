import type {
  Blockquote,
  Image,
  Paragraph,
  Root,
  RootContent,
  Text,
} from "mdast";
import { visit } from "unist-util-visit";
import {
  isImageRel,
  parseLinkTarget,
  resolveLink,
  vaultAssetUrl,
} from "./wikilinks";

export interface RemarkObsidianOptions {
  /** Rels of every file in the vault, for resolving `[[wikilinks]]`. */
  files: readonly string[];
  /** Rel of the note being rendered — links resolve relative to it. */
  fromRel: string;
  /** Vault root, for building `vault://` asset URLs. */
  root: string;
}

// `[[target#heading|alias]]`, `![[embed]]`, `==highlight==` and `#tag` all
// live inside plain mdast "text" nodes (none of this is CommonMark syntax),
// so a single pass over text content covers every case at once — and, for
// free, never touches "code"/"inlineCode" nodes since those are distinct
// mdast node types the text visitor never sees.
const INLINE_RE =
  /(!?)\[\[([^[\]]+?)\]\]|==([^=\n]+)==|(^|[\s(])#([A-Za-z][A-Za-z0-9_/-]*)/g;

function buildWikiNode(
  embed: boolean,
  inner: string,
  options: RemarkObsidianOptions,
): RootContent {
  const { files, fromRel, root } = options;
  const { target, alias } = parseLinkTarget(inner);

  if (embed) {
    if (isImageRel(target)) {
      const resolvedRel = resolveLink(files, fromRel, target);
      return {
        type: "image",
        url: vaultAssetUrl(root, resolvedRel ?? target),
        alt: target,
      } as RootContent;
    }
    const resolvedRel = resolveLink(files, fromRel, target);
    return {
      type: "obsidianEmbed",
      data: {
        hName: "div",
        hProperties: {
          "data-embed": resolvedRel ?? target,
          className: ["obsidian-embed"],
        },
      },
      children: [],
    } as unknown as RootContent;
  }

  const resolvedRel = resolveLink(files, fromRel, target);
  const unresolved = resolvedRel === null;
  return {
    type: "link",
    url: "#",
    data: {
      hProperties: {
        "data-wikilink": target,
        "data-resolved": unresolved ? "false" : "true",
        className: unresolved ? ["wikilink", "unresolved"] : ["wikilink"],
      },
    },
    children: [{ type: "text", value: alias ?? target }],
  } as unknown as RootContent;
}

function buildTagNode(tag: string): RootContent {
  return {
    type: "link",
    url: "#",
    data: {
      hProperties: { "data-tag": tag, className: ["tag"] },
    },
    children: [{ type: "text", value: `#${tag}` }],
  } as unknown as RootContent;
}

function buildHighlightNode(inner: string): RootContent {
  return {
    type: "highlight",
    data: { hName: "mark" },
    children: [{ type: "text", value: inner }],
  } as unknown as RootContent;
}

function tokenizeInline(
  value: string,
  options: RemarkObsidianOptions,
): RootContent[] {
  const out: RootContent[] = [];
  let lastIndex = 0;
  INLINE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
  while ((match = INLINE_RE.exec(value))) {
    const [full, bang, wikiInner, highlightInner, tagBoundary, tagName] = match;
    if (match.index > lastIndex) {
      out.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }
    if (wikiInner !== undefined) {
      out.push(buildWikiNode(bang === "!", wikiInner, options));
    } else if (highlightInner !== undefined) {
      out.push(buildHighlightNode(highlightInner));
    } else if (tagName !== undefined) {
      if (tagBoundary) out.push({ type: "text", value: tagBoundary });
      out.push(buildTagNode(tagName));
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < value.length) {
    out.push({ type: "text", value: value.slice(lastIndex) });
  }
  return out;
}

function rewriteImageUrl(node: Image, options: RemarkObsidianOptions): void {
  const url = node.url;
  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) return; // absolute/data/http(s) URL — leave as-is
  const resolvedRel = resolveLink(options.files, options.fromRel, url);
  node.url = vaultAssetUrl(options.root, resolvedRel ?? url);
}

const CALLOUT_RE = /^\[!([A-Za-z][\w-]*)\]([+-]?)([^\n]*)/;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function applyCallout(node: Blockquote): void {
  const first = node.children[0] as Paragraph | undefined;
  if (!first || first.type !== "paragraph") return;
  const firstChild = first.children[0] as Text | undefined;
  if (!firstChild || firstChild.type !== "text") return;
  const match = CALLOUT_RE.exec(firstChild.value);
  if (!match) return;
  const [full, type, , titleRaw] = match;
  const title = titleRaw.trim() || capitalize(type);
  const existing =
    (node.data as { hProperties?: Record<string, unknown> } | undefined) ?? {};
  node.data = {
    ...existing,
    hName: "blockquote",
    hProperties: {
      ...existing.hProperties,
      "data-callout": type.toLowerCase(),
      "data-callout-title": title,
    },
  } as Blockquote["data"];
  firstChild.value = firstChild.value.slice(full.length).replace(/^\n/, "");
}

/** Unified/remark plugin turning Obsidian markdown extensions into mdast
 * nodes carrying `data.hName`/`data.hProperties` for `react-markdown`. */
export function remarkObsidian(options: RemarkObsidianOptions) {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      applyCallout(node);
    });

    visit(tree, "image", (node: Image) => {
      rewriteImageUrl(node, options);
    });

    // remark-frontmatter's "yaml" node isn't part of the core mdast types
    // (matched with a predicate rather than a string literal test), and
    // mdast-util-to-hast hardcodes a `yaml: ignore` handler that drops it
    // unconditionally — `data.hName` on the node itself is never consulted.
    // Swapping it for an unregistered node type routes it through the
    // generic "unknown node" handler instead, which does honor `data`.
    visit(
      tree,
      (node) => node.type === "yaml",
      (node, index, parent) => {
        if (index === undefined || !parent) return;
        const value = (node as unknown as { value: string }).value;
        parent.children.splice(index, 1, {
          type: "obsidianFrontmatter",
          data: { hName: "div", hProperties: { "data-frontmatter": value } },
        } as unknown as RootContent);
      },
    );

    visit(tree, "listItem", (node) => {
      if (typeof (node as { checked?: boolean | null }).checked !== "boolean")
        return;
      const line = (node.position?.start.line ?? 1) - 1;
      const existing =
        (node.data as { hProperties?: Record<string, unknown> } | undefined) ??
        {};
      node.data = {
        ...existing,
        hProperties: {
          ...existing.hProperties,
          "data-task-line": String(line),
        },
      } as typeof node.data;
    });

    visit(tree, "text", (node: Text, index, parent) => {
      if (index === undefined || !parent) return;
      const replacement = tokenizeInline(node.value, options);
      if (replacement.length === 0) return;
      parent.children.splice(index, 1, ...replacement);
      return index + replacement.length;
    });
  };
}
