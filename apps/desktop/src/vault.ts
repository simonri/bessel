import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { app, clipboard, nativeImage, protocol, shell } from "electron";
import { broadcast, ipcHandle } from "./ipc.js";
import {
  autoSuffixName,
  buildFileMeta,
  kindForRel,
  MAX_WRITE_BYTES,
  pathHasIgnoredSegment,
  resolveInside,
  resolveInsideReal,
  rewriteLinksInContent,
  shouldIgnoreName,
  tempFileName,
  truncateAroundMatch,
} from "./vault-core.js";
import type {
  DailyNotesConfig,
  VaultChange,
  VaultChangedEvent,
  VaultChangeKind,
  VaultDefaultPath,
  VaultEntry,
  VaultIndex,
  VaultInfo,
  VaultReadResult,
  VaultSearchHit,
  VaultWriteResult,
} from "./vault-types.js";
import { VAULT_CONFLICT_ERROR } from "./vault-types.js";

function assertValidRoot(root: string): void {
  if (typeof root !== "string" || !path.isAbsolute(root))
    throw new Error("Vault root must be an absolute path");
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.promises.stat(target);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(
  target: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.promises.readFile(target, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function atomicWrite(
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
async function walkVaultEntries(root: string): Promise<VaultEntry[]> {
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

async function listMarkdownRels(root: string): Promise<string[]> {
  const entries = await walkVaultEntries(root);
  return entries.filter((e) => e.kind === "md").map((e) => e.rel);
}

// ─── watcher (ref-counted per root, 150ms coalesce) ────────────────────────
// chokidar rather than fs.watch({recursive}): Node's recursive watcher on
// Linux attaches inotify watches per inode, so a file replaced by an atomic
// tmp+rename (our own writes, Obsidian's, git's) silently stops reporting
// changes. chokidar watches directories, which survives replacement.
interface WatchState {
  watcher: FSWatcher;
  refCount: number;
  pending: Map<string, VaultChangeKind>;
  timer: NodeJS.Timeout | null;
}

const watches = new Map<string, WatchState>();

function mergeChangeKind(
  prev: VaultChangeKind | undefined,
  next: VaultChangeKind,
): VaultChangeKind | null {
  if (!prev) return next;
  if (prev === "create" && next === "delete") return null; // net no-op within the batch
  if (prev === "delete" && next === "create") return "modify";
  return next;
}

function flushPending(root: string, state: WatchState): void {
  state.timer = null;
  if (state.pending.size === 0) return;
  const changes: VaultChange[] = Array.from(state.pending, ([rel, kind]) => ({
    rel,
    kind,
  }));
  state.pending.clear();
  const event: VaultChangedEvent = { root, changes };
  broadcast("vault:changed", event);
}

function recordChange(
  root: string,
  state: WatchState,
  abs: string,
  kind: VaultChangeKind,
): void {
  const rel = path.relative(root, abs).split(path.sep).join("/");
  if (!rel || rel.startsWith("..") || pathHasIgnoredSegment(rel)) return;
  const merged = mergeChangeKind(state.pending.get(rel), kind);
  if (merged === null) state.pending.delete(rel);
  else state.pending.set(rel, merged);
  if (!state.timer)
    state.timer = setTimeout(() => flushPending(root, state), 150);
}

function watchRoot(root: string): void {
  const existing = watches.get(root);
  if (existing) {
    existing.refCount++;
    return;
  }
  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    ignored: (abs) => {
      const rel = path.relative(root, abs);
      return rel !== "" && pathHasIgnoredSegment(rel.split(path.sep).join("/"));
    },
    // Folds a tmp+rename write into one "change" instead of unlink+add.
    atomic: true,
  });
  const state: WatchState = {
    watcher,
    refCount: 1,
    pending: new Map(),
    timer: null,
  };
  watcher
    .on("add", (abs) => recordChange(root, state, abs, "create"))
    .on("addDir", (abs) => recordChange(root, state, abs, "create"))
    .on("change", (abs) => recordChange(root, state, abs, "modify"))
    .on("unlink", (abs) => recordChange(root, state, abs, "delete"))
    .on("unlinkDir", (abs) => recordChange(root, state, abs, "delete"))
    .on("error", () => {});
  watches.set(root, state);
}

function unwatchRoot(root: string): void {
  const state = watches.get(root);
  if (!state) return;
  state.refCount--;
  if (state.refCount > 0) return;
  if (state.timer) clearTimeout(state.timer);
  void state.watcher.close();
  watches.delete(root);
}

// ─── protocol ("vault://asset/?root=<enc>&path=<enc>") ─────────────────────
export function registerVaultProtocol(
  serveLocalFile: (filePath: string, range: string | null) => Promise<Response>,
): void {
  protocol.handle("vault", async (request) => {
    try {
      const url = new URL(request.url);
      const root = url.searchParams.get("root");
      const rel = url.searchParams.get("path");
      if (!root || rel === null) return new Response(null, { status: 404 });
      const abs = await resolveInsideReal(root, rel);
      return await serveLocalFile(abs, request.headers.get("range"));
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

// ─── IPC handlers ───────────────────────────────────────────────────────────
export function registerVaultHandlers(): void {
  ipcHandle("vault:default-path", async (): Promise<VaultDefaultPath> => {
    const defaultPath = path.join(app.getPath("home"), "Obsidian Vault");
    const stat = await fs.promises.stat(defaultPath).catch(() => null);
    const exists = !!stat?.isDirectory();
    const isVault =
      exists && (await pathExists(path.join(defaultPath, ".obsidian")));
    return { path: defaultPath, exists, isVault };
  });

  ipcHandle("vault:inspect", async (_, root: string): Promise<VaultInfo> => {
    assertValidRoot(root);
    const name = path.basename(root);
    const isVault = await pathExists(path.join(root, ".obsidian"));

    const dailyNotesRaw = await readJsonSafe(
      path.join(root, ".obsidian", "daily-notes.json"),
    );
    const dailyNotes: DailyNotesConfig | null = dailyNotesRaw
      ? {
          folder:
            typeof dailyNotesRaw.folder === "string"
              ? dailyNotesRaw.folder
              : "",
          format:
            typeof dailyNotesRaw.format === "string" && dailyNotesRaw.format
              ? dailyNotesRaw.format
              : "YYYY-MM-DD",
          template:
            typeof dailyNotesRaw.template === "string" && dailyNotesRaw.template
              ? dailyNotesRaw.template
              : null,
        }
      : null;

    const appJson = await readJsonSafe(
      path.join(root, ".obsidian", "app.json"),
    );
    const openToDaily = appJson?.openBehavior === "daily";
    const rawAttachment =
      typeof appJson?.attachmentFolderPath === "string"
        ? appJson.attachmentFolderPath
        : "";
    const attachmentFolder = rawAttachment === "/" ? "" : rawAttachment;

    const noteCount = (await listMarkdownRels(root)).length;

    return {
      name,
      isVault,
      noteCount,
      dailyNotes,
      openToDaily,
      attachmentFolder,
    };
  });

  ipcHandle("vault:list", async (_, root: string): Promise<VaultEntry[]> => {
    assertValidRoot(root);
    return walkVaultEntries(root);
  });

  ipcHandle(
    "vault:read",
    async (_, root: string, rel: string): Promise<VaultReadResult> => {
      const abs = await resolveInsideReal(root, rel);
      const [content, stat] = await Promise.all([
        fs.promises.readFile(abs, "utf8"),
        fs.promises.stat(abs),
      ]);
      return { content, mtimeMs: stat.mtimeMs };
    },
  );

  ipcHandle(
    "vault:write",
    async (
      _,
      root: string,
      rel: string,
      content: string,
      expectedMtimeMs: number | null,
    ): Promise<VaultWriteResult> => {
      if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES)
        throw new Error("File exceeds the 10MB write limit");

      const abs = await resolveInsideReal(root, rel);
      if (expectedMtimeMs !== null) {
        const stat = await fs.promises.stat(abs).catch(() => null);
        if (stat?.mtimeMs !== expectedMtimeMs)
          throw new Error(VAULT_CONFLICT_ERROR);
      }
      await atomicWrite(abs, content);
      const stat = await fs.promises.stat(abs);
      return { mtimeMs: stat.mtimeMs };
    },
  );

  ipcHandle(
    "vault:write-binary",
    async (
      _,
      root: string,
      rel: string,
      data: Uint8Array,
    ): Promise<{ rel: string }> => {
      const finalRel = autoSuffixName(rel, (candidate) =>
        fs.existsSync(resolveInside(root, candidate)),
      );
      const abs = await resolveInsideReal(root, finalRel);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await atomicWrite(abs, data);
      return { rel: finalRel };
    },
  );

  ipcHandle(
    "vault:create",
    async (
      _,
      root: string,
      rel: string,
      content: string,
    ): Promise<{ rel: string }> => {
      const finalRel = autoSuffixName(rel, (candidate) =>
        fs.existsSync(resolveInside(root, candidate)),
      );
      const abs = await resolveInsideReal(root, finalRel);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await atomicWrite(abs, content);
      return { rel: finalRel };
    },
  );

  ipcHandle(
    "vault:mkdir",
    async (_, root: string, rel: string): Promise<void> => {
      const abs = await resolveInsideReal(root, rel);
      await fs.promises.mkdir(abs, { recursive: true });
    },
  );

  ipcHandle(
    "vault:rename",
    async (
      _,
      root: string,
      from: string,
      to: string,
    ): Promise<{ updatedFiles: number }> => {
      const fromAbs = await resolveInsideReal(root, from);
      const toAbs = await resolveInsideReal(root, to);
      await fs.promises.mkdir(path.dirname(toAbs), { recursive: true });
      await fs.promises.rename(fromAbs, toAbs);

      let updatedFiles = 0;
      if (from.toLowerCase().endsWith(".md")) {
        const mdRels = await listMarkdownRels(root);
        for (const rel of mdRels) {
          const abs = resolveInside(root, rel);
          const content = await fs.promises
            .readFile(abs, "utf8")
            .catch(() => null);
          if (content === null) continue;
          const { content: newContent, changed } = rewriteLinksInContent(
            content,
            from,
            to,
          );
          if (changed) {
            await atomicWrite(abs, newContent);
            updatedFiles++;
          }
        }
      }
      return { updatedFiles };
    },
  );

  ipcHandle(
    "vault:trash",
    async (_, root: string, rel: string): Promise<void> => {
      const abs = await resolveInsideReal(root, rel);
      await shell.trashItem(abs);
    },
  );

  ipcHandle(
    "vault:reveal",
    async (_, root: string, rel: string): Promise<void> => {
      const abs = await resolveInsideReal(root, rel);
      shell.showItemInFolder(abs);
    },
  );

  ipcHandle(
    "vault:copy-image",
    async (_, root: string, rel: string): Promise<void> => {
      if (kindForRel(rel) !== "image")
        throw new Error("Only image files can be copied");
      const abs = await resolveInsideReal(root, rel);
      const image = nativeImage.createFromPath(abs);
      if (image.isEmpty()) throw new Error("This image couldn't be decoded");
      clipboard.writeImage(image);
    },
  );

  ipcHandle("vault:watch", async (_, root: string): Promise<void> => {
    assertValidRoot(root);
    watchRoot(root);
  });

  ipcHandle("vault:unwatch", async (_, root: string): Promise<void> => {
    unwatchRoot(root);
  });

  ipcHandle("vault:index", async (_, root: string): Promise<VaultIndex> => {
    const rels = await listMarkdownRels(root);
    const files: VaultIndex["files"] = {};
    for (const rel of rels) {
      const abs = resolveInside(root, rel);
      const content = await fs.promises.readFile(abs, "utf8").catch(() => null);
      if (content === null) continue;
      files[rel] = buildFileMeta(rel, content);
    }
    return { files };
  });

  ipcHandle(
    "vault:search",
    async (_, root: string, query: string): Promise<VaultSearchHit[]> => {
      const trimmed = query.trim();
      if (!trimmed) return [];
      const needle = trimmed.toLowerCase();
      const hits: VaultSearchHit[] = [];
      const rels = await listMarkdownRels(root);
      for (const rel of rels) {
        if (hits.length >= 500) break;
        const abs = resolveInside(root, rel);
        const content = await fs.promises
          .readFile(abs, "utf8")
          .catch(() => null);
        if (content === null) continue;
        const lines = content.split(/\r\n|\n/);
        for (let i = 0; i < lines.length; i++) {
          const idx = lines[i].toLowerCase().indexOf(needle);
          if (idx === -1) continue;
          hits.push({ rel, line: i, text: truncateAroundMatch(lines[i], idx) });
          if (hits.length >= 500) break;
        }
      }
      return hits;
    },
  );
}
