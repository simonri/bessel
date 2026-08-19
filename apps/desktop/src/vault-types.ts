// Shared shapes for the Obsidian vault IPC surface. Mirrored verbatim in
// apps/web/src/components/obsidian/vault-types.ts — keep both in sync.

export type VaultEntryKind =
  | "dir"
  | "md"
  | "image"
  | "pdf"
  | "canvas"
  | "base"
  | "other";

export interface VaultEntry {
  /** Path relative to the vault root, always "/"-separated, no leading "/". */
  rel: string;
  kind: VaultEntryKind;
  mtimeMs: number;
  size: number;
}

export interface VaultDefaultPath {
  path: string;
  exists: boolean;
  /** Has an `.obsidian/` directory. */
  isVault: boolean;
}

export interface DailyNotesConfig {
  /** Folder relative to the root; "" for the root itself. */
  folder: string;
  /** moment.js format string, Obsidian default "YYYY-MM-DD". */
  format: string;
  /** Template note rel (without ".md"), or null. */
  template: string | null;
}

export interface VaultInfo {
  name: string;
  isVault: boolean;
  noteCount: number;
  dailyNotes: DailyNotesConfig | null;
  /** `.obsidian/app.json` `openBehavior === "daily"`. */
  openToDaily: boolean;
  /** `.obsidian/app.json` `attachmentFolderPath`; "" means vault root. */
  attachmentFolder: string;
}

export type VaultChangeKind = "create" | "modify" | "delete";

export interface VaultChange {
  rel: string;
  kind: VaultChangeKind;
}

export interface VaultChangedEvent {
  root: string;
  changes: VaultChange[];
}

export interface VaultReadResult {
  content: string;
  mtimeMs: number;
}

export interface VaultWriteResult {
  mtimeMs: number;
}

export interface VaultLink {
  /** Raw target as written, e.g. "Journal/2026-01-11" or "Fiske". */
  target: string;
  heading: string | null;
  alias: string | null;
  embed: boolean;
  /** 0-based line. */
  line: number;
}

export interface VaultHeading {
  level: number;
  text: string;
  /** 0-based line. */
  line: number;
}

export interface VaultFileMeta {
  rel: string;
  links: VaultLink[];
  tags: string[];
  headings: VaultHeading[];
  /** Frontmatter `aliases:`. */
  aliases: string[];
}

export interface VaultIndex {
  /** Keyed by rel of every `.md` file. */
  files: Record<string, VaultFileMeta>;
}

export interface VaultSearchHit {
  rel: string;
  /** 0-based line. */
  line: number;
  text: string;
}

/** Error message thrown by `vault:write` when the on-disk mtime moved. */
export const VAULT_CONFLICT_ERROR = "VAULT_CONFLICT";
