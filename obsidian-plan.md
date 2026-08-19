# Obsidian vault page — implementation plan

Goal: a built-in **Obsidian** page in Bessel. Opening it lets you pick a vault
(default `~/Obsidian Vault`), then browse, preview and edit the notes with an
Obsidian-like experience (file tree, source / live-preview / reading modes,
`[[wikilinks]]`, embeds, daily notes) while staying 100% file-compatible with
the real Obsidian app that keeps syncing the same folder.

Written 2026-08-19 against `master` @ `5bf7f5f`.

---

## 0. Findings that shape the design

| Fact | Consequence |
| --- | --- |
| The API runs on the VPS; the vault lives on Simon's machine. | The page is **desktop-only** (Electron), like `terminal` / `browser` / `claudeCode`. No backend, no migrations, no `make clients`. |
| Electron main already has a trusted-sender IPC helper (`apps/desktop/src/ipc.ts` `ipcHandle`/`broadcast`), a folder dialog (`dialog:select-folder`, used by `canvas/projects-dropdown.tsx`), `git:*` handlers that take a user-supplied repo path, an `app://` privileged scheme with `serveLocalFile` (`main.ts:~645`, MIME map + range support), and feature modules split into files (`spotify.ts`, `ports.ts`, `my-ai.ts` — the smallest template). There is **no `fs.watch`/chokidar anywhere yet**. | Add a `vault.ts` module with `vault:*` channels plus a `vault://` scheme for images/attachments. Same conventions; the watcher is the only genuinely new mechanism. |
| "Pages" are shell state, not router routes (`apps/web/src/components/pages.ts`, `app-shell.tsx` keeps the canvas mounted and unmounts other pages on switch via `<ContentPage key={activePage}>`). Pages are built from `MODULE_REGISTRY` (`canvas/module-registry.tsx`), which also makes them canvas widgets. | Register one `ModuleKey`/`PageKey` `"obsidian"` → we get a sidebar page **and** a "pin this note to the canvas" widget from the same component. Must flush unsaved edits on unmount. |
| Frontend prefs live in `bessel:settings` (`hooks/use-settings.tsx`) and per-feature `localStorage` keys (`bessel:workspaces`, …). | Vault path / recent vaults go into `Settings`; per-vault UI state (last file, expanded folders, mode) into `bessel:obsidian:<vaultPath>`. |
| Already available deps: `react-markdown` + `remark-gfm` (recipes page), `shiki`, `cmdk`, `react-resizable-panels`, `@tailwindcss/typography` (`prose` classes in recipes). No CodeMirror/ProseMirror yet. | Reading mode reuses the recipes markdown stack. Editing needs **CodeMirror 6** — the same engine Obsidian's own editor is built on, which is what makes "edit just like in Obsidian" (live preview) achievable. |
| Simon's vault: 136 `.md`, 7 png "Pasted image …", 4 `.base`, `.git`, `.obsidian/` with `daily-notes.json` (`folder: Journal`, `template: Templates/Journal`), `app.json` `openBehavior: "daily"`, `appearance.json` theme `obsidian` (dark), core plugins incl. backlinks, tags, bookmarks, bases, canvas; community plugin `obsidian-image-toolkit`. | Small enough to index the whole vault in memory on open. Daily-note config must be honoured. `.base`/`.canvas`/graph are **out of scope** → "Open in Obsidian" escape hatch. |

### Rejected alternatives

- **Embed Obsidian itself** in a `<webview>` — Obsidian is an Electron app with no web UI; impossible.
- **ProseMirror WYSIWYG (Tiptap/Milkdown)** — produces a rich-text editor, not Obsidian's "markdown with hidden syntax" feel; round-tripping markdown through a ProseMirror schema also rewrites files Obsidian Sync is watching. CM6 edits the raw text, so files stay byte-identical except for what you typed.
- **Backend file proxy** (API reads the vault) — the API is remote; a local daemon for this is overkill when the Electron main process already has fs access.

---

## 1. Architecture

```
┌ Electron main (apps/desktop/src/vault.ts) ───────────────────────────────┐
│ vault:* IPC (list / read / write / create / rename / trash / watch /     │
│ index / search / daily-note-config)      vault:// protocol for assets   │
└──────────────────────────────▲──────────────────────────────────────────┘
                               │ preload.ts → window.electron.vault.*
┌ Renderer (apps/web/src/components/obsidian/) ────────────────────────────┐
│ ObsidianPage                                                             │
│  ├─ VaultPicker        (no vault chosen / "Switch vault")                │
│  └─ VaultWorkspace                                                       │
│      ├─ FileTree (left panel)   ├─ NoteView (center)                     │
│      │   search, new note/folder│   mode: source | live | reading        │
│      │   context menu           │   CM6 editor  /  ReactMarkdown         │
│      └─ (phase 2) Backlinks/Outline (right panel)                        │
│ hooks/use-vault.ts  — TanStack Query over IPC, invalidated by watcher    │
│ lib/wikilinks.ts    — Obsidian link resolution, shared by editor+preview │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Electron main — `apps/desktop/src/vault.ts`

All handlers take `(root: string, rel: string)`; `rel` is resolved with
`resolveInside(root, rel)` which rejects anything escaping `root`
(`path.resolve` + `realpath` prefix check, so symlinks can't escape either).
`root` must be an absolute existing directory — same trust model as `git:*`.

| Channel | Returns | Notes |
| --- | --- | --- |
| `vault:default-path` | `{ path, exists, isVault }` | `path.join(app.getPath("home"), "Obsidian Vault")`. `isVault` = has `.obsidian/`. |
| `vault:inspect(root)` | `{ name, isVault, noteCount, dailyNotes?: { folder, format, template } }` | Reads `.obsidian/daily-notes.json` (defaults: folder `""`, format `YYYY-MM-DD`). |
| `vault:list(root)` | `VaultEntry[]` flat list `{ rel, kind: "dir"\|"md"\|"image"\|"pdf"\|"canvas"\|"base"\|"other", mtimeMs, size }` | Skips `.obsidian`, `.git`, `.trash`, `node_modules`, dotfiles. Renderer builds the tree. Cap 50k entries. |
| `vault:read(root, rel)` | `{ content, mtimeMs }` | UTF-8 text only; binary → error. |
| `vault:write(root, rel, content, expectedMtimeMs \| null)` | `{ mtimeMs }` | Atomic (`write tmp` + `rename`). If `expectedMtimeMs` is set and disk mtime differs → throws `VaultConflictError` so the renderer can offer reload/overwrite. |
| `vault:create(root, rel, content = "")` | `{ rel }` | `wx` flag; auto-suffix `Untitled 1.md` like Obsidian. `vault:mkdir` likewise. |
| `vault:rename(root, from, to)` | `void` | Phase 2 additionally rewrites `[[from]]` links across the vault (Obsidian's "automatically update internal links"). |
| `vault:trash(root, rel)` | `void` | `shell.trashItem` (system trash) — matches Obsidian's default. |
| `vault:watch(root)` / `vault:unwatch(root)` | `void` | `fs.watch(root, { recursive: true })` (Node ≥20 supports recursive on Linux; Electron 36 ships Node 22). Events coalesced 150 ms and broadcast as `vault:changed` `{ root, changes: [{ rel, kind: "create"\|"modify"\|"delete" }] }`. Ignores the same paths as `list`. Ref-counted per root. |
| `vault:index(root)` | `{ files, links: Record<rel, string[]>, tags: Record<tag, rel[]>, headings: Record<rel, string[]> }` | Regex scan of all `.md` (`[[…]]`, `#tag`, `^#+ `, frontmatter `tags:`). Used for autocomplete, backlinks, unresolved links. Recomputed incrementally on `vault:changed`. Phase 2. |
| `vault:search(root, query)` | `{ rel, line, text }[]` | Case-insensitive substring over `.md`; capped at 500 hits. Phase 2. |
| `vault:reveal(root, rel)` | `void` | `shell.showItemInFolder`. |

**Assets** — register a `vault` privileged scheme next to `app` (`standard`, `secure`, `supportFetchAPI`, `stream`) and `protocol.handle("vault", …)`: URL form
`vault://asset/?root=<encodeURIComponent(root)>&path=<encodeURIComponent(rel)>`.
Handler runs `resolveInside`, then the existing `serveLocalFile(target, range)`
(already does mime + range). Used for `![[image.png]]`, `![](img.png)`, PDFs.
Writes are never exposed through the protocol. Image loads are resource
requests, not navigations, so the window's `will-navigate` origin allow-list is
untouched.

**Safety**: every handler goes through `ipcHandle` (trusted origin check);
all paths through `resolveInside`; text writes limited to 10 MB; binary reads
only via the protocol.

### 1.2 Preload / types

- `apps/desktop/src/preload.ts`: `vault: { defaultPath, inspect, list, read, write, create, mkdir, rename, trash, watch, unwatch, onChanged(root, cb), index, search, reveal }`, `assetUrl(root, rel)` helper.
- `apps/web/src/types/electron.d.ts`: mirror the signatures (hand-maintained, as today). Shared `VaultEntry`, `VaultChange`, `VaultIndex` types in `apps/desktop/src/vault-types.ts` re-exported for the web `.d.ts`.

### 1.3 Renderer

**Registration**
- `window-manager.tsx`: add `"obsidian"` to `ModuleKey` and to the desktop-only `ALL_MODULES` list.
- `module-registry.tsx`: `obsidian: { title: "Obsidian", icon: <Obsidian brand icon in brand-icons.tsx>, component: lazy(() => import("@/components/obsidian/obsidian-page")), ...SESSION_SIZE, multiInstance: true, noPadding: true }` and include it in `desktopModules`.
- `pages.ts`: add `"obsidian"` to `PageKey`, `PAGE_REGISTRY` via `fromModule("obsidian", true)`, and to `PRIMARY_PAGES` **only when `isDesktop`** (web build never shows it). `isPageKey` follows automatically.
- Widget vs page: the same component reads `useWindowEntry()`; when it has `data.file` it renders a single note (widget mode, no file tree unless widened); as a page it renders the full workspace.

**Settings / persistence**
- `use-settings.tsx` `Settings` gains `obsidianVaultPath: string | null` and `obsidianRecentVaults: string[]` (max 5).
- `bessel:obsidian:<vaultPath>` → `{ lastFile, mode, expandedDirs, treeWidth }`.

**Files (new, under `apps/web/src/components/obsidian/`)**

| File | Responsibility |
| --- | --- |
| `obsidian-page.tsx` | Entry. Picker if no vault / "switch" requested; otherwise `VaultWorkspace`. Handles "vault path no longer exists" (back to picker with a toast). |
| `vault-picker.tsx` | Cards: default `~/Obsidian Vault` (badge "Obsidian vault detected", note count, last modified) pre-selected; recent vaults; "Choose folder…" (`window.electron.selectFolder`, same call `projects-dropdown.tsx` makes); "Open" CTA. Non-vault folders are allowed with a hint. Visual language borrowed from `settings-my-ai-page.tsx` (path + reveal). Shown on first visit; later visits go straight to the remembered vault and the picker is reachable from the header's vault switcher. |
| `vault-workspace.tsx` | `react-resizable-panels` layout, header (vault name / breadcrumb, mode segmented control, "Today" daily-note button, "Open in Obsidian", vault switcher dropdown), keyboard shortcuts (`Ctrl+O` quick switcher, `Ctrl+E` toggle mode, `Ctrl+N` new note, `Ctrl+S` force save). |
| `file-tree.tsx` | Folder tree from `vault:list`; folders first, natural sort, collapsed state persisted; inline rename; context menu (`@bessel/ui` context-menu): New note, New folder, Rename, Trash, Reveal, Pin to canvas. Filter box at top. |
| `note-view.tsx` | Owns the open file: load → buffer → autosave (400 ms debounce, plus on blur / file switch / page unmount / `beforeunload`), conflict handling, external-change reload when not dirty. Renders `NoteEditor` or `NoteReader` by mode. Title row = filename (editable → rename). |
| `note-editor.tsx` | CodeMirror 6 instance (see §2). |
| `note-reader.tsx` | `ReactMarkdown` with the Obsidian remark/rehype plugin set (see §2), `prose prose-invert` styling lifted from recipes into a shared `markdown-prose` class. |
| `quick-switcher.tsx` | `cmdk` dialog over `vault:list` (+ search results in phase 2); `Ctrl+O`. |
| `backlinks-panel.tsx`, `outline-panel.tsx` | Phase 2 right panel. |
| `hooks/use-vault.ts` | `useVaultTree(root)`, `useNote(root, rel)`, `useVaultIndex(root)`, `useVaultWatcher(root)` (subscribes once, patches query cache per change), mutations `useSaveNote` etc. Query keys `["vault", root, …]`. |
| `lib/wikilinks.ts` | Pure: parse `[[target#heading|alias]]`, `![[embed]]`; `resolveLink(index, fromRel, target)` using Obsidian's rules (exact path → basename match, shortest path wins, case-insensitive, `.md` optional); `assetUrl`. Unit-tested. |
| `lib/daily-notes.ts` | Format today's filename from `.obsidian/daily-notes.json` (`moment` tokens → `date-fns` tokens for the common cases `YYYY-MM-DD`, `YYYY/MM/…`), open-or-create from template. |

---

## 2. Editor — "just like Obsidian"

Obsidian's editor = CodeMirror 6 + lezer-markdown; its **Live Preview** is a set
of decorations that hide markdown syntax everywhere except on the line(s) the
cursor touches. We replicate that mechanism rather than approximate it.

Dependencies (web): `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/lang-markdown`, `@codemirror/commands`, `@codemirror/autocomplete`, `@codemirror/search`, `@lezer/markdown`, `@lezer/highlight`. Reading mode extras: `remark-frontmatter`, (phase 3) `remark-math` + `rehype-katex`.

### Modes

1. **Source** (phase 1) — `markdown({ base: markdownLanguage, codeLanguages })` with GFM + a custom `@lezer/markdown` inline extension for `WikiLink`/`Embed`/`Tag`/`Highlight(==)` nodes; syntax highlight theme using the app's CSS tokens; line wrapping; bracket/`[[` auto-close; `Tab` indents lists; `Ctrl+B/I` wraps.
2. **Reading** (phase 1) — `ReactMarkdown` + `remark-gfm` + `remark-frontmatter` (properties rendered as a key/value table at the top) + our `remark-obsidian` plugin (wikilinks → internal links, `![[img]]` → `<img src=vault://…>`, `![[note]]` → embedded note block, `#tags` → chips, `> [!note]` callouts, `==highlight==`), code blocks via the existing shiki highlighter, task checkboxes toggle the underlying `- [ ]` in the file.
3. **Live preview** (phase 2) — `ViewPlugin` building `Decoration.replace`/`Decoration.mark` over the syntax tree: hide `HeaderMark`, `EmphasisMark`, `LinkMark`, `CodeMark`, wikilink brackets… on lines outside the selection; headings sized; inline code styled; wikilinks clickable (`Ctrl`+click / click when not editing); images as `WidgetType` below their line; checkboxes clickable. Same file, same buffer — toggling modes is instant (`Ctrl+E`, like Obsidian).

### Obsidian behaviours to match (checklist)

- [ ] `[[` autocomplete from the vault index (files, then `#headings` after `#`), `|` alias.
- [ ] Click wikilink → open note; missing target → create it (Obsidian creates in the default new-note location).
- [ ] Daily note: `Today` button + "open vault to today's note" when `.obsidian/app.json` has `openBehavior: "daily"`; template applied on create.
- [ ] New note → `Untitled.md` in selected folder, title focused for rename.
- [ ] Autosave; never rewrite untouched bytes (CM6 edits only; preserve trailing newline / CRLF as found).
- [ ] External edits (Obsidian Sync, git pull) show up live (watcher) — replace buffer when clean, show a conflict bar when dirty.
- [ ] Images paste: `Ctrl+V` with an image writes `Pasted image YYYYMMDDHHmmss.png` to the vault root (Obsidian's default attachment folder setting — read `attachmentFolderPath` from `app.json` if set) and inserts `![[…]]`.
- [ ] Tags, backlinks, outline panes (phase 2).
- [ ] Dark theme matching Obsidian's `obsidian` theme vibe but using Bessel tokens.

### Explicitly out of scope

Graph view, `.canvas`, `.base` (Bases), community plugins, Obsidian themes/CSS snippets, PDF annotation, Publish/Sync UI, workspace.json round-tripping, mobile/web build. All of these get the **"Open in Obsidian"** button (`shell.openExternal("obsidian://open?vault=<name>&file=<rel>")`) which works because the vault is the same folder.

---

## 3. Phases

### Phase 1 — usable MVP (vault picker, tree, source editor, reading mode)

Desktop
1. `apps/desktop/src/vault.ts`: `resolveInside`, handlers `default-path`, `inspect`, `list`, `read`, `write`, `create`, `mkdir`, `rename`, `trash`, `reveal`, `watch/unwatch` + `vault://` scheme. Wire from `main.ts` like `registerPortsIpc`-style modules; `registerSchemesAsPrivileged` gains `vault`.
2. `preload.ts` + `apps/web/src/types/electron.d.ts`.

Web
3. Deps: CodeMirror packages, `remark-frontmatter`.
4. `use-settings.tsx`: `obsidianVaultPath`, `obsidianRecentVaults`.
5. Registration: `ModuleKey`/`PageKey` `"obsidian"`, brand icon, desktop-only sidebar entry.
6. `obsidian-page.tsx`, `vault-picker.tsx`, `vault-workspace.tsx`, `file-tree.tsx`, `note-view.tsx`, `note-editor.tsx` (source mode), `note-reader.tsx`, `hooks/use-vault.ts`, `lib/wikilinks.ts`, `lib/daily-notes.ts`.
7. Header actions: mode toggle (Source / Reading), Today, Open in Obsidian, Reveal, Switch vault.
8. Autosave + watcher + conflict bar; flush on unmount/`beforeunload`.

Tests: `wikilinks.test.ts` (resolution rules, alias/heading parsing), `daily-notes.test.ts` (format mapping) — both alongside the existing web vitest suites (`use-settings.test.tsx`, `new-session-page.test.tsx`); `resolveInside` unit test (desktop has `tsc` only today — add a minimal vitest config in `apps/desktop`); `apps/web:verify` headless pass for the picker → tree → edit → save → reload flow.

Exit criteria: open `~/Obsidian Vault`, browse `Journal/`, edit a note, see the change in Obsidian immediately and vice-versa, images render in reading mode, `[[links]]` navigate.

### Phase 2 — Obsidian feel
- Live preview mode (decorations plugin) + `Ctrl+E`.
- `vault:index` + `[[` autocomplete, backlinks panel, tags pane, outline.
- Quick switcher (`Ctrl+O`), full-text search (`Ctrl+Shift+F`) via `vault:search`.
- Rename updates links across the vault; unresolved-link styling.
- Image paste, callouts, embeds of notes, checkbox toggling in all modes.
- Tabs for multiple open notes (window-level state, persisted per vault).

### Phase 3 — integration polish
- Canvas widget mode (`data.file`) + "Pin to canvas" from the tree; command-palette entry "Open note…".
- Properties (frontmatter) editor UI; math rendering; templates picker; word count in status line.
- Multiple vaults open side by side (root is already a parameter everywhere).

---

## 4. Risks / open questions

- **Recursive `fs.watch` on Linux** is supported natively from Node 20 — verify on Electron 36; fall back to `chokidar` if it misbehaves on Simon's btrfs/overlay setup (`/home/simon/Obsidian Vault` is a plain dir).
- **Obsidian Sync conflicts**: Obsidian writes atomically too; our mtime-guarded write plus the watcher covers the realistic cases. Both apps editing the same note simultaneously is user error; we surface it rather than merge.
- **Live preview fidelity** is the big-ticket item (headings, lists, tables, images, links). Budget it as its own milestone; source + reading mode already make the page useful.
- **Daily-note format tokens** use moment syntax; support the common subset and show the raw format string if unsupported.
- **Electron sandbox**: the renderer never touches `fs`; everything stays behind `ipcHandle` + `resolveInside`. The `vault://` handler must reject requests with roots outside the user's chosen vault list? — Decision: keep the same trust level as `git:*` (any absolute path the renderer asks for), documented, since the renderer origin is already gated.

---

## 5. Effort estimate

| Phase | Scope | Est. |
| --- | --- | --- |
| 1 | ~12 new files, ~5 edited; desktop IPC + protocol; CM6 source + reader | 1.5–2 days |
| 2 | live preview plugin, index, search, switcher, backlinks, tabs | 2–3 days |
| 3 | widget mode, properties, math, templates | 1 day |
