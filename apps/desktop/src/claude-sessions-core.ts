// Pure logic behind claude-sessions.ts: parsing the `claude` CLI's output and
// deciding what a background session's state is and what to do about it.
// Kept free of Electron so it can be unit tested.
//
// Behaviour of the CLI this relies on (verified against Claude Code 2.1.287;
// none of it is documented):
// - `claude --bg …` prints "backgrounded · <8-hex id> · <name>". The full
//   session id is only learned from `claude agents --json` afterwards
//   (`--session-id` is ignored together with `--bg`).
// - `claude agents --json --all` lists background and interactive sessions.
//   A stopped background session keeps its entry but has no `pid`.
// - `status` is "busy" while generating, else "idle". `state` is "blocked"
//   while waiting on the user and "done" once a turn has finished.
// - `claude respawn <id>` wakes a stopped session under the same id;
//   `claude --bg --resume <sessionId>` continues an old conversation as a new
//   background session with a new id.
// - `claude logs <id>` contains the Remote Control URL once it's connected.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ClaudeAgentEntry,
  ClaudeConversation,
  ClaudeConversationPreview,
  ClaudeExchange,
  ClaudeSessionStatus,
  StoredClaudeSession,
} from "./claude-sessions-types.js";

const BACKGROUNDED_RE = /backgrounded\s+\S+\s+([0-9a-f]{8})\b/;
const REMOTE_URL_RE = /https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+/g;
const UNTRUSTED_RE = /Workspace not trusted/i;
// Terminal escape sequences (CSI, OSC, two-byte) in `claude logs` output.
const ANSI_RE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching escapes is the point
  /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;

const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Claude session ids are UUIDs; anything else must never reach a path or argv. */
export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_RE.test(value);
}

/** Appends `chunk`, keeping only the last `max` characters. */
export function appendTail(buffer: string, chunk: string, max: number): string {
  const next = buffer + chunk;
  return next.length > max ? next.slice(next.length - max) : next;
}

export function parseBackgroundedId(output: string): string | null {
  return BACKGROUNDED_RE.exec(output)?.[1] ?? null;
}

export function isUntrustedWorkspaceError(output: string): boolean {
  return UNTRUSTED_RE.test(output);
}

/** The last Remote Control URL printed — a reconnect prints a fresh one. */
export function parseRemoteUrl(logs: string): string | null {
  const matches = logs.replace(ANSI_RE, "").match(REMOTE_URL_RE);
  return matches?.at(-1) ?? null;
}

export function parseAgents(json: string): ClaudeAgentEntry[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("expected a JSON array");
  return parsed.flatMap((raw): ClaudeAgentEntry[] => {
    if (typeof raw !== "object" || raw === null) return [];
    const r = raw as Record<string, unknown>;
    if (typeof r.sessionId !== "string" || typeof r.cwd !== "string") return [];
    return [
      {
        id: typeof r.id === "string" ? r.id : null,
        pid: typeof r.pid === "number" ? r.pid : null,
        cwd: r.cwd,
        kind: r.kind === "background" ? "background" : "interactive",
        startedAt: typeof r.startedAt === "number" ? r.startedAt : 0,
        sessionId: r.sessionId,
        name: typeof r.name === "string" ? r.name : null,
        status: typeof r.status === "string" ? r.status : null,
        state: typeof r.state === "string" ? r.state : null,
      },
    ];
  });
}

export function agentStatus(
  entry: ClaudeAgentEntry | undefined,
): ClaudeSessionStatus {
  if (!entry) return "missing";
  if (entry.pid === null) return "stopped";
  // `status` is live; `state` describes the last turn and goes stale across
  // a respawn (an idle, respawned session still reports "working").
  if (entry.status === "busy") return "working";
  if (entry.state === "blocked") return "waiting";
  return "idle";
}

export function isRunning(status: ClaudeSessionStatus): boolean {
  return status === "working" || status === "waiting" || status === "idle";
}

/**
 * A stored session's status as the UI should see it. Until Bessel has looked
 * at Claude's sessions once since launch, nothing is known yet: a session
 * left running then isn't "missing", it just hasn't been checked.
 */
export function sessionStatus(
  session: StoredClaudeSession,
  agent: ClaudeAgentEntry | undefined,
  {
    checked,
    pending,
    hasConversation = true,
  }: {
    checked: boolean;
    pending: boolean;
    /** Whether anything was said yet: a fresh session also reports "blocked". */
    hasConversation?: boolean;
  },
): ClaudeSessionStatus {
  if (session.endedAt !== undefined) return "ended";
  if (!checked) return "starting";
  const status = agentStatus(agent);
  if (!isRunning(status) && pending) return "starting";
  if (status === "waiting" && !hasConversation) return "idle";
  return status;
}

export type ReconcileAction =
  | { kind: "respawn"; key: string }
  | { kind: "resume"; key: string }
  | { kind: "end"; key: string };

/**
 * What to do with Bessel's sessions given the CLI's current view.
 *
 * At startup, every session Bessel left running but which isn't anymore (a
 * reboot, a crash of Claude's background service) is brought back. While
 * Bessel is running, a session that goes away was ended on purpose — /exit,
 * `claude stop`, or from the phone — so it's marked ended instead.
 * `pending` holds sessions Bessel itself just (re)started, which may not
 * show up as running for a moment.
 */
export function reconcile(
  sessions: readonly StoredClaudeSession[],
  agentsById: ReadonlyMap<string, ClaudeAgentEntry>,
  {
    startup,
    pending,
    wasRunning,
  }: {
    startup: boolean;
    pending: ReadonlySet<string>;
    wasRunning: ReadonlySet<string>;
  },
): ReconcileAction[] {
  const actions: ReconcileAction[] = [];
  for (const s of sessions) {
    if (s.endedAt !== undefined || pending.has(s.key)) continue;
    const status = agentStatus(agentsById.get(s.bgId));
    if (isRunning(status)) continue;
    if (startup) {
      actions.push({
        kind: status === "stopped" ? "respawn" : "resume",
        key: s.key,
      });
    } else if (wasRunning.has(s.key)) {
      actions.push({ kind: "end", key: s.key });
    }
  }
  return actions;
}

/** Ended sessions are kept around to be resumed, but not forever. */
export function pruneEnded(
  sessions: readonly StoredClaudeSession[],
  now: number,
  { maxAgeMs, maxCount }: { maxAgeMs: number; maxCount: number },
): StoredClaudeSession[] {
  const ended = sessions
    .filter((s) => s.endedAt !== undefined && now - s.endedAt <= maxAgeMs)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    .slice(0, maxCount);
  const keep = new Set(ended.map((s) => s.key));
  return sessions.filter((s) => s.endedAt === undefined || keep.has(s.key));
}

function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

export function claudeProjectDir(cwd: string): string {
  return path.join(os.homedir(), ".claude", "projects", encodeProjectDir(cwd));
}

/**
 * Where the project's transcripts live: its own directory, then those of its
 * worktrees. A session that moves itself into `<cwd>/.claude/worktrees/<name>`
 * carries its transcript along to that worktree's directory, and keeps it
 * there after the worktree is removed. `claude --resume` run in the project
 * still finds it there.
 */
export function projectTranscriptDirs(
  cwd: string,
): { dir: string; worktree?: string }[] {
  const projects = path.join(os.homedir(), ".claude", "projects");
  const worktreePrefix = `${encodeProjectDir(cwd)}--claude-worktrees-`;
  let names: string[];
  try {
    names = fs.readdirSync(projects);
  } catch {
    names = [];
  }
  return [
    { dir: claudeProjectDir(cwd) },
    ...names
      .filter((name) => name.startsWith(worktreePrefix))
      .sort()
      .map((name) => ({
        dir: path.join(projects, name),
        // As encoded: a name's dots and slashes read back as dashes.
        worktree: name.slice(worktreePrefix.length),
      })),
  ];
}

function findTranscript(cwd: string, sessionId: string): string | null {
  for (const { dir } of projectTranscriptDirs(cwd)) {
    const file = path.join(dir, `${sessionId}.jsonl`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

export function transcriptExists(cwd: string, sessionId: string): boolean {
  return findTranscript(cwd, sessionId) !== null;
}

const TITLE_SCAN_BYTES = 256 * 1024;
const MAX_TITLE_LENGTH = 120;

function readSlice(fd: number, start: number, length: number): string {
  const buf = Buffer.alloc(length);
  const read = fs.readSync(fd, buf, 0, length, start);
  return buf.subarray(0, read).toString("utf8");
}

/**
 * Whether the session's transcript holds a message yet. Claude writes the file
 * as soon as it starts, with only its settings in it, so the file alone says
 * nothing. One past the scanned head is taken as a conversation without looking.
 */
export function transcriptHasConversation(
  cwd: string,
  sessionId: string,
): boolean {
  const file = findTranscript(cwd, sessionId);
  return file !== null && fileHasConversation(file);
}

function fileHasConversation(file: string): boolean {
  let fd: number;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return false;
  }
  try {
    if (fs.fstatSync(fd).size > TITLE_SCAN_BYTES) return true;
    return /"type":"(user|assistant)"/.test(readSlice(fd, 0, TITLE_SCAN_BYTES));
  } finally {
    fs.closeSync(fd);
  }
}

function lastField(text: string, type: string, field: string): string | null {
  let found: string | null = null;
  for (const line of text.split("\n")) {
    if (!line.includes(`"type":"${type}"`)) continue;
    try {
      const value = (JSON.parse(line) as Record<string, unknown>)[field];
      if (typeof value === "string" && value.trim()) found = value.trim();
    } catch {
      // A line cut in half by the scan window.
    }
  }
  return found;
}

/**
 * A transcript's title, the same way Claude's own resume picker names it: a
 * title the user set, then the AI-generated one, then the last prompt. Only
 * the head and tail of the file are scanned — transcripts run to tens of MB.
 */
export function transcriptTitle(file: string): string | null {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const head = readSlice(fd, 0, Math.min(size, TITLE_SCAN_BYTES));
    const tail =
      size > TITLE_SCAN_BYTES
        ? readSlice(
            fd,
            Math.max(TITLE_SCAN_BYTES, size - TITLE_SCAN_BYTES),
            TITLE_SCAN_BYTES,
          )
        : "";
    const text = `${head}\n${tail}`;
    const title =
      lastField(text, "custom-title", "customTitle") ??
      lastField(text, "ai-title", "aiTitle") ??
      lastField(text, "last-prompt", "lastPrompt");
    if (!title) return null;
    const oneLine = title.replace(/\s+/g, " ");
    return oneLine.length > MAX_TITLE_LENGTH
      ? `${oneLine.slice(0, MAX_TITLE_LENGTH - 1)}…`
      : oneLine;
  } finally {
    fs.closeSync(fd);
  }
}

const UUID_JSONL_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;

/** The project's past conversations, its worktrees' included, newest first. */
export function listConversations(
  cwd: string,
  limit: number,
): ClaudeConversation[] {
  const files = projectTranscriptDirs(cwd).flatMap(({ dir, worktree }) => {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return [];
    }
    return names.flatMap((name) => {
      const sessionId = UUID_JSONL_RE.exec(name)?.[1];
      if (!sessionId) return [];
      try {
        const stat = fs.statSync(path.join(dir, name));
        return [
          {
            sessionId,
            file: path.join(dir, name),
            updatedAt: stat.mtimeMs,
            worktree,
          },
        ];
      } catch {
        return [];
      }
    });
  });
  files.sort((a, b) => b.updatedAt - a.updatedAt);
  const seen = new Set<string>();
  const newest = files.filter(({ sessionId }) => {
    if (seen.has(sessionId)) return false;
    seen.add(sessionId);
    return true;
  });
  return newest
    .slice(0, limit)
    .flatMap(({ sessionId, file, updatedAt, worktree }) => {
      let title: string | null;
      try {
        title = transcriptTitle(file);
      } catch {
        return [];
      }
      // Transcripts without a single message are aborted starts, not
      // conversations, even once a name was given to them.
      if (!title || !fileHasConversation(file)) return [];
      return [
        { sessionId, title, updatedAt, ...(worktree ? { worktree } : {}) },
      ];
    });
}

const PREVIEW_EXCHANGES = 3;
const PREVIEW_TEXT_LENGTH = 400;
const PREVIEW_CHUNK_BYTES = 512 * 1024;
// Tool output can bury the last prompts under megabytes; past this, show what
// was found rather than read on.
const PREVIEW_MAX_BYTES = 8 * 1024 * 1024;

interface TranscriptMessage {
  type?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  isCompactSummary?: boolean;
  timestamp?: string;
  message?: { content?: unknown };
}

function textBlocks(content: unknown): string[] | null {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return null;
  // A tool's result rides in as a user message; it isn't something typed.
  if (content.some((b) => b?.type === "tool_result")) return null;
  return content.flatMap((b) =>
    b?.type === "text" && typeof b.text === "string" ? [b.text] : [],
  );
}

/** Markdown and whitespace flattened, as the preview shows it in a few lines. */
function plainText(text: string): string {
  const flat = text
    .replace(/^```.*$/gm, "")
    .replace(/^\s*\|?[\s:-]+\|[\s|:-]*$/gm, "")
    .replace(/^\s{0,3}(#{1,6}|>)\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > PREVIEW_TEXT_LENGTH
    ? `${flat.slice(0, PREVIEW_TEXT_LENGTH - 1)}…`
    : flat;
}

/** What the user typed, or null for anything Claude Code wrote on their behalf. */
function promptText(msg: TranscriptMessage): string | null {
  if (msg.type !== "user" || msg.isMeta || msg.isCompactSummary) return null;
  const blocks = textBlocks(msg.message?.content);
  if (!blocks) return null;
  const text = blocks
    .join("\n")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .trim();
  const command = /<command-name>([^<]*)<\/command-name>/.exec(text);
  if (command) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1];
    return plainText(`${command[1]} ${args ?? ""}`);
  }
  const shell = /^<bash-input>([\s\S]*?)<\/bash-input>/.exec(text);
  if (shell) return plainText(`! ${shell[1]}`);
  // Task notifications, command output and the like.
  if (!text || text.startsWith("<") || text.startsWith("[Request interrupted"))
    return null;
  return plainText(text);
}

function replyText(msg: TranscriptMessage): string | null {
  if (msg.type !== "assistant") return null;
  const blocks = textBlocks(msg.message?.content);
  const text = blocks?.join("\n").trim();
  if (!text || text === "No response requested." || text === "(no content)")
    return null;
  return plainText(text);
}

/** The exchanges in a stretch of transcript, oldest first. */
function exchangesIn(text: string, fromStart: boolean): ClaudeExchange[] {
  const lines = text.split("\n");
  // A read that starts mid-file starts mid-line.
  if (!fromStart) lines.shift();
  const exchanges: ClaudeExchange[] = [];
  for (const line of lines) {
    if (!/"type":"(user|assistant)"/.test(line)) continue;
    let msg: TranscriptMessage;
    try {
      msg = JSON.parse(line) as TranscriptMessage;
    } catch {
      continue;
    }
    if (msg.isSidechain) continue;
    const at = Date.parse(msg.timestamp ?? "") || 0;
    const prompt = promptText(msg);
    if (prompt) {
      exchanges.push({ prompt, reply: null, at });
      continue;
    }
    const reply = replyText(msg);
    if (!reply) continue;
    const current = exchanges.at(-1);
    if (current) current.reply = reply;
    else exchanges.push({ prompt: null, reply, at });
  }
  return exchanges;
}

/**
 * The opening prompt and last few exchanges of a past conversation, read from
 * the end of its transcript back only as far as they reach.
 */
export function transcriptPreview(
  cwd: string,
  sessionId: string,
): ClaudeConversationPreview | null {
  const file = findTranscript(cwd, sessionId);
  if (!file) return null;
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    let start = size;
    let exchanges: ClaudeExchange[] = [];
    for (
      let length = PREVIEW_CHUNK_BYTES;
      start > 0;
      length = Math.min(length * 2, PREVIEW_MAX_BYTES)
    ) {
      start = Math.max(0, size - length);
      exchanges = exchangesIn(readSlice(fd, start, size - start), start === 0);
      const prompts = exchanges.filter((e) => e.prompt).length;
      if (prompts >= PREVIEW_EXCHANGES || length >= PREVIEW_MAX_BYTES) break;
    }
    const shown = exchanges.slice(-PREVIEW_EXCHANGES);
    const firstShown = start === 0 && exchanges.length === shown.length;
    let opening: string | null = null;
    if (!firstShown) {
      const prompts = exchangesIn(
        readSlice(fd, 0, Math.min(size, TITLE_SCAN_BYTES)),
        true,
      ).flatMap((e) => (e.prompt ? [e.prompt] : []));
      // A slash command like /model says little about what was being done.
      opening = prompts.find((p) => !p.startsWith("/")) ?? prompts[0] ?? null;
    }
    return { opening, exchanges: shown };
  } finally {
    fs.closeSync(fd);
  }
}
