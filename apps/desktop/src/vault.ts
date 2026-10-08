import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { app, clipboard, nativeImage, protocol, shell } from "electron";
import { broadcast, ipcHandle } from "./ipc.js";
import { KeyedMutex } from "./keyed-mutex.js";
import {
  buildFileMeta,
  kindForRel,
  MAX_WRITE_BYTES,
  pathHasIgnoredSegment,
  resolveInside,
  resolveInsideReal,
  truncateAroundMatch,
} from "./vault-core.js";
import {
  assertNotRoot,
  assertRenameTargetFree,
  atomicWrite,
  createExclusive,
  listIndexableRels,
  listMarkdownEntries,
  rewriteLinksAfterRename,
  walkVaultEntries,
} from "./vault-fs.js";
import { VaultRootRegistry } from "./vault-roots.js";
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
  VaultRenameOptions,
  VaultRenameResult,
  VaultSearchHit,
  VaultWriteResult,
} from "./vault-types.js";
import { VAULT_CONFLICT_ERROR } from "./vault-types.js";

let registry: VaultRootRegistry | null = null;
let log: (line: string) => void = () => {};

// Structural changes (create, rename, trash) serialize per vault so a name
// can't be claimed twice between "is it free?" and "take it"; content writes
// serialize per file so a stat → mtime check → write can't interleave.
const rootLocks = new KeyedMutex();
const pathLocks = new KeyedMutex();

function withRootLock<T>(root: string, task: () => Promise<T>): Promise<T> {
  return rootLocks.run(path.resolve(root), task);
}

function withPathLock<T>(abs: string, task: () => Promise<T>): Promise<T> {
  return pathLocks.run(abs, task);
}

function vaultRoots(): VaultRootRegistry {
  registry ??= new VaultRootRegistry(
    path.join(app.getPath("userData"), "vault-roots.json"),
  );
  return registry;
}

/** Called for folders the user picks in the native folder dialog. */
export function approveVaultRoot(root: string): void {
  vaultRoots().approve(root);
}

// Every channel below takes the vault root as its first argument; it must be
// one the main process approved, never just whatever the renderer sends.
function vaultHandle(
  channel: string,
  listener: (
    event: Electron.IpcMainInvokeEvent,
    root: string,
    ...args: any[]
  ) => unknown,
): void {
  ipcHandle(channel, (event, root: unknown, ...args: any[]) => {
    const result = listener(event, vaultRoots().assertApproved(root), ...args);
    if (MUTATING_CHANNELS.has(channel) && result instanceof Promise)
      trackWrite(result);
    return result;
  });
}

// A note saved from the renderer's pagehide handler arrives just as the
// window closes; quitting must not cut that write off halfway.
const MUTATING_CHANNELS = new Set([
  "vault:write",
  "vault:write-binary",
  "vault:create",
  "vault:mkdir",
  "vault:rename",
  "vault:trash",
]);
const pendingWrites = new Set<Promise<unknown>>();

function trackWrite(task: Promise<unknown>): void {
  pendingWrites.add(task);
  const done = () => pendingWrites.delete(task);
  task.then(done, done);
}

export function hasPendingVaultWrites(): boolean {
  return pendingWrites.size > 0;
}

/** Resolves once the vault writes received so far settle, or after `timeoutMs`. */
export async function settleVaultWrites(timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    Promise.allSettled([...pendingWrites]),
    new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
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

// ─── watcher (ref-counted per root, 150ms coalesce) ────────────────────────
// chokidar rather than fs.watch({recursive}): Node's recursive watcher on
// Linux attaches inotify watches per inode, so a file replaced by an atomic
// tmp+rename (our own writes, Obsidian's, git's) silently stops reporting
// changes. chokidar watches directories, which survives replacement.
interface WatchState {
  watcher: FSWatcher;
  refCount: number;
  /** Root spellings renderers subscribed with ("/a" vs "/a/"); events echo each. */
  aliases: Set<string>;
  pending: Map<string, VaultChangeKind>;
  timer: NodeJS.Timeout | null;
}

/** Keyed by the resolved root. */
const watches = new Map<string, WatchState>();
/** Refs each renderer holds, released when it reloads or goes away. */
const senderWatches = new Map<number, Map<string, number>>();

function mergeChangeKind(
  prev: VaultChangeKind | undefined,
  next: VaultChangeKind,
): VaultChangeKind | null {
  if (!prev) return next;
  if (prev === "create" && next === "delete") return null; // net no-op within the batch
  if (prev === "delete" && next === "create") return "modify";
  return next;
}

function flushPending(state: WatchState): void {
  state.timer = null;
  if (state.pending.size === 0) return;
  const changes: VaultChange[] = Array.from(state.pending, ([rel, kind]) => ({
    rel,
    kind,
  }));
  state.pending.clear();
  for (const alias of state.aliases) {
    const event: VaultChangedEvent = { root: alias, changes };
    broadcast("vault:changed", event);
  }
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
  state.timer ??= setTimeout(() => flushPending(state), 150);
}

function acquireWatch(key: string, alias: string): void {
  const existing = watches.get(key);
  if (existing) {
    existing.refCount++;
    existing.aliases.add(alias);
    return;
  }
  const watcher = chokidar.watch(key, {
    ignoreInitial: true,
    ignored: (abs) => {
      const rel = path.relative(key, abs);
      return rel !== "" && pathHasIgnoredSegment(rel.split(path.sep).join("/"));
    },
    // Folds a tmp+rename write into one "change" instead of unlink+add.
    atomic: true,
  });
  const state: WatchState = {
    watcher,
    refCount: 1,
    aliases: new Set([alias]),
    pending: new Map(),
    timer: null,
  };
  watcher
    .on("add", (abs) => recordChange(key, state, abs, "create"))
    .on("addDir", (abs) => recordChange(key, state, abs, "create"))
    .on("change", (abs) => recordChange(key, state, abs, "modify"))
    .on("unlink", (abs) => recordChange(key, state, abs, "delete"))
    .on("unlinkDir", (abs) => recordChange(key, state, abs, "delete"))
    .on("error", (err) => log(`vault watcher error root=${key}: ${err}`));
  watches.set(key, state);
}

function releaseWatch(key: string, count = 1): void {
  const state = watches.get(key);
  if (!state) return;
  state.refCount -= count;
  if (state.refCount > 0) return;
  if (state.timer) clearTimeout(state.timer);
  void state.watcher.close();
  watches.delete(key);
}

function releaseSender(senderId: number): void {
  const held = senderWatches.get(senderId);
  if (!held) return;
  senderWatches.delete(senderId);
  for (const [key, count] of held) releaseWatch(key, count);
}

// A reload or crash never runs the page's unwatch cleanup, so without this
// every reload would leak one watcher per open vault.
const trackedSenders = new WeakSet<Electron.WebContents>();
function trackSender(sender: Electron.WebContents): void {
  if (trackedSenders.has(sender)) return;
  trackedSenders.add(sender);
  const id = sender.id;
  sender.once("destroyed", () => releaseSender(id));
  sender.on("render-process-gone", () => releaseSender(id));
  // Committed cross-document navigations only (reloads included): a
  // navigation the will-navigate guard cancels leaves the page, and its
  // watches, alive.
  sender.on("did-navigate", () => releaseSender(id));
}

function watchRoot(sender: Electron.WebContents, root: string): void {
  const key = path.resolve(root);
  trackSender(sender);
  let held = senderWatches.get(sender.id);
  if (!held) {
    held = new Map();
    senderWatches.set(sender.id, held);
  }
  held.set(key, (held.get(key) ?? 0) + 1);
  acquireWatch(key, root);
}

function unwatchRoot(sender: Electron.WebContents, root: string): void {
  const key = path.resolve(root);
  const held = senderWatches.get(sender.id);
  const count = held?.get(key) ?? 0;
  if (!held || count === 0) return;
  if (count === 1) held.delete(key);
  else held.set(key, count - 1);
  releaseWatch(key);
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
      try {
        vaultRoots().assertApproved(root);
      } catch {
        return new Response(null, { status: 403 });
      }
      const abs = await resolveInsideReal(root, rel);
      return await serveLocalFile(abs, request.headers.get("range"));
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

// ─── IPC handlers ───────────────────────────────────────────────────────────
export function registerVaultHandlers(logLine: (line: string) => void): void {
  log = logLine;

  ipcHandle("vault:default-path", async (): Promise<VaultDefaultPath> => {
    const defaultPath = path.join(app.getPath("home"), "Obsidian Vault");
    const stat = await fs.promises.stat(defaultPath).catch(() => null);
    const exists = !!stat?.isDirectory();
    const isVault =
      exists && (await pathExists(path.join(defaultPath, ".obsidian")));
    if (exists) vaultRoots().approve(defaultPath);
    return { path: defaultPath, exists, isVault };
  });

  vaultHandle("vault:inspect", async (_, root: string): Promise<VaultInfo> => {
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

    const noteCount = (await listMarkdownEntries(root)).length;

    return {
      name,
      isVault,
      noteCount,
      dailyNotes,
      openToDaily,
      attachmentFolder,
    };
  });

  vaultHandle("vault:list", async (_, root: string): Promise<VaultEntry[]> => {
    return walkVaultEntries(root);
  });

  vaultHandle(
    "vault:read",
    async (_, root: string, rel: string): Promise<VaultReadResult> => {
      const abs = await resolveInsideReal(root, rel);
      const stat = await fs.promises.stat(abs);
      if (stat.size > MAX_WRITE_BYTES)
        throw new Error("File exceeds the 10MB limit for opening notes");
      const content = await fs.promises.readFile(abs, "utf8");
      return { content, mtimeMs: stat.mtimeMs };
    },
  );

  vaultHandle(
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
      assertNotRoot(root, abs);
      return withPathLock(abs, async () => {
        if (expectedMtimeMs !== null) {
          const stat = await fs.promises.stat(abs).catch(() => null);
          if (stat?.mtimeMs !== expectedMtimeMs)
            throw new Error(VAULT_CONFLICT_ERROR);
        }
        await atomicWrite(abs, content);
        const stat = await fs.promises.stat(abs);
        return { mtimeMs: stat.mtimeMs };
      });
    },
  );

  vaultHandle(
    "vault:write-binary",
    async (
      _,
      root: string,
      rel: string,
      data: Uint8Array,
    ): Promise<{ rel: string }> => {
      if (!(data instanceof Uint8Array)) throw new Error("Invalid file data");
      if (data.byteLength > MAX_WRITE_BYTES)
        throw new Error("File exceeds the 10MB write limit");
      const finalRel = await withRootLock(root, () =>
        createExclusive(root, rel, data),
      );
      return { rel: finalRel };
    },
  );

  vaultHandle(
    "vault:create",
    async (
      _,
      root: string,
      rel: string,
      content: string,
    ): Promise<{ rel: string }> => {
      if (typeof content !== "string") throw new Error("Invalid note content");
      if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES)
        throw new Error("File exceeds the 10MB write limit");
      const finalRel = await withRootLock(root, () =>
        createExclusive(root, rel, content),
      );
      return { rel: finalRel };
    },
  );

  vaultHandle(
    "vault:mkdir",
    async (_, root: string, rel: string): Promise<void> => {
      const abs = await resolveInsideReal(root, rel);
      await fs.promises.mkdir(abs, { recursive: true });
    },
  );

  vaultHandle(
    "vault:rename",
    async (
      _,
      root: string,
      from: string,
      to: string,
      options?: VaultRenameOptions,
    ): Promise<VaultRenameResult> => {
      const skip = new Set(
        Array.isArray(options?.skip)
          ? options.skip.filter((rel): rel is string => typeof rel === "string")
          : [],
      );
      // The renamed note's own unsaved buffer now lives under its new name.
      if (skip.has(from)) skip.add(to);
      return withRootLock(root, async () => {
        const fromAbs = await resolveInsideReal(root, from);
        const toAbs = await resolveInsideReal(root, to);
        assertNotRoot(root, fromAbs);
        assertNotRoot(root, toAbs);
        if (fromAbs === toAbs) return { updatedFiles: 0 };
        await assertRenameTargetFree(fromAbs, toAbs, to);
        await fs.promises.mkdir(path.dirname(toAbs), { recursive: true });
        // Waits out a save in flight, so it can't recreate the old path.
        await withPathLock(fromAbs, () => fs.promises.rename(fromAbs, toAbs));

        if (!from.toLowerCase().endsWith(".md")) return { updatedFiles: 0 };
        return rewriteLinksAfterRename(root, from, to, skip, {
          lock: withPathLock,
          log,
        });
      });
    },
  );

  vaultHandle(
    "vault:trash",
    async (_, root: string, rel: string): Promise<void> => {
      await withRootLock(root, async () => {
        const abs = await resolveInsideReal(root, rel);
        assertNotRoot(root, abs);
        await shell.trashItem(abs);
      });
    },
  );

  vaultHandle(
    "vault:reveal",
    async (_, root: string, rel: string): Promise<void> => {
      const abs = await resolveInsideReal(root, rel);
      shell.showItemInFolder(abs);
    },
  );

  vaultHandle(
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

  vaultHandle("vault:watch", async (event, root: string): Promise<void> => {
    watchRoot(event.sender, root);
  });

  vaultHandle("vault:unwatch", async (event, root: string): Promise<void> => {
    unwatchRoot(event.sender, root);
  });

  vaultHandle("vault:index", async (_, root: string): Promise<VaultIndex> => {
    const rels = await listIndexableRels(root);
    const files: VaultIndex["files"] = {};
    for (const rel of rels) {
      const abs = resolveInside(root, rel);
      const content = await fs.promises.readFile(abs, "utf8").catch(() => null);
      if (content === null) continue;
      files[rel] = buildFileMeta(rel, content);
    }
    return { files };
  });

  vaultHandle(
    "vault:search",
    async (_, root: string, query: string): Promise<VaultSearchHit[]> => {
      const trimmed = query.trim();
      if (!trimmed) return [];
      const needle = trimmed.toLowerCase();
      const hits: VaultSearchHit[] = [];
      const rels = await listIndexableRels(root);
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
