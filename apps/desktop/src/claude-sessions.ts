import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, Notification } from "electron";
import {
  agentStatus,
  appendTail,
  isRunning,
  isSessionId,
  isUntrustedWorkspaceError,
  listConversations,
  parseAgents,
  parseBackgroundedId,
  parseRemoteUrl,
  pruneEnded,
  reconcile,
  sessionStatus,
  transcriptExists,
} from "./claude-sessions-core.js";
import {
  type ClaudeAgentEntry,
  type ClaudeConversation,
  type ClaudeSessionStatus,
  type ClaudeSessionsSnapshot,
  type ClaudeSessionView,
  type CreateClaudeSessionInput,
  type ExternalClaudeSession,
  type StoredClaudeSession,
  UNTRUSTED_WORKSPACE_ERROR,
} from "./claude-sessions-types.js";
import { broadcast, ipcHandle } from "./ipc.js";

const POLL_MS = 2_000;
// Nothing of ours is live: only external sessions could change, and those
// don't need a two-second refresh.
const IDLE_POLL_MS = 15_000;
const CLI_TIMEOUT_MS = 30_000;
// A session Bessel just started or woke may take a moment to report as
// running; until then it's "starting", not ended.
const PENDING_GRACE_MS = 30_000;
const REMOTE_URL_RETRY_MS = 15_000;
const AGENT_LOOKUP_ATTEMPTS = 10;
const AGENT_LOOKUP_INTERVAL_MS = 300;
const ENDED_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const ENDED_MAX_COUNT = 30;
const MAX_NAME_LENGTH = 100;
const CONVERSATION_LIMIT = 25;
// Only the tail matters (the latest Remote Control URL), and a long-running
// session's log can be large.
const LOGS_TAIL_CHARS = 256 * 1024;

interface StoreFile {
  sessions: StoredClaudeSession[];
  quitPromptDismissed?: boolean;
}

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface ClaudeSessionDeps {
  log: (line: string) => void;
  /** Environment for `claude` child processes (PATH fix-ups etc.). */
  childEnv: () => Promise<NodeJS.ProcessEnv>;
  /** Brings the app window to the front, creating it if needed. */
  showWindow: () => void;
}

function nameFor(input: string): string {
  // A leading dash would read as a flag on the claude command line.
  const trimmed = input
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+/, "")
    .trim();
  return (trimmed || "Claude").slice(0, MAX_NAME_LENGTH);
}

function assertDirectory(cwd: unknown): asserts cwd is string {
  if (typeof cwd !== "string" || !path.isAbsolute(cwd))
    throw new Error("Session directory must be an absolute path");
  if (!fs.statSync(cwd, { throwIfNoEntry: false })?.isDirectory())
    throw new Error(`${cwd} is not a directory`);
}

class ClaudeSessionManager {
  private store: StoreFile;
  private agents: ClaudeAgentEntry[] = [];
  private available = true;
  private startupReconciled = false;
  // Whether `claude agents` has been asked at all since launch; before that
  // every session's state is unknown.
  private checked = false;
  private readonly pending = new Map<string, number>();
  private wasRunning = new Set<string>();
  private readonly lastStatus = new Map<string, ClaudeSessionStatus>();
  private readonly remoteUrlCheckedAt = new Map<string, number>();
  private lastSnapshot = "";
  private readonly reservedNames = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling: Promise<void> | null = null;
  private stopped = false;
  private readonly reviving = new Map<string, Promise<void>>();

  constructor(
    private readonly storePath: string,
    private readonly deps: ClaudeSessionDeps,
  ) {
    this.store = this.load();
  }

  start(): void {
    void this.refresh();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  get quitPromptDismissed(): boolean {
    return this.store.quitPromptDismissed === true;
  }

  dismissQuitPrompt(): void {
    this.store.quitPromptDismissed = true;
    this.save();
  }

  runningCount(): number {
    return this.views().filter(
      (v) => isRunning(v.status) || v.status === "starting",
    ).length;
  }

  snapshot(): ClaudeSessionsSnapshot {
    return {
      sessions: this.views(),
      external: this.external(),
      available: this.available,
    };
  }

  async create(input: CreateClaudeSessionInput): Promise<ClaudeSessionView> {
    const cwd = input.cwd || app.getPath("home");
    assertDirectory(cwd);
    const resumeId = input.resumeSessionId;
    if (resumeId && !isSessionId(resumeId))
      throw new Error("Invalid Claude session id");
    if (resumeId) {
      const known = this.store.sessions.find(
        (s) =>
          s.sessionId === resumeId || s.previousSessionIds?.includes(resumeId),
      );
      if (known) return this.resume(known.key);
    }
    const resume =
      resumeId && transcriptExists(cwd, resumeId) ? resumeId : undefined;
    // Held until the session is stored: windows opened together all create
    // at once, and must not all pick the same free name.
    const name = this.uniqueName(nameFor(input.name));
    this.reservedNames.add(name);
    let started: { bgId: string; sessionId: string };
    try {
      started = await this.startBackground(cwd, name, resume);
    } finally {
      this.reservedNames.delete(name);
    }
    const { bgId, sessionId } = started;
    const session: StoredClaudeSession = {
      key: crypto.randomUUID(),
      bgId,
      sessionId,
      name,
      cwd,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(resume ? { previousSessionIds: [resume] } : {}),
      createdAt: Date.now(),
    };
    this.store.sessions.push(session);
    this.markPending(session.key);
    this.save();
    await this.refresh();
    return this.view(session);
  }

  /** Brings a stopped or ended session back; a no-op for a running one. */
  async resume(key: string): Promise<ClaudeSessionView> {
    const session = this.require(key);
    await this.revive(session);
    await this.refresh();
    return this.view(session);
  }

  // Startup reconcile, a poll and the user's "Resume" can all ask for the
  // same session at once; they share one attempt instead of each spawning a
  // background session.
  private revive(session: StoredClaudeSession): Promise<void> {
    const inFlight = this.reviving.get(session.key);
    if (inFlight) return inFlight;
    const status = agentStatus(this.agentFor(session));
    if (
      session.endedAt === undefined &&
      (isRunning(status) || this.pending.has(session.key))
    )
      return Promise.resolve();

    const wasPending = this.pending.has(session.key);
    this.markPending(session.key);
    const attempt = this.reviveNow(session, status)
      .catch((err: unknown) => {
        if (!wasPending) this.pending.delete(session.key);
        throw err;
      })
      .finally(() => this.reviving.delete(session.key));
    this.reviving.set(session.key, attempt);
    return attempt;
  }

  private async reviveNow(
    session: StoredClaudeSession,
    status: ClaudeSessionStatus,
  ): Promise<void> {
    // Claude may have dropped a stopped session since the last poll.
    const respawned =
      status === "stopped" &&
      (await this.cli(["respawn", session.bgId]).then(
        () => true,
        () => false,
      ));
    if (!respawned && !isRunning(status)) {
      const resume = transcriptExists(session.cwd, session.sessionId)
        ? session.sessionId
        : undefined;
      const started = await this.startBackground(
        session.cwd,
        session.name,
        resume,
      );
      if (session.sessionId)
        session.previousSessionIds = [
          session.sessionId,
          ...(session.previousSessionIds ?? []),
        ];
      session.bgId = started.bgId;
      session.sessionId = started.sessionId;
      delete session.remoteUrl;
    }
    delete session.endedAt;
    this.markPending(session.key);
    this.save();
  }

  async end(key: string): Promise<void> {
    const session = this.require(key);
    // Tolerant: the session may stop on its own (or a poll may clean it up)
    // between these steps.
    if (agentStatus(this.agentFor(session)) !== "missing") {
      await this.cli(["stop", session.bgId], undefined, { allowFailure: true });
      await this.cli(["rm", session.bgId], undefined, { allowFailure: true });
      this.forgetAgent(session.bgId);
    }
    this.markEnded(session);
    await this.refresh();
  }

  async endAll(): Promise<void> {
    for (const s of this.store.sessions.filter((s) => s.endedAt === undefined))
      await this.end(s.key).catch((err: Error) =>
        this.deps.log(`claude session end failed key=${s.key}: ${err.message}`),
      );
  }

  /**
   * Renames the session in Bessel. Claude keeps the name it was started with
   * (there's no CLI to change it) and takes the new one on its next restart.
   */
  rename(key: string, name: string): ClaudeSessionView {
    const session = this.require(key);
    const base = nameFor(name);
    if (base !== session.name) {
      session.name = this.uniqueName(base, session.key);
      this.save();
      this.publish();
    }
    return this.view(session);
  }

  remove(key: string): void {
    const session = this.require(key);
    if (session.endedAt === undefined)
      throw new Error("End the session before removing it");
    this.store.sessions = this.store.sessions.filter((s) => s.key !== key);
    this.save();
    this.publish();
  }

  /** Takes over a background session started outside Bessel. */
  async adopt(bgId: string, projectId?: string): Promise<ClaudeSessionView> {
    const existing = this.store.sessions.find((s) => s.bgId === bgId);
    if (existing) return this.resume(existing.key);
    const agent = this.agents.find(
      (a) => a.kind === "background" && a.id === bgId,
    );
    if (!agent) throw new Error("That background session no longer exists");
    const session: StoredClaudeSession = {
      key: crypto.randomUUID(),
      bgId,
      sessionId: agent.sessionId,
      name: nameFor(agent.name ?? bgId),
      cwd: agent.cwd,
      ...(projectId ? { projectId } : {}),
      createdAt: agent.startedAt || Date.now(),
    };
    this.store.sessions.push(session);
    this.save();
    return this.resume(session.key);
  }

  async remoteUrl(key: string): Promise<string | null> {
    const session = this.require(key);
    if (session.remoteUrl) return session.remoteUrl;
    await this.fetchRemoteUrl(session);
    return session.remoteUrl ?? null;
  }

  conversations(cwd: string): ClaudeConversation[] {
    assertDirectory(cwd);
    return listConversations(cwd, CONVERSATION_LIMIT);
  }

  // --- polling ---------------------------------------------------------

  private refresh(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.polling ??= this.poll().finally(() => {
      this.polling = null;
      if (this.stopped) return;
      this.timer = setTimeout(() => void this.refresh(), this.pollInterval());
    });
    return this.polling;
  }

  private pollInterval(): number {
    const live =
      this.pending.size > 0 ||
      this.store.sessions.some((s) => s.endedAt === undefined);
    return live ? POLL_MS : IDLE_POLL_MS;
  }

  private async poll(): Promise<void> {
    try {
      const result = await this.cli(["agents", "--json", "--all"]);
      this.agents = parseAgents(result.stdout);
      this.available = true;
    } catch (err) {
      if (this.available)
        this.deps.log(`claude agents failed: ${(err as Error).message}`);
      this.available = false;
      this.checked = true;
      this.publish();
      return;
    }

    const now = Date.now();
    for (const [key, deadline] of this.pending) {
      const session = this.store.sessions.find((s) => s.key === key);
      if (
        !session ||
        now > deadline ||
        isRunning(agentStatus(this.agentFor(session)))
      )
        this.pending.delete(key);
    }

    const byId = this.backgroundAgentsById();
    const actions = reconcile(this.store.sessions, byId, {
      startup: !this.startupReconciled,
      pending: new Set(this.pending.keys()),
      wasRunning: this.wasRunning,
    });
    this.startupReconciled = true;
    for (const action of actions) {
      const session = this.store.sessions.find((s) => s.key === action.key);
      if (!session) continue;
      if (action.kind === "end") {
        // Ended from the session itself (/exit) or elsewhere; drop Claude's
        // stopped entry so `claude agents` doesn't fill up with them.
        if (agentStatus(byId.get(session.bgId)) === "stopped")
          await this.cli(["rm", session.bgId]).then(
            () => this.forgetAgent(session.bgId),
            () => undefined,
          );
        this.markEnded(session);
        continue;
      }
      this.deps.log(
        `claude session ${action.kind} key=${session.key} bg=${session.bgId}`,
      );
      // Not resume(): that waits for a refresh, i.e. for this very poll.
      await this.revive(session).catch((err: Error) =>
        this.deps.log(
          `claude session ${action.kind} failed key=${session.key}: ${err.message}`,
        ),
      );
    }

    // Only now: during the startup revives above, sessions not reached yet
    // would otherwise read as stopped for a moment.
    this.checked = true;

    let changed = false;
    for (const session of this.store.sessions) {
      const agent = byId.get(session.bgId);
      if (agent && agent.sessionId !== session.sessionId) {
        session.sessionId = agent.sessionId;
        changed = true;
      }
    }
    if (changed) this.save();

    this.wasRunning = new Set(
      this.store.sessions
        .filter(
          (s) =>
            s.endedAt === undefined && isRunning(agentStatus(byId.get(s.bgId))),
        )
        .map((s) => s.key),
    );
    this.notifyTransitions();
    await this.fillRemoteUrl(now);
    this.publish();
  }

  private notifyTransitions(): void {
    for (const view of this.views()) {
      const previous = this.lastStatus.get(view.key);
      this.lastStatus.set(view.key, view.status);
      if (
        previous !== "working" ||
        (view.status !== "waiting" && view.status !== "idle")
      )
        continue;
      if (BrowserWindow.getFocusedWindow() || !Notification.isSupported())
        continue;
      const notification = new Notification({
        title: view.name,
        body: view.status === "waiting" ? "Needs your input" : "Finished",
        silent: false,
      });
      notification.on("click", () => {
        this.deps.showWindow();
        broadcast("claudeSessions:open", view.key);
      });
      notification.show();
    }
  }

  /** One `claude logs` per poll at most, for a running session without a link yet. */
  private async fillRemoteUrl(now: number): Promise<void> {
    const session = this.store.sessions.find(
      (s) =>
        s.endedAt === undefined &&
        !s.remoteUrl &&
        isRunning(agentStatus(this.agentFor(s))) &&
        now - (this.remoteUrlCheckedAt.get(s.key) ?? 0) > REMOTE_URL_RETRY_MS,
    );
    if (session) await this.fetchRemoteUrl(session);
  }

  private async fetchRemoteUrl(session: StoredClaudeSession): Promise<void> {
    this.remoteUrlCheckedAt.set(session.key, Date.now());
    try {
      const url = parseRemoteUrl(
        (
          await this.cli(["logs", session.bgId], undefined, {
            tailChars: LOGS_TAIL_CHARS,
          })
        ).stdout,
      );
      if (url && url !== session.remoteUrl) {
        session.remoteUrl = url;
        this.save();
      }
    } catch (err) {
      this.deps.log(
        `claude logs failed bg=${session.bgId}: ${(err as Error).message}`,
      );
    }
  }

  private publish(): void {
    const snapshot = this.snapshot();
    const serialized = JSON.stringify(snapshot);
    if (serialized === this.lastSnapshot) return;
    this.lastSnapshot = serialized;
    broadcast("claudeSessions:changed", snapshot);
  }

  // --- CLI -------------------------------------------------------------

  private async startBackground(
    cwd: string,
    name: string,
    resumeSessionId: string | undefined,
  ): Promise<{ bgId: string; sessionId: string }> {
    // Remote Control is requested explicitly rather than relying on the
    // user's `remoteControlAtStartup` setting: reaching these sessions from
    // claude.ai and the phone is the point of running them in the background.
    const args = [
      "--bg",
      "--name",
      name,
      "--remote-control",
      name,
      "--dangerously-skip-permissions",
      ...(resumeSessionId ? ["--resume", resumeSessionId] : []),
    ];
    const result = await this.cli(args, cwd, { allowFailure: true });
    const output = `${result.stdout}\n${result.stderr}`;
    if (isUntrustedWorkspaceError(output))
      throw new Error(UNTRUSTED_WORKSPACE_ERROR);
    const bgId = parseBackgroundedId(output);
    if (!bgId)
      throw new Error(`Claude didn't start: ${output.trim().slice(0, 300)}`);

    for (let attempt = 0; attempt < AGENT_LOOKUP_ATTEMPTS; attempt++) {
      const agents = parseAgents(
        (await this.cli(["agents", "--json", "--all"])).stdout,
      );
      this.agents = agents;
      const agent = agents.find(
        (a) => a.kind === "background" && a.id === bgId,
      );
      if (agent) return { bgId, sessionId: agent.sessionId };
      await new Promise((resolve) =>
        setTimeout(resolve, AGENT_LOOKUP_INTERVAL_MS),
      );
    }
    // The poll fills the id in once Claude lists the session.
    return { bgId, sessionId: "" };
  }

  private async cli(
    args: string[],
    cwd?: string,
    {
      allowFailure = false,
      tailChars = Number.POSITIVE_INFINITY,
    }: { allowFailure?: boolean; tailChars?: number } = {},
  ): Promise<CliResult> {
    const env = await this.deps.childEnv();
    return new Promise((resolve, reject) => {
      // stdin is closed: some subcommands wait on a TTY otherwise.
      const child = spawn("claude", args, {
        cwd: cwd ?? app.getPath("home"),
        env,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: CLI_TIMEOUT_MS,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on(
        "data",
        (d: Buffer) => (stdout = appendTail(stdout, d.toString(), tailChars)),
      );
      child.stderr.on(
        "data",
        (d: Buffer) => (stderr = appendTail(stderr, d.toString(), tailChars)),
      );
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0 || allowFailure) resolve({ code, stdout, stderr });
        else
          reject(
            new Error(
              `claude ${args[0]} exited ${code}: ${(stderr || stdout).trim().slice(0, 300)}`,
            ),
          );
      });
    });
  }

  // --- state -----------------------------------------------------------

  /** Live sessions get distinct names — it's how they're told apart on the phone. */
  private uniqueName(base: string, exceptKey?: string): string {
    const taken = new Set([
      ...this.reservedNames,
      ...this.store.sessions
        .filter((s) => s.endedAt === undefined && s.key !== exceptKey)
        .map((s) => s.name),
    ]);
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++)
      if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
  }

  private backgroundAgentsById(): Map<string, ClaudeAgentEntry> {
    const byId = new Map<string, ClaudeAgentEntry>();
    for (const a of this.agents)
      if (a.kind === "background" && a.id) byId.set(a.id, a);
    return byId;
  }

  private forgetAgent(bgId: string): void {
    this.agents = this.agents.filter(
      (a) => !(a.kind === "background" && a.id === bgId),
    );
  }

  private agentFor(session: StoredClaudeSession): ClaudeAgentEntry | undefined {
    return this.agents.find(
      (a) => a.kind === "background" && a.id === session.bgId,
    );
  }

  private require(key: unknown): StoredClaudeSession {
    const session = this.store.sessions.find((s) => s.key === key);
    if (!session) throw new Error("Unknown session");
    return session;
  }

  private markPending(key: string): void {
    this.pending.set(key, Date.now() + PENDING_GRACE_MS);
  }

  private markEnded(session: StoredClaudeSession): void {
    session.endedAt = Date.now();
    delete session.remoteUrl;
    this.pending.delete(session.key);
    this.wasRunning.delete(session.key);
    this.store.sessions = pruneEnded(this.store.sessions, Date.now(), {
      maxAgeMs: ENDED_MAX_AGE_MS,
      maxCount: ENDED_MAX_COUNT,
    });
    this.save();
  }

  private status(session: StoredClaudeSession): ClaudeSessionStatus {
    return sessionStatus(session, this.agentFor(session), {
      checked: this.checked,
      pending: this.pending.has(session.key),
    });
  }

  private view(session: StoredClaudeSession): ClaudeSessionView {
    return {
      key: session.key,
      bgId: session.bgId,
      sessionId: session.sessionId,
      name: session.name,
      cwd: session.cwd,
      projectId: session.projectId ?? null,
      createdAt: session.createdAt,
      endedAt: session.endedAt ?? null,
      status: this.status(session),
      remoteUrl: session.remoteUrl ?? null,
      conversationIds: [
        session.sessionId,
        ...(session.previousSessionIds ?? []),
      ].filter(Boolean),
    };
  }

  private views(): ClaudeSessionView[] {
    return this.store.sessions.map((s) => this.view(s));
  }

  private external(): ExternalClaudeSession[] {
    const ownBgIds = new Set(this.store.sessions.map((s) => s.bgId));
    const ownSessionIds = new Set(this.store.sessions.map((s) => s.sessionId));
    return this.agents
      .filter((a) =>
        a.kind === "background"
          ? a.id !== null && !ownBgIds.has(a.id)
          : a.pid !== null && !ownSessionIds.has(a.sessionId),
      )
      .map((a) => ({
        bgId: a.kind === "background" ? a.id : null,
        sessionId: a.sessionId,
        name: a.name,
        cwd: a.cwd,
        kind: a.kind,
        status: agentStatus(a),
        startedAt: a.startedAt,
      }));
  }

  private load(): StoreFile {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(this.storePath, "utf8"),
      ) as Partial<StoreFile>;
      if (Array.isArray(parsed.sessions))
        return { ...parsed, sessions: parsed.sessions };
    } catch {
      // First run, or a corrupt file — start empty.
    }
    return { sessions: [] };
  }

  private save(): void {
    const tmp = `${this.storePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.store, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.storePath);
  }
}

let manager: ClaudeSessionManager | null = null;

function requireManager(): ClaudeSessionManager {
  if (!manager) throw new Error("Claude sessions aren't initialized");
  return manager;
}

export function registerClaudeSessionHandlers(deps: ClaudeSessionDeps): void {
  manager = new ClaudeSessionManager(
    path.join(app.getPath("userData"), "claude-sessions.json"),
    deps,
  );
  manager.start();

  ipcHandle("claudeSessions:snapshot", () => requireManager().snapshot());
  ipcHandle("claudeSessions:create", (_, input: CreateClaudeSessionInput) =>
    requireManager().create({
      cwd: typeof input?.cwd === "string" ? input.cwd : "",
      name: String(input?.name ?? ""),
      projectId:
        typeof input?.projectId === "string" ? input.projectId : undefined,
      resumeSessionId:
        typeof input?.resumeSessionId === "string"
          ? input.resumeSessionId
          : undefined,
    }),
  );
  ipcHandle("claudeSessions:resume", (_, key: string) =>
    requireManager().resume(key),
  );
  ipcHandle("claudeSessions:end", (_, key: string) =>
    requireManager().end(key),
  );
  ipcHandle("claudeSessions:rename", (_, key: string, name: string) =>
    requireManager().rename(key, String(name ?? "")),
  );
  ipcHandle("claudeSessions:remove", (_, key: string) =>
    requireManager().remove(key),
  );
  ipcHandle("claudeSessions:adopt", (_, bgId: string, projectId?: string) =>
    requireManager().adopt(
      String(bgId),
      typeof projectId === "string" ? projectId : undefined,
    ),
  );
  ipcHandle("claudeSessions:remoteUrl", (_, key: string) =>
    requireManager().remoteUrl(key),
  );
  ipcHandle("claudeSessions:conversations", (_, cwd: string) =>
    requireManager().conversations(cwd),
  );
}

export function stopClaudeSessions(): void {
  manager?.stop();
}

/**
 * Closing the window no longer ends Claude sessions, which is easy to miss
 * the first time — say so once, with a way to end them instead.
 */
export function confirmCloseWithClaudeSessions(win: BrowserWindow): void {
  let confirmed = false;
  win.on("close", (event) => {
    const current = manager;
    if (confirmed || !current || current.quitPromptDismissed) return;
    const running = current.runningCount();
    if (running === 0) return;
    event.preventDefault();
    void dialog
      .showMessageBox(win, {
        type: "info",
        message:
          running === 1
            ? "1 Claude session will keep running"
            : `${running} Claude sessions will keep running`,
        detail:
          "You can keep using them from claude.ai and the Claude app. They'll be here when you open Bessel again.",
        buttons: ["Keep running", "End sessions", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        checkboxLabel: "Don't ask again",
      })
      .then(async ({ response, checkboxChecked }) => {
        if (response === 2) return;
        if (response === 0 && checkboxChecked) current.dismissQuitPrompt();
        if (response === 1) await current.endAll();
        confirmed = true;
        win.close();
      });
  });
}
