import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// hljs's typescript/javascript grammars fall back to a crude regex-based XML
// sub-mode for JSX that breaks on any attribute value beyond a bare token
// (e.g. `onClick={() => ...}`) — once it misparses one attribute, everything
// after it in the tag renders with zero highlighting. Shiki uses the same
// TextMate grammars as VS Code, so JSX/TSX (and everything else) tokenizes
// correctly. The theme below is a straight port of the old atom-one-dark look.
const THEME = "one-dark-pro";

// createHighlighterCore + the JavaScript regex engine instead of the full
// shiki bundle: skips the ~600 KB oniguruma WASM engine and the full grammar
// registry. Grammars load (and compile) lazily per detected language rather
// than all up-front — a diff view only ever needs one at a time.
const LANG_LOADERS = {
  bash: () => import("shiki/langs/bash.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
} as const;

type SupportedLang = keyof typeof LANG_LOADERS;

let highlighterPromise: Promise<HighlighterCore> | null = null;
const langLoads = new Map<SupportedLang, Promise<void>>();

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [import("shiki/themes/one-dark-pro.mjs")],
    langs: [],
    // forgiving: a grammar pattern the JS engine can't translate is skipped
    // instead of throwing — worst case is a plain-text token, never a crash.
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighterPromise;
}

async function getHighlighterWithLang(
  lang: SupportedLang,
): Promise<HighlighterCore> {
  const highlighter = await getHighlighter();
  let load = langLoads.get(lang);
  if (!load) {
    load = highlighter.loadLanguage(LANG_LOADERS[lang]);
    langLoads.set(lang, load);
  }
  await load;
  return highlighter;
}

export interface HighlightToken {
  content: string;
  color?: string;
}

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

const EXT_LANG: Record<string, SupportedLang> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  css: "css",
  scss: "scss",
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

export function detectLang(
  filepath: string | undefined,
): SupportedLang | undefined {
  if (!filepath) return undefined;
  const ext = filepath.split("/").pop()?.split(".").pop()?.toLowerCase();
  return ext ? EXT_LANG[ext] : undefined;
}

// Full-file tokenizing runs on the main thread, so an oversized file (a
// lockfile, a minified/generated bundle) could hang the UI for seconds —
// skip it and fall back to per-line tokenizing instead, which stays cheap no
// matter how large the untouched parts of the file are.
const MAX_FULL_FILE_HIGHLIGHT_LENGTH = 200_000;

// Nothing about tokenizing a real source file should throw, but a grammar
// bug or genuinely pathological input is never worth taking the whole diff
// (or the app) down for — every caller already treats "no tokens for this
// line" as "render it as plain text".
async function safeTokenizeLines(
  content: string,
  lang: SupportedLang,
): Promise<HighlightToken[][] | undefined> {
  if (!content) return undefined;
  try {
    const highlighter = await getHighlighterWithLang(lang);
    return highlighter.codeToTokens(content, { lang, theme: THEME })
      .tokens as HighlightToken[][];
  } catch {
    return undefined;
  }
}

// Tokenizing a hunk in isolation misreads any multi-line construct (block
// comment, triple-quoted string, template literal, JSX) that opens or closes
// outside the visible context lines — the tokenizer has no way to know it's
// mid-token. Tokenizing the full old/new file content once and slicing by
// line number gives every token its real surrounding context, so it can't
// break on a hunk boundary. Falls back to per-line tokenizing (old behavior)
// if full file content isn't available (e.g. a rename with no matching path
// at HEAD), too large to highlight synchronously, or fails outright.
export async function buildHighlightMap(
  lines: ParsedLine[],
  lang: SupportedLang | undefined,
  oldContent: string,
  newContent: string,
): Promise<Map<number, HighlightToken[]>> {
  const result = new Map<number, HighlightToken[]>();
  if (!lang) return result;

  const tokenizeFile = async (content: string): Promise<HighlightToken[][]> => {
    if (!content || content.length > MAX_FULL_FILE_HIGHLIGHT_LENGTH) return [];
    return (await safeTokenizeLines(content, lang)) ?? [];
  };

  const [oldLines, newLines] = await Promise.all([
    tokenizeFile(oldContent),
    tokenizeFile(newContent),
  ]);

  const fallback: { idx: number; content: string }[] = [];

  lines.forEach((line, idx) => {
    if (line.type === "add" && line.newNum !== undefined) {
      const tok = newLines[line.newNum - 1];
      if (tok !== undefined) result.set(idx, tok);
      else fallback.push({ idx, content: line.content });
    } else if (line.type === "remove" && line.oldNum !== undefined) {
      const tok = oldLines[line.oldNum - 1];
      if (tok !== undefined) result.set(idx, tok);
      else fallback.push({ idx, content: line.content });
    } else if (line.type === "context" && line.newNum !== undefined) {
      // Prefer new-file tokens for context lines — matches what's on disk.
      const tok = newLines[line.newNum - 1] ?? oldLines[(line.oldNum ?? 0) - 1];
      if (tok !== undefined) result.set(idx, tok);
      else fallback.push({ idx, content: line.content });
    }
  });

  // Full file content wasn't available/safe to tokenize, or this exact line
  // wasn't found in it — tokenize whatever we have per-line, independently,
  // as a best effort. A line that still fails just stays unset: every
  // renderer treats a missing map entry as "render this line as plain text",
  // so one bad line can never take down the rest of the diff.
  await Promise.all(
    fallback.map(async ({ idx, content }) => {
      const tok = (await safeTokenizeLines(content, lang))?.[0];
      if (tok !== undefined) result.set(idx, tok);
    }),
  );

  return result;
}
