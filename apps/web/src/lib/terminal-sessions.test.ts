// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachTerminal,
  killAllTerminalSessions,
  pruneTerminalSessions,
  terminalSessionId,
} from "./terminal-sessions";

type Listener<T> = { id: string; cb: (value: T) => void };

function fakeTerminalApi() {
  const dataListeners: Listener<string>[] = [];
  const exitListeners: Listener<number>[] = [];
  const api = {
    spawn: vi.fn(async () => {}),
    sendInput: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((id: string, cb: (data: string) => void) => {
      const entry = { id, cb };
      dataListeners.push(entry);
      return () => dataListeners.splice(dataListeners.indexOf(entry), 1);
    }),
    onExit: vi.fn((id: string, cb: (code: number) => void) => {
      const entry = { id, cb };
      exitListeners.push(entry);
      return () => exitListeners.splice(exitListeners.indexOf(entry), 1);
    }),
  };
  const emit = (id: string, data: string) => {
    for (const l of dataListeners) if (l.id === id) l.cb(data);
  };
  const exit = (id: string, code: number) => {
    for (const l of exitListeners) if (l.id === id) l.cb(code);
  };
  return { api, emit, exit, dataListeners };
}

const SHELL = { command: "default-shell", args: [] };
const SIZE = { cols: 80, rows: 24 };
let fake: ReturnType<typeof fakeTerminalApi>;

beforeEach(() => {
  fake = fakeTerminalApi();
  (window as { electron?: unknown }).electron = { terminal: fake.api };
});

afterEach(() => {
  killAllTerminalSessions();
  delete (window as { electron?: unknown }).electron;
});

function view() {
  return { onData: vi.fn(), onExit: vi.fn() };
}

describe("terminalSessionId", () => {
  it("is stable per window and config, and differs when the config does", () => {
    expect(terminalSessionId("w1", SHELL)).toBe(terminalSessionId("w1", SHELL));
    expect(terminalSessionId("w1", SHELL)).not.toBe(
      terminalSessionId("w2", SHELL),
    );
    expect(
      terminalSessionId("w1", { command: "claude", args: ["attach", "a"] }),
    ).not.toBe(
      terminalSessionId("w1", { command: "claude", args: ["attach", "b"] }),
    );
  });

  it("can be pinned by an explicit key when the args vary between mounts", () => {
    expect(terminalSessionId("w1", "claude-session-1")).toBe(
      terminalSessionId("w1", "claude-session-1"),
    );
    expect(terminalSessionId("w1", "claude-session-1")).not.toBe(
      terminalSessionId("w1", "claude-session-2"),
    );
  });
});

describe("attach / detach", () => {
  it("reattaches to the running PTY and replays what it missed", () => {
    const id = terminalSessionId("w1", SHELL);
    const first = view();
    const a = attachTerminal(id, "w1", SIZE, SHELL, first);
    expect(a.spawned).toBe(true);
    fake.emit(id, "$ ");

    a.detach();
    fake.emit(id, "ls\r\n");

    const second = view();
    const b = attachTerminal(id, "w1", SIZE, SHELL, second);
    expect(b.spawned).toBe(false);
    expect(b.replay).toBe("$ ls\r\n");
    expect(b.started()).toBe(true);
    expect(fake.api.spawn).toHaveBeenCalledTimes(1);
    expect(fake.api.kill).not.toHaveBeenCalled();
    expect(first.onData).toHaveBeenCalledTimes(1);

    fake.emit(id, "more");
    expect(second.onData).toHaveBeenCalledWith("more");
    expect(first.onData).toHaveBeenCalledTimes(1);
  });

  it("surfaces an exit that happened while detached", () => {
    const id = terminalSessionId("w1", SHELL);
    attachTerminal(id, "w1", SIZE, SHELL, view()).detach();
    fake.exit(id, 2);

    expect(attachTerminal(id, "w1", SIZE, SHELL, view()).exitCode).toBe(2);
  });

  it("keeps the replay buffer bounded", () => {
    const id = terminalSessionId("w1", SHELL);
    attachTerminal(id, "w1", SIZE, SHELL, view()).detach();
    const chunk = "x".repeat(64 * 1024);
    for (let i = 0; i < 20; i++) fake.emit(id, chunk);

    const { replay } = attachTerminal(id, "w1", SIZE, SHELL, view());
    expect(replay.length).toBeLessThanOrEqual(512 * 1024);
    expect(replay.length).toBeGreaterThan(0);
  });

  it("replaces a window's previous PTY when it attaches with a new config", () => {
    const oldConfig = { command: "claude", args: ["attach", "a"] };
    const newConfig = { command: "claude", args: ["attach", "b"] };
    const oldId = terminalSessionId("w1", oldConfig);
    attachTerminal(oldId, "w1", SIZE, oldConfig, view()).detach();

    attachTerminal(
      terminalSessionId("w1", newConfig),
      "w1",
      SIZE,
      newConfig,
      view(),
    );

    expect(fake.api.kill).toHaveBeenCalledWith(oldId);
    expect(fake.api.spawn).toHaveBeenCalledTimes(2);
  });
});

describe("pruneTerminalSessions", () => {
  it("kills only the PTYs whose windows are gone, and stops listening", () => {
    const keep = terminalSessionId("w1", SHELL);
    const gone = terminalSessionId("w2", SHELL);
    attachTerminal(keep, "w1", SIZE, SHELL, view());
    attachTerminal(gone, "w2", SIZE, SHELL, view());

    pruneTerminalSessions(new Set(["w1"]));

    expect(fake.api.kill).toHaveBeenCalledTimes(1);
    expect(fake.api.kill).toHaveBeenCalledWith(gone);
    expect(fake.dataListeners.map((l) => l.id)).toEqual([keep]);
  });
});
