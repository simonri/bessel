// Obsidian-style Live Preview: hides raw markdown syntax on lines the
// selection doesn't touch, and always renders headings/emphasis/wikilinks/etc
// with their final styling. `buildDecorations` is a pure function of
// (state, mode, config, ranges) so it can be unit tested without a live
// EditorView/DOM measurement pass — the StateField below is a thin wrapper
// that rebuilds it on doc/selection/mode/config changes.
import { syntaxTree } from "@codemirror/language";
import {
  type EditorState,
  Facet,
  type Range,
  StateField,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { isImageRel, parseLinkTarget, resolveLink } from "../lib/wikilinks";
import { MarkdownImage } from "../markdown-image";

export type EditorMode = "source" | "live";

export interface LivePreviewConfig {
  files: readonly string[];
  fromRel: string;
  resolveAsset: (rel: string) => string | null;
  headingsFor?: (rel: string) => readonly string[];
}

const DEFAULT_CONFIG: LivePreviewConfig = {
  files: [],
  fromRel: "",
  resolveAsset: () => null,
};

export const editorModeFacet = Facet.define<EditorMode, EditorMode>({
  combine: (values) => values[values.length - 1] ?? "source",
});

export const livePreviewConfigFacet = Facet.define<
  LivePreviewConfig,
  LivePreviewConfig
>({
  combine: (values) => values[values.length - 1] ?? DEFAULT_CONFIG,
});

// Marker nodes hidden on non-selected lines in live mode, muted otherwise.
// HeaderMark gets its own case (it also swallows a trailing space);
// FencedCode's own CodeMark fence lines are handled separately and stay
// visible in both modes.
const HIDABLE_MARKS = new Set([
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "QuoteMark",
  "HighlightMark",
  "LinkMark",
  "URL",
  "LinkTitle",
]);

const MUTED_MARK_CLASS = "cm-obsidian-mark";

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos;
  }

  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-obsidian-checkbox";
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      e.preventDefault();
      const replacement = this.checked ? "[ ]" : "[x]";
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 3, insert: replacement },
      });
    });
    return box;
  }

  ignoreEvent() {
    return false;
  }
}

class HrWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-obsidian-hr";
    return hr;
  }
}

const imageWidgetRoots = new WeakMap<HTMLElement, Root>();

export class ImageWidget extends WidgetType {
  constructor(readonly src: string) {
    super();
  }

  eq(other: ImageWidget) {
    return other.src === this.src;
  }

  toDOM() {
    const wrap = document.createElement("div");
    const root = createRoot(wrap);
    imageWidgetRoots.set(wrap, root);
    root.render(
      createElement(MarkdownImage, {
        src: this.src,
        alt: "Embedded image",
        className: "my-0 block",
        imageClassName: "cm-obsidian-image-widget",
      }),
    );
    return wrap;
  }

  destroy(dom: HTMLElement) {
    imageWidgetRoots.get(dom)?.unmount();
    imageWidgetRoots.delete(dom);
  }
}

function touchedLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(range.to).number;
    for (let n = fromLine; n <= toLine; n++) lines.add(n);
  }
  return lines;
}

function lineOf(doc: Text, pos: number) {
  return doc.lineAt(pos);
}

/** Builds the full decoration set for the given ranges — a pure function of state/mode/config. */
export function buildDecorations(
  state: EditorState,
  mode: EditorMode,
  config: LivePreviewConfig,
  ranges: readonly { from: number; to: number }[] = [
    { from: 0, to: state.doc.length },
  ],
): DecorationSet {
  const doc = state.doc;
  const touched = touchedLines(state);
  const isLive = mode === "live";
  const out: Range<Decoration>[] = [];

  const lineTouched = (pos: number) => touched.has(lineOf(doc, pos).number);

  const hideOrMute = (from: number, to: number) => {
    if (to <= from) return;
    if (isLive && !lineTouched(from)) {
      out.push(Decoration.replace({}).range(from, to));
    } else {
      out.push(Decoration.mark({ class: MUTED_MARK_CLASS }).range(from, to));
    }
  };

  const addImageWidgetForEmbed = (
    embedFrom: number,
    embedTo: number,
    target: string,
  ) => {
    const resolved =
      resolveLink(config.files, config.fromRel, target) ?? target;
    if (!isImageRel(resolved)) return;
    const url = config.resolveAsset(resolved);
    if (!url) return;
    if (!(isLive && !lineTouched(embedFrom))) return;
    const lineEnd = lineOf(doc, embedTo).to;
    out.push(
      Decoration.widget({
        widget: new ImageWidget(url),
        block: true,
        side: 1,
      }).range(lineEnd),
    );
  };

  const handleWikiLink = (node: SyntaxNodeRef) => {
    const { from, to } = node;
    const inner = doc.sliceString(from + 2, to - 2);
    const innerFrom = from + 2;
    const parsed = parseLinkTarget(inner);
    const resolved = resolveLink(config.files, config.fromRel, parsed.target);
    // `files` only lists notes, so attachments (images, pdfs…) never resolve;
    // don't flag them as broken links.
    const unresolved =
      resolved === null && !/\.[a-z0-9]+$/i.test(parsed.target);

    out.push(
      Decoration.mark({
        class: `cm-wikilink${unresolved ? " cm-unresolved" : ""}`,
        attributes: {
          "data-wikilink-target": parsed.target || "",
          "data-wikilink-resolved": resolved ?? "",
        },
      }).range(from, to),
    );

    if (!(isLive && !lineTouched(from))) return;

    // Hide the brackets always; hide either "#heading|alias" (keeping the
    // target visible) or, when there's an alias, hide everything up to and
    // including the "|" so only the alias remains.
    hideOrMute(from, innerFrom);
    hideOrMute(to - 2, to);

    if (parsed.alias !== null) {
      const barAt = inner.lastIndexOf("|");
      if (barAt !== -1) hideOrMute(innerFrom, innerFrom + barAt + 1);
    } else {
      const hashAt = inner.indexOf("#");
      if (hashAt !== -1) hideOrMute(innerFrom + hashAt, to - 2);
    }
  };

  for (const range of ranges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter(node) {
        switch (node.name) {
          case "ATXHeading1":
          case "ATXHeading2":
          case "ATXHeading3":
          case "ATXHeading4":
          case "ATXHeading5":
          case "ATXHeading6": {
            const level = node.name.slice(-1);
            const line = lineOf(doc, node.from);
            out.push(
              Decoration.line({ class: `cm-obsidian-h${level}` }).range(
                line.from,
              ),
            );
            return;
          }
          case "HeaderMark": {
            const after = doc.sliceString(node.to, node.to + 1);
            hideOrMute(node.from, after === " " ? node.to + 1 : node.to);
            return;
          }
          case "StrongEmphasis":
            out.push(
              Decoration.mark({ class: "cm-obsidian-bold" }).range(
                node.from,
                node.to,
              ),
            );
            return;
          case "Emphasis":
            out.push(
              Decoration.mark({ class: "cm-obsidian-italic" }).range(
                node.from,
                node.to,
              ),
            );
            return;
          case "Strikethrough":
            out.push(
              Decoration.mark({ class: "cm-obsidian-strike" }).range(
                node.from,
                node.to,
              ),
            );
            return;
          case "InlineCode":
            out.push(
              Decoration.mark({ class: "cm-obsidian-inline-code" }).range(
                node.from,
                node.to,
              ),
            );
            return;
          case "FencedCode": {
            for (const mark of node.node.getChildren("CodeMark")) {
              out.push(
                Decoration.mark({ class: "cm-obsidian-fence" }).range(
                  mark.from,
                  mark.to,
                ),
              );
            }
            return false;
          }
          case "Blockquote": {
            const fromLine = lineOf(doc, node.from).number;
            const toLine = lineOf(doc, node.to).number;
            for (let n = fromLine; n <= toLine; n++) {
              out.push(
                Decoration.line({ class: "cm-obsidian-quote" }).range(
                  doc.line(n).from,
                ),
              );
            }
            return;
          }
          case "HorizontalRule": {
            const line = lineOf(doc, node.from);
            if (isLive && !lineTouched(node.from)) {
              out.push(
                Decoration.replace({
                  widget: new HrWidget(),
                  block: true,
                }).range(line.from, line.to),
              );
            }
            return;
          }
          case "TaskMarker": {
            if (isLive && !lineTouched(node.from)) {
              const text = doc.sliceString(node.from, node.to);
              out.push(
                Decoration.replace({
                  widget: new CheckboxWidget(text.includes("x"), node.from),
                }).range(node.from, node.to),
              );
            }
            return;
          }
          case "WikiLink":
            handleWikiLink(node);
            return;
          case "Embed": {
            const wikiLink = node.node.getChild("WikiLink");
            if (!wikiLink) return;
            const inner = doc.sliceString(wikiLink.from + 2, wikiLink.to - 2);
            const parsed = parseLinkTarget(inner);
            const resolved =
              resolveLink(config.files, config.fromRel, parsed.target) ??
              parsed.target;
            const isImage =
              isImageRel(resolved) && config.resolveAsset(resolved) !== null;
            // Like Obsidian: an image embed on an untouched line is just the
            // image — the `![[…]]` source text is hidden entirely.
            if (isImage && isLive && !lineTouched(node.from)) {
              out.push(Decoration.replace({}).range(node.from, node.to));
              addImageWidgetForEmbed(node.from, node.to, parsed.target);
              return false;
            }
            if (isImage)
              addImageWidgetForEmbed(node.from, node.to, parsed.target);
            // The "!" is a mark; the inner WikiLink child is visited on its own.
            hideOrMute(node.from, wikiLink.from);
            return;
          }
          case "Tag":
            out.push(
              Decoration.mark({
                class: "cm-tag",
                attributes: {
                  "data-tag": doc.sliceString(node.from + 1, node.to),
                },
              }).range(node.from, node.to),
            );
            return;
          case "Highlight":
            out.push(
              Decoration.mark({ class: "cm-highlight" }).range(
                node.from,
                node.to,
              ),
            );
            return;
          case "Link":
          case "Image": {
            out.push(
              Decoration.mark({ class: "cm-link" }).range(node.from, node.to),
            );
            if (node.name === "Image") {
              const urlNode = node.node.getChild("URL");
              if (urlNode) {
                const url = doc.sliceString(urlNode.from, urlNode.to);
                addImageWidgetForEmbed(node.from, node.to, url);
              }
            }
            return;
          }
          default:
            if (HIDABLE_MARKS.has(node.name)) hideOrMute(node.from, node.to);
        }
      },
    });
  }

  return Decoration.set(out, true);
}

// A StateField rather than a ViewPlugin: image/hr widgets are block-level
// decorations, which CodeMirror only accepts from state (plugins can't change
// vertical layout). Notes are small, so building over the whole doc is fine.
const livePreviewField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(
      state,
      state.facet(editorModeFacet),
      state.facet(livePreviewConfigFacet),
    );
  },
  update(decorations, tr) {
    const modeChanged =
      tr.startState.facet(editorModeFacet) !== tr.state.facet(editorModeFacet);
    const configChanged =
      tr.startState.facet(livePreviewConfigFacet) !==
      tr.state.facet(livePreviewConfigFacet);
    if (!tr.docChanged && !tr.selection && !modeChanged && !configChanged)
      return decorations;
    return buildDecorations(
      tr.state,
      tr.state.facet(editorModeFacet),
      tr.state.facet(livePreviewConfigFacet),
    );
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

export function livePreview(mode: EditorMode, config: LivePreviewConfig) {
  return [
    editorModeFacet.of(mode),
    livePreviewConfigFacet.of(config),
    livePreviewField,
  ];
}
