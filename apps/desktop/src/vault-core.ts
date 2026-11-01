// Pure, Electron-free helpers for the Obsidian vault feature. Kept separate
// from vault.ts so they're importable (and unit-testable) without pulling in
// "electron", which isn't resolvable outside a running Electron process.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  VaultEntryKind,
  VaultFileMeta,
  VaultHeading,
  VaultLink,
} from "./vault-types.js";

export const MAX_WRITE_BYTES = 10 * 1024 * 1024;

/**
 * Resolves a vault-relative path to an absolute path guaranteed to stay
 * inside `root`. Every handler in vault.ts routes untrusted `rel` values
 * through this before touching the filesystem.
 */
export function resolveInside(root: string, rel: string): string {
  if (typeof rel !== "string") throw new Error("Invalid vault-relative path");
  if (rel.includes("\0"))
    throw new Error("Invalid vault-relative path: contains a null byte");
  // "rel" is always "/"-separated by contract, but normalize stray
  // backslashes (e.g. from a Windows-authored string) before resolving.
  const normalized = rel.replace(/\\/g, "/");
  if (normalized.startsWith("/"))
    throw new Error("Invalid vault-relative path: must be relative");

  const rootAbs = path.resolve(root);
  const resolved = path.resolve(rootAbs, normalized);
  if (resolved !== rootAbs && !resolved.startsWith(rootAbs + path.sep))
    throw new Error("Invalid vault-relative path: escapes the vault root");
  return resolved;
}

/**
 * Async variant of `resolveInside` that also defeats symlink escapes: the
 * realpath of the nearest *existing* ancestor of the resolved path must
 * still stay inside the realpath of `root`. Use this (not `resolveInside`)
 * for anything that touches the filesystem.
 */
export async function resolveInsideReal(
  root: string,
  rel: string,
): Promise<string> {
  const target = resolveInside(root, rel);
  const rootReal = await fs.promises.realpath(root);

  let probe = target;
  for (;;) {
    let real: string | null = null;
    try {
      real = await fs.promises.realpath(probe);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    if (real !== null) {
      if (real !== rootReal && !real.startsWith(rootReal + path.sep))
        throw new Error("Invalid vault-relative path: escapes the vault root");
      return target;
    }
    const parent = path.dirname(probe);
    if (parent === probe)
      throw new Error("Invalid vault-relative path: escapes the vault root");
    probe = parent;
  }
}

// ─── ignore rules ───────────────────────────────────────────────────────────
// Dotfiles/dirs cover .obsidian, .git, .trash, and our own atomic-write temp
// files (named ".<name>.bessel-tmp-<rand>" specifically so this one rule
// hides them everywhere: list, index, search, and the watcher).
export function shouldIgnoreName(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

export function pathHasIgnoredSegment(rel: string): boolean {
  return rel.split("/").some((segment) => segment && shouldIgnoreName(segment));
}

// ─── entry kinds ────────────────────────────────────────────────────────────
const IMAGE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".avif",
]);

export function kindForRel(rel: string): VaultEntryKind {
  const ext = path.extname(rel).toLowerCase();
  if (ext === ".md") return "md";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  if (ext === ".canvas") return "canvas";
  if (ext === ".base") return "base";
  return "other";
}

// ─── atomic write temp names ────────────────────────────────────────────────
export function tempFileName(name: string): string {
  return `.${name}.bessel-tmp-${crypto.randomBytes(6).toString("hex")}`;
}

// ─── auto-suffix naming (Untitled.md -> Untitled 1.md -> Untitled 2.md) ────
export function autoSuffixName(
  desiredRel: string,
  exists: (rel: string) => boolean,
): string {
  if (!exists(desiredRel)) return desiredRel;

  const slashIdx = desiredRel.lastIndexOf("/");
  const dir = slashIdx === -1 ? "" : desiredRel.slice(0, slashIdx);
  const fileName =
    slashIdx === -1 ? desiredRel : desiredRel.slice(slashIdx + 1);
  const dotIdx = fileName.lastIndexOf(".");
  const ext = dotIdx > 0 ? fileName.slice(dotIdx) : "";
  const base = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;

  for (let n = 1; ; n++) {
    const candidateName = `${base} ${n}${ext}`;
    const candidateRel = dir ? `${dir}/${candidateName}` : candidateName;
    if (!exists(candidateRel)) return candidateRel;
  }
}

// ─── wikilink rewriting (used by vault:rename) ─────────────────────────────
function stripMdExt(rel: string): string {
  return rel.replace(/\.md$/i, "");
}

function basenameNoExt(rel: string): string {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  return stripMdExt(base);
}

function parentFolders(rel: string): string[] {
  return rel.split("/").slice(0, -1);
}

function sharedFolderDepth(a: string, b: string): number {
  const af = parentFolders(a);
  const bf = parentFolders(b);
  let i = 0;
  while (i < af.length && i < bf.length && af[i] === bf[i]) i++;
  return i;
}

/**
 * The note a link target opens, as the vault page resolves it
 * (apps/web/.../wikilinks.ts resolveLink): an exact vault-relative path, else
 * the note of that name with the shortest path, then the closest to `fromRel`.
 */
export function resolveLink(
  files: readonly string[],
  fromRel: string,
  target: string,
): string | null {
  const wanted = target.trim().replace(/^\.?\//, "");
  if (!wanted) return fromRel;
  const lower = wanted.toLowerCase();
  const candidates: string[] = [];
  for (const rel of files) {
    const relLower = rel.toLowerCase();
    if (relLower === lower || relLower === `${lower}.md`) return rel;
    const base = rel.slice(rel.lastIndexOf("/") + 1).toLowerCase();
    if (base === lower || base === `${lower}.md`) candidates.push(rel);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return sharedFolderDepth(b, fromRel) - sharedFolderDepth(a, fromRel);
  });
  return candidates[0];
}

/** Where `rel` is after moving `fromRel` (a note or a folder) to `toRel`. */
export function movedRel(
  rel: string,
  fromRel: string,
  toRel: string,
): string | null {
  if (rel === fromRel) return toRel;
  return rel.startsWith(`${fromRel}/`)
    ? `${toRel}${rel.slice(fromRel.length)}`
    : null;
}

/**
 * Rewrites the links in `content`, the note at `sourceRel`, that lead to
 * `fromRel` (a note, or a note in the folder `fromRel`) so they lead to where
 * it is under `toRel`. `files` are the vault's notes before the rename: a bare
 * [[Name]] that opens another note of the same name is left be, and any link
 * that would open a different note once renamed gets the full path.
 */
export function rewriteLinksInContent(
  content: string,
  fromRel: string,
  toRel: string,
  {
    sourceRel = "",
    files = [fromRel],
  }: { sourceRel?: string; files?: readonly string[] } = {},
): { content: string; changed: boolean } {
  const moved = (rel: string) => movedRel(rel, fromRel, toRel);
  const filesAfter = files.map((rel) => moved(rel) ?? rel);
  const sourceAfter = moved(sourceRel) ?? sourceRel;

  let changed = false;
  // In a table the alias pipe is written `\|`; it stays with the alias.
  const wikilinkRe = /(!)?\[\[([^\]|#]+?)(#[^\]|]+)?(\\?\|[^\]]+)?\]\]/g;
  const rewrite = (text: string): string =>
    text.replace(
      wikilinkRe,
      (
        match,
        embed: string | undefined,
        rawTarget: string,
        headingPart: string | undefined,
        aliasPart: string | undefined,
      ) => {
        const target = rawTarget.trim();
        const resolved = resolveLink(files, sourceRel, target);
        if (resolved === null) return match;
        // A link to another note can change too: the renamed note may now
        // take its name.
        const newRel = moved(resolved) ?? resolved;
        if (resolveLink(filesAfter, sourceAfter, target) === newRel)
          return match;
        const newBase = basenameNoExt(newRel);
        const newTarget =
          !target.includes("/") &&
          resolveLink(filesAfter, sourceAfter, newBase) === newRel
            ? newBase
            : stripMdExt(newRel);

        changed = true;
        return `${embed ?? ""}[[${newTarget}${headingPart ?? ""}${aliasPart ?? ""}]]`;
      },
    );

  // Code isn't a link, as the index reads it: fenced blocks and inline code
  // stay as written.
  const isCode = fencedCode();
  const newContent = content
    .split("\n")
    .map((line) => {
      if (isCode(line)) return line;
      let out = "";
      let at = 0;
      for (const code of line.matchAll(INLINE_CODE_RE)) {
        out += rewrite(line.slice(at, code.index)) + code[0];
        at = code.index + code[0].length;
      }
      return out + rewrite(line.slice(at));
    })
    .join("\n");

  return { content: newContent, changed };
}

// ─── index parsing (wikilinks, tags, headings, frontmatter) ───────────────
function splitLines(content: string): string[] {
  return content.split(/\r\n|\n/);
}

/**
 * Takes a note's lines in order and says which are fenced code, fences
 * included. A fence closes only on a bare run of its own character at least
 * as long, so a ```` block can show a ``` one.
 */
function fencedCode(): (line: string) => boolean {
  let open: { char: string; length: number } | null = null;
  return (line) => {
    const fence = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line);
    if (open) {
      if (
        fence &&
        fence[1][0] === open.char &&
        fence[1].length >= open.length &&
        !fence[2].trim()
      )
        open = null;
      return true;
    }
    if (!fence || (fence[1][0] === "`" && fence[2].includes("`"))) return false;
    open = { char: fence[1][0], length: fence[1].length };
    return true;
  };
}

// A code span closes on a run of exactly as many backticks as opened it, so
// ``[[Note]]`` and `` a ` b `` are code throughout.
const INLINE_CODE_RE = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;

function stripInlineCode(line: string): string {
  return line.replace(INLINE_CODE_RE, (m) => " ".repeat(m.length));
}

interface Frontmatter {
  lines: string[];
  bodyStart: number;
}

function extractFrontmatter(lines: string[]): Frontmatter {
  if (lines.length === 0 || lines[0].trim() !== "---")
    return { lines: [], bodyStart: 0 };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---")
      return { lines: lines.slice(1, i), bodyStart: i + 1 };
  }
  return { lines: [], bodyStart: 0 };
}

function parseFrontmatterListField(fmLines: string[], key: string): string[] {
  const prefix = `${key}:`;
  for (let i = 0; i < fmLines.length; i++) {
    const trimmed = fmLines[i].trim();
    if (!trimmed.toLowerCase().startsWith(prefix)) continue;

    const rest = trimmed.slice(prefix.length).trim();
    if (rest.length > 0) {
      const inner =
        rest.startsWith("[") && rest.endsWith("]") ? rest.slice(1, -1) : rest;
      return inner
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }

    const values: string[] = [];
    for (let j = i + 1; j < fmLines.length; j++) {
      const itemMatch = /^\s*-\s*(.+)$/.exec(fmLines[j]);
      if (!itemMatch) break;
      values.push(itemMatch[1].trim().replace(/^["']|["']$/g, ""));
    }
    return values;
  }
  return [];
}

const HEADING_RE = /^ {0,3}(#{1,6})\s+(.+?)\s*$/;

function extractHeadings(lines: string[], bodyStart: number): VaultHeading[] {
  const headings: VaultHeading[] = [];
  const isCode = fencedCode();
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    if (isCode(line)) continue;
    const m = HEADING_RE.exec(line);
    if (m) {
      const text = m[2].replace(/\s+#+\s*$/, "").trim();
      headings.push({ level: m[1].length, text, line: i });
    }
  }
  return headings;
}

function extractWikilinks(lines: string[], bodyStart: number): VaultLink[] {
  const links: VaultLink[] = [];
  const isCode = fencedCode();
  for (let i = bodyStart; i < lines.length; i++) {
    const raw = lines[i];
    if (isCode(raw)) continue;
    const line = stripInlineCode(raw);
    const wikilinkRe =
      /(!)?\[\[([^\]|#]+?)(?:#([^\]|]+?))?(?:\\?\|([^\]]+?))?\]\]/g;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard exec loop
    while ((m = wikilinkRe.exec(line))) {
      links.push({
        target: m[2].trim(),
        heading: m[3] ? m[3].trim() : null,
        alias: m[4] ? m[4].trim() : null,
        embed: m[1] === "!",
        line: i,
      });
    }
  }
  return links;
}

function extractTags(lines: string[], bodyStart: number): string[] {
  const tags = new Set<string>();
  const isCode = fencedCode();
  for (let i = bodyStart; i < lines.length; i++) {
    const raw = lines[i];
    if (isCode(raw)) continue;

    let line = stripInlineCode(raw);
    line = line.replace(/https?:\/\/\S+/g, " ");
    line = line.replace(/!?\[\[[^\]]*\]\]/g, " ");
    line = line.replace(/\[[^\]]*\]\([^)]*\)/g, " ");

    // As the editor highlights them: letters of any script, and not all digits.
    const tagRe = /(^|[\s([])#([\p{L}\p{N}_/-]+)/gu;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard exec loop
    while ((m = tagRe.exec(line))) {
      const tag = m[2].replace(/[/-]+$/, "");
      if (/[\p{L}_]/u.test(tag)) tags.add(tag);
    }
  }
  return Array.from(tags);
}

export function buildFileMeta(rel: string, content: string): VaultFileMeta {
  const lines = splitLines(content);
  const fm = extractFrontmatter(lines);

  const tags = new Set<string>([
    ...extractTags(lines, fm.bodyStart),
    ...parseFrontmatterListField(fm.lines, "tags"),
  ]);
  const aliases = parseFrontmatterListField(fm.lines, "aliases");
  const headings = extractHeadings(lines, fm.bodyStart);
  const links = extractWikilinks(lines, fm.bodyStart);

  return { rel, links, tags: Array.from(tags), headings, aliases };
}

// ─── search ─────────────────────────────────────────────────────────────────
export function truncateAroundMatch(
  line: string,
  matchIndex: number,
  maxLen = 200,
): string {
  if (line.length <= maxLen) return line;
  const half = Math.floor(maxLen / 2);
  let start = Math.max(0, matchIndex - half);
  const end = Math.min(line.length, start + maxLen);
  start = Math.max(0, end - maxLen);
  return line.slice(start, end);
}
