import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const HEADING_SIZE: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "1.75em",
  2: "1.5em",
  3: "1.25em",
  4: "1.1em",
  5: "1em",
  6: "1em",
};

const headingRules = ([1, 2, 3, 4, 5, 6] as const).reduce<
  Record<string, Record<string, string>>
>((rules, level) => {
  rules[`.cm-line.cm-obsidian-h${level}`] = {
    fontSize: HEADING_SIZE[level],
    fontWeight: "700",
    lineHeight: "1.3",
  };
  return rules;
}, {});

export const obsidianEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "rgba(255, 255, 255, 0.85)",
      fontFamily: "inherit",
      height: "100%",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "inherit",
      lineHeight: "1.6",
    },
    ".cm-content": {
      padding: "1rem 1.25rem",
      caretColor: "var(--primary)",
    },
    ".cm-gutters": { display: "none" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--primary)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "color-mix(in oklab, var(--primary) 35%, transparent)",
      },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.03)" },
    ".cm-line": { padding: "0 2px" },

    // Headings — sizing is applied per-level via the line decoration classes
    // the live-preview plugin adds (cm-obsidian-h1..h6); rules live here so
    // they only take effect on decorated lines, not raw "# " text elsewhere.
    ...headingRules,

    ".cm-obsidian-bold": { fontWeight: "700" },
    ".cm-obsidian-italic": { fontStyle: "italic" },
    ".cm-obsidian-strike": { textDecoration: "line-through" },
    ".cm-obsidian-inline-code": {
      fontFamily:
        '"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace',
      fontSize: "0.9em",
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      borderRadius: "4px",
      padding: "0.1em 0.3em",
    },
    ".cm-obsidian-mark": { color: "rgba(255, 255, 255, 0.35)" },

    ".cm-wikilink": {
      color: "var(--primary)",
      cursor: "pointer",
    },
    ".cm-wikilink.cm-unresolved": {
      opacity: "0.6",
      fontStyle: "italic",
    },
    ".cm-tag": {
      color: "rgba(255, 255, 255, 0.75)",
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      borderRadius: "999px",
      padding: "0.05em 0.55em",
      fontSize: "0.85em",
      cursor: "pointer",
    },
    ".cm-highlight": {
      backgroundColor: "rgba(250, 204, 21, 0.35)",
      color: "rgba(255, 255, 255, 0.95)",
      borderRadius: "2px",
    },
    ".cm-link": { color: "var(--primary)" },

    ".cm-obsidian-quote": {
      borderLeft: "3px solid rgba(255, 255, 255, 0.2)",
      paddingLeft: "0.75rem",
      color: "rgba(255, 255, 255, 0.65)",
    },

    ".cm-obsidian-checkbox": {
      verticalAlign: "middle",
      marginRight: "0.35em",
      cursor: "pointer",
    },
    ".cm-obsidian-hr": {
      border: "none",
      borderTop: "1px solid rgba(255, 255, 255, 0.15)",
      margin: "0.75em 0",
    },
    ".cm-obsidian-fence": { color: "rgba(255, 255, 255, 0.35)" },
    ".cm-obsidian-image-widget": {
      display: "block",
      maxHeight: "400px",
      maxWidth: "100%",
      borderRadius: "8px",
      margin: "0.35em 0",
    },

    "&.cm-editor .cm-tooltip-autocomplete": {
      backgroundColor: "rgba(20, 20, 24, 0.97)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      borderRadius: "8px",
      overflow: "hidden",
    },
    "&.cm-editor .cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "var(--primary)",
      color: "#0a0a0a",
    },
  },
  { dark: true },
);

export const obsidianHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontWeight: "700" },
  { tag: t.heading2, fontWeight: "700" },
  { tag: t.heading3, fontWeight: "700" },
  { tag: t.heading4, fontWeight: "700" },
  { tag: t.heading5, fontWeight: "700" },
  { tag: t.heading6, fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  {
    tag: t.monospace,
    fontFamily:
      '"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace',
  },
  { tag: t.processingInstruction, color: "rgba(255, 255, 255, 0.35)" },
  { tag: t.link, color: "var(--primary)" },
  { tag: t.url, color: "rgba(255, 255, 255, 0.5)" },
  { tag: t.quote, color: "rgba(255, 255, 255, 0.65)", fontStyle: "italic" },
  { tag: t.labelName, color: "rgba(255, 255, 255, 0.5)" },
  { tag: t.inserted, backgroundColor: "rgba(250, 204, 21, 0.35)" },
]);

export const obsidianTheme = [
  obsidianEditorTheme,
  syntaxHighlighting(obsidianHighlightStyle),
];
