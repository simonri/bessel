import hljs from "highlight.js/lib/core";
import langBash from "highlight.js/lib/languages/bash";
import langCss from "highlight.js/lib/languages/css";
import langGo from "highlight.js/lib/languages/go";
import langJavascript from "highlight.js/lib/languages/javascript";
import langJson from "highlight.js/lib/languages/json";
import langMarkdown from "highlight.js/lib/languages/markdown";
import langPython from "highlight.js/lib/languages/python";
import langRust from "highlight.js/lib/languages/rust";
import langSql from "highlight.js/lib/languages/sql";
import langTypescript from "highlight.js/lib/languages/typescript";
import langXml from "highlight.js/lib/languages/xml";
import langYaml from "highlight.js/lib/languages/yaml";
import "highlight.js/styles/atom-one-dark.css";

hljs.registerLanguage("bash", langBash);
hljs.registerLanguage("css", langCss);
hljs.registerLanguage("go", langGo);
hljs.registerLanguage("json", langJson);
hljs.registerLanguage("javascript", langJavascript);
hljs.registerLanguage("markdown", langMarkdown);
hljs.registerLanguage("python", langPython);
hljs.registerLanguage("rust", langRust);
hljs.registerLanguage("sql", langSql);
hljs.registerLanguage("typescript", langTypescript);
hljs.registerLanguage("html", langXml);
hljs.registerLanguage("xml", langXml);
hljs.registerLanguage("yaml", langYaml);

// ── Types ──────────────────────────────────────────────────────────────────────

type DiffLineType =
  | "file-header"
  | "hunk"
  | "add"
  | "remove"
  | "context"
  | "no-newline";

interface ParsedLine {
  type: DiffLineType;
  content: string;
  oldNum?: number;
  newNum?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  css: "css",
  scss: "css",
  json: "json",
  md: "markdown",
  mdx: "markdown",
  sql: "sql",
  go: "go",
  rs: "rust",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yaml: "yaml",
  yml: "yaml",
};

// ── Diff parsing ───────────────────────────────────────────────────────────────

export function parseDiff(raw: string): ParsedLine[] {
  const result: ParsedLine[] = [];
  let oldNum = 0;
  let newNum = 0;

  for (const line of raw.split("\n")) {
    if (line.startsWith("@@")) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldNum = Number.parseInt(m[1], 10);
        newNum = Number.parseInt(m[2], 10);
      }
      result.push({ type: "hunk", content: line });
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      result.push({ type: "add", content: line.slice(1), newNum: newNum++ });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      result.push({ type: "remove", content: line.slice(1), oldNum: oldNum++ });
    } else if (line.startsWith(" ")) {
      result.push({
        type: "context",
        content: line.slice(1),
        oldNum: oldNum++,
        newNum: newNum++,
      });
    } else if (line.startsWith("\\")) {
      result.push({ type: "no-newline", content: line });
    } else {
      result.push({ type: "file-header", content: line });
    }
  }

  return result;
}

// ── Syntax highlighting ────────────────────────────────────────────────────────

export function detectLang(filepath: string | undefined): string | undefined {
  if (!filepath) return undefined;
  const ext = filepath.split("/").pop()?.split(".").pop()?.toLowerCase();
  return ext ? EXT_LANG[ext] : undefined;
}

// Splits hljs-highlighted HTML into per-line strings while rebalancing spans
// so multi-line tokens (block comments, template literals) render correctly.
export function splitHighlightedLines(html: string): string[] {
  const rawLines = html.split("\n");
  const lines: string[] = [];
  const openStack: string[] = [];
  const tagRe = /<span([^>]*)>|<\/span>/g;

  for (const rawLine of rawLines) {
    let line = openStack.join("") + rawLine;
    let m: RegExpExecArray | null;
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(rawLine)) !== null) {
      if (m[0].startsWith("</")) {
        openStack.pop();
      } else {
        openStack.push(`<span${m[1]}>`);
      }
    }
    line += "</span>".repeat(openStack.length);
    lines.push(line);
  }

  return lines;
}

// Highlighting a hunk in isolation misreads any multi-line construct (block
// comment, triple-quoted string, template literal, JSX) that opens or closes
// outside the visible context lines — hljs has no way to know it's mid-token.
// Highlighting the full old/new file content once and slicing by line number
// gives every token its real surrounding context, so it can't break on a hunk
// boundary. Falls back to per-line highlighting (old behavior) if full file
// content isn't available, e.g. for a rename with no matching path at HEAD.
export function buildHighlightMap(
  lines: ParsedLine[],
  lang: string | undefined,
  oldContent: string,
  newContent: string,
): Map<number, string> {
  const result = new Map<number, string>();
  if (!lang) return result;

  const highlightLines = (content: string): string[] =>
    content
      ? splitHighlightedLines(
          hljs.highlight(content, { language: lang, ignoreIllegals: true })
            .value,
        )
      : [];

  const oldLines = highlightLines(oldContent);
  const newLines = highlightLines(newContent);

  const fallback: { idx: number; content: string }[] = [];

  lines.forEach((line, idx) => {
    if (line.type === "add" && line.newNum !== undefined) {
      const hl = newLines[line.newNum - 1];
      if (hl !== undefined) result.set(idx, hl);
      else fallback.push({ idx, content: line.content });
    } else if (line.type === "remove" && line.oldNum !== undefined) {
      const hl = oldLines[line.oldNum - 1];
      if (hl !== undefined) result.set(idx, hl);
      else fallback.push({ idx, content: line.content });
    } else if (line.type === "context" && line.newNum !== undefined) {
      // Prefer new-file highlighting for context lines — matches what's on disk.
      const hl = newLines[line.newNum - 1] ?? oldLines[(line.oldNum ?? 0) - 1];
      if (hl !== undefined) result.set(idx, hl);
      else fallback.push({ idx, content: line.content });
    }
  });

  // Full file content wasn't available (e.g. rename source path 404s at HEAD) —
  // highlight whatever we have per-line, independently, as a best effort.
  if (fallback.length > 0) {
    for (const { idx, content } of fallback) {
      result.set(
        idx,
        hljs.highlight(content, { language: lang, ignoreIllegals: true }).value,
      );
    }
  }

  return result;
}
