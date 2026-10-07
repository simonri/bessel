// Filesystem operations behind the vault IPC handlers, kept free of Electron
// (like vault-core.ts) so they can be exercised against a real temp dir.

import fs from "node:fs";
import path from "node:path";
import {
  autoSuffixName,
  kindForRel,
  MAX_WRITE_BYTES,
  resolveInside,
  resolveInsideReal,
  rewriteLinksInContent,
  shouldIgnoreName,
  tempFileName,
} from "./vault-core.js";
import type { VaultEntry, VaultRenameResult } from "./vault-types.js";

// Larger notes can still be opened (up to the write limit), but aren't worth
// parsing on every index rebuild or search keystroke.
export const MAX_INDEXED_BYTES = 5 * 1024 * 1024;
const MAX_CREATE_ATTEMPTS = 100;

export function assertNotRoot(root: string, abs: string): void {
  if (abs === path.resolve(root))
    throw new Error("This action isn't available for the vault folder itself");
}

export function isErrno(err: unknown, code: string): boolean {
  return (err as NodeJS.ErrnoException)?.code === code;
}

export async function atomicWrite(
  abs: string,
  data: string | Uint8Array,
): Promise<void> {
  const dir = path.dirname(abs);
  const tmp = path.join(dir, tempFileName(path.basename(abs)));
  try {
    if (typeof data === "string")
      await fs.promises.writeFile(tmp, data, "utf8");
    else await fs.promises.writeFile(tmp, data);
    await fs.promises.rename(tmp, abs);
  } catch (err) {
    await fs.promises.unlink(tmp).catch(() => {});
    throw err;
  }
}

// ─── directory walking ──────────────────────────────────────────────────────
export async function walkVaultEntries(root: string): Promise<VaultEntry[]> {
  const entries: VaultEntry[] = [];

  async function walk(dirAbs: string, dirRel: string): Promise<void> {
    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (shouldIgnoreName(dirent.name)) continue;
      const rel = dirRel ? `${dirRel}/${dirent.name}` : dirent.name;
      const abs = path.join(dirAbs, dirent.name);
      if (dirent.isDirectory()) {
        const stat = await fs.promises.stat(abs).catch(() => null);
        entries.push({
          rel,
          kind: "dir",
          mtimeMs: stat?.mtimeMs ?? 0,
          size: stat?.size ?? 0,
        });
        await walk(abs, rel);
      } else if (dirent.isFile()) {
        const stat = await fs.promises.stat(abs).catch(() => null);
        if (!stat) continue;
        entries.push({
          rel,
          kind: kindForRel(rel),
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        });
      }
    }
  }

  await walk(root, "");
  entries.sort((a, b) => a.rel.localeCompare(b.rel));
  return entries;
}

export async function listMarkdownEntries(root: string): Promise<VaultEntry[]> {
  const entries = await walkVaultEntries(root);
  return entries.filter((e) => e.kind === "md");
}

export async function listIndexableRels(root: string): Promise<string[]> {
  const entries = await listMarkdownEntries(root);
  return entries.filter((e) => e.size <= MAX_INDEXED_BYTES).map((e) => e.rel);
}

/** Creates `desiredRel` (or the first free "name N.ext") without ever replacing a file. */
export async function createExclusive(
  root: string,
  desiredRel: string,
  data: string | Uint8Array,
): Promise<string> {
  assertNotRoot(root, resolveInside(root, desiredRel));
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const rel = autoSuffixName(desiredRel, (candidate) =>
      fs.existsSync(resolveInside(root, candidate)),
    );
    const abs = await resolveInsideReal(root, rel);
    assertNotRoot(root, abs);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    let handle: fs.promises.FileHandle;
    try {
      handle = await fs.promises.open(abs, "wx");
    } catch (err) {
      // Taken between the existence check and the open (another app, sync).
      if (isErrno(err, "EEXIST")) continue;
      throw err;
    }
    try {
      await handle.writeFile(data);
      await handle.close();
    } catch (err) {
      await handle.close().catch(() => {});
      await fs.promises.unlink(abs).catch(() => {});
      throw err;
    }
    return rel;
  }
  throw new Error("Couldn't find a free file name");
}

async function sameFile(a: string, b: string): Promise<boolean> {
  const [statA, statB] = await Promise.all([
    fs.promises.lstat(a, { bigint: true }),
    fs.promises.lstat(b, { bigint: true }),
  ]);
  return statA.dev === statB.dev && statA.ino === statB.ino;
}

/**
 * Throws when moving `fromAbs` to `toAbs` would replace something: fs.rename
 * silently clobbers an existing file. The one legitimate "existing" target is
 * the source itself, a case-only rename on a case-insensitive filesystem.
 */
export async function assertRenameTargetFree(
  fromAbs: string,
  toAbs: string,
  toRel: string,
): Promise<void> {
  const exists = await fs.promises.lstat(toAbs).then(
    () => true,
    (err) => {
      if (isErrno(err, "ENOENT")) return false;
      throw err;
    },
  );
  if (exists && !(await sameFile(fromAbs, toAbs)))
    throw new Error(`"${toRel}" already exists`);
}

export interface LinkRewriteDeps {
  /** Serializes with other writes to the same file. */
  lock: <T>(abs: string, task: () => Promise<T>) => Promise<T>;
  log: (line: string) => void;
}

export async function rewriteLinksAfterRename(
  root: string,
  from: string,
  to: string,
  skip: ReadonlySet<string>,
  { lock, log }: LinkRewriteDeps,
): Promise<VaultRenameResult> {
  let updatedFiles = 0;
  const skippedFiles: string[] = [];
  const failedFiles: string[] = [];
  for (const { rel } of await listMarkdownEntries(root)) {
    const abs = resolveInside(root, rel);
    try {
      await lock(abs, async () => {
        const before = await fs.promises.stat(abs);
        if (before.size > MAX_WRITE_BYTES) return;
        const content = await fs.promises.readFile(abs, "utf8");
        const { content: newContent, changed } = rewriteLinksInContent(
          content,
          from,
          to,
        );
        if (!changed) return;
        if (skip.has(rel)) {
          skippedFiles.push(rel);
          return;
        }
        // Edited by something else (an external editor, sync) since it was
        // read: rewriting now would drop that edit.
        const current = await fs.promises.stat(abs);
        if (current.mtimeMs !== before.mtimeMs) {
          skippedFiles.push(rel);
          return;
        }
        await atomicWrite(abs, newContent);
        updatedFiles++;
      });
    } catch (err) {
      if (isErrno(err, "ENOENT")) continue;
      log(`vault rename: couldn't update links in ${rel}: ${err}`);
      failedFiles.push(rel);
    }
  }
  return { updatedFiles, skippedFiles, failedFiles };
}
