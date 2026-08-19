// Obsidian link semantics shared by the editor, the reader and the file tree.

export interface ParsedWikiLink {
  /** Target as written, without heading/alias, trimmed. "" for `[[#heading]]` (same-note). */
  target: string;
  heading: string | null;
  /** `^blockid` reference, without the caret. */
  block: string | null;
  alias: string | null;
  embed: boolean;
  /** Full source text including brackets (and leading "!" for embeds). */
  raw: string;
  /** Offsets into the scanned text. */
  start: number;
  end: number;
}

export interface LinkTargetParts {
  target: string;
  heading: string | null;
  block: string | null;
  alias: string | null;
}

/** Parses the inside of `[[...]]`: "target#heading|alias", "target#^block", "#heading". */
export function parseLinkTarget(inner: string): LinkTargetParts {
  const [beforeAlias, ...aliasParts] = inner.split("|");
  const alias = aliasParts.length ? aliasParts.join("|").trim() : null;
  const hashAt = beforeAlias.indexOf("#");
  const target = (
    hashAt === -1 ? beforeAlias : beforeAlias.slice(0, hashAt)
  ).trim();
  const fragment = hashAt === -1 ? null : beforeAlias.slice(hashAt + 1).trim();
  const block = fragment?.startsWith("^") ? fragment.slice(1) : null;
  const heading = fragment && !block ? fragment : null;
  return { target, heading, block, alias };
}

/** Every `[[...]]` / `![[...]]` occurrence in `text`, in document order. */
export function parseWikiLinks(text: string): ParsedWikiLink[] {
  const out: ParsedWikiLink[] = [];
  const re = /(!?)\[\[([^[\]]+?)\]\]/g;
  for (const match of text.matchAll(re)) {
    const parts = parseLinkTarget(match[2]);
    out.push({
      ...parts,
      embed: match[1] === "!",
      raw: match[0],
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }
  return out;
}

/** "Journal/2026-01-11.md" → "2026-01-11". */
export function basenameOf(rel: string): string {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  return name.replace(/\.md$/i, "");
}

/** Strips a trailing ".md" (Obsidian link targets usually omit it). */
export function stripMd(rel: string): string {
  return rel.replace(/\.md$/i, "");
}

/** Parent folder of a rel ("" for the root). */
export function parentOf(rel: string): string {
  const at = rel.lastIndexOf("/");
  return at === -1 ? "" : rel.slice(0, at);
}

/** Number of folder path segments shared as a common prefix between two rels' parents. */
function sharedFolderDepth(a: string, b: string): number {
  const af = parentOf(a).split("/").filter(Boolean);
  const bf = parentOf(b).split("/").filter(Boolean);
  let i = 0;
  while (i < af.length && i < bf.length && af[i] === bf[i]) i++;
  return i;
}

/**
 * Resolves a link target the way Obsidian does: an exact vault-relative path
 * wins; otherwise match by basename (case-insensitive, ".md" optional), and
 * among several candidates prefer the shortest path, tie-broken by the one
 * closest to `fromRel`. Non-markdown targets (images…) match by full name.
 * Returns the rel of the resolved file, or null when nothing matches.
 */
export function resolveLink(
  files: readonly string[],
  fromRel: string,
  target: string,
): string | null {
  const wanted = target.trim().replace(/^\.?\//, "");
  if (!wanted) return fromRel;
  const lower = wanted.toLowerCase();
  const hasExt = /\.[a-z0-9]+$/i.test(wanted);
  const candidates: string[] = [];
  for (const rel of files) {
    const relLower = rel.toLowerCase();
    if (relLower === lower || relLower === `${lower}.md`) return rel;
    const base = rel.slice(rel.lastIndexOf("/") + 1).toLowerCase();
    if (base === lower || (!hasExt && base === `${lower}.md`))
      candidates.push(rel);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return sharedFolderDepth(b, fromRel) - sharedFolderDepth(a, fromRel);
  });
  return candidates[0];
}

/**
 * The text to put inside `[[...]]` for `rel`: the bare basename unless another
 * file shares it, in which case the full path (without ".md") like Obsidian.
 */
export function linkTargetFor(files: readonly string[], rel: string): string {
  const base = basenameOf(rel);
  const clash = files.some(
    (f) => f !== rel && basenameOf(f).toLowerCase() === base.toLowerCase(),
  );
  return clash ? stripMd(rel) : base;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

export function isImageRel(rel: string): boolean {
  return IMAGE_EXT.test(rel);
}

/** URL the desktop `vault://` protocol serves `rel` from. */
export function vaultAssetUrl(root: string, rel: string): string {
  return `vault://asset/?root=${encodeURIComponent(root)}&path=${encodeURIComponent(rel)}`;
}

/** "Untitled.md", then "Untitled 1.md", … inside `folder` ("" = root), like Obsidian. */
export function newNoteRel(
  files: readonly string[],
  folder: string,
  base = "Untitled",
): string {
  const prefix = folder ? `${folder.replace(/\/$/, "")}/` : "";
  const taken = new Set(files.map((f) => f.toLowerCase()));
  let candidate = `${prefix}${base}.md`;
  for (let i = 1; taken.has(candidate.toLowerCase()); i++)
    candidate = `${prefix}${base} ${i}.md`;
  return candidate;
}
