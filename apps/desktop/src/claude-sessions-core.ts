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

export function claudeProjectDir(cwd: string): string {
  return path.join(
    os.homedir(),
    ".claude",
    "projects",
    cwd.replace(/[^A-Za-z0-9]/g, "-"),
  );
}

export function transcriptExists(cwd: string, sessionId: string): boolean {
  return fs.existsSync(path.join(claudeProjectDir(cwd), `${sessionId}.jsonl`));
}

const TITLE_SCAN_BYTES = 256 * 1024;
const MAX_TITLE_LENGTH = 120;

function readSlice(fd: number, start: number, length: number): string {
  const buf = Buffer.alloc(length);
  const read = fs.readSync(fd, buf, 0, length, start);
  return buf.subarray(0, read).toString("utf8");
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

/** The project's past conversations, newest first. */
export function listConversations(
  cwd: string,
  limit: number,
): ClaudeConversation[] {
  const dir = claudeProjectDir(cwd);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const files = names.flatMap((name) => {
    const sessionId = UUID_JSONL_RE.exec(name)?.[1];
    if (!sessionId) return [];
    try {
      const stat = fs.statSync(path.join(dir, name));
      return [
        { sessionId, file: path.join(dir, name), updatedAt: stat.mtimeMs },
      ];
    } catch {
      return [];
    }
  });
  files.sort((a, b) => b.updatedAt - a.updatedAt);
  return files.slice(0, limit).flatMap(({ sessionId, file, updatedAt }) => {
    let title: string | null;
    try {
      title = transcriptTitle(file);
    } catch {
      return [];
    }
    // Transcripts without a single prompt are aborted starts, not conversations.
    return title ? [{ sessionId, title, updatedAt }] : [];
  });
}
