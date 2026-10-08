import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agentStatus,
  appendTail,
  isSessionId,
  listConversations,
  parseAgents,
  parseBackgroundedId,
  parseRemoteUrl,
  pruneEnded,
  reconcile,
  sessionStatus,
  transcriptTitle,
} from "./claude-sessions-core.js";
import type {
  ClaudeAgentEntry,
  StoredClaudeSession,
} from "./claude-sessions-types.js";

function agent(overrides: Partial<ClaudeAgentEntry> = {}): ClaudeAgentEntry {
  return {
    id: "ba084a19",
    pid: 4242,
    cwd: "/repo",
    kind: "background",
    startedAt: 1,
    sessionId: "ba084a19-eef6-423d-9301-441ec9e0eb9f",
    name: "Fix calendar",
    status: "idle",
    state: "done",
    ...overrides,
  };
}

function stored(
  overrides: Partial<StoredClaudeSession> = {},
): StoredClaudeSession {
  return {
    key: "k1",
    bgId: "ba084a19",
    sessionId: "ba084a19-eef6-423d-9301-441ec9e0eb9f",
    name: "Fix calendar",
    cwd: "/repo",
    createdAt: 1,
    ...overrides,
  };
}

describe("CLI output parsing", () => {
  it("reads the id `claude --bg` prints", () => {
    const out =
      "Starting background service…\nbackgrounded · ba084a19 · Fix calendar\n  claude agents             list sessions\n";
    expect(parseBackgroundedId(out)).toBe("ba084a19");
    expect(parseBackgroundedId("Workspace not trusted.")).toBeNull();
  });

  it("finds the latest Remote Control URL through terminal escapes", () => {
    const logs =
      "\x1b[38;2;78;186;101m/rc\x1b[39m is active · Continue at https://claude.ai/code/session_01OLD\x1b[39m\r\n" +
      "reconnected · https://claude.ai/code/session_01YNQtqrorWo2jWXyLqpbwb8\x1b[50;1H";
    expect(parseRemoteUrl(logs)).toBe(
      "https://claude.ai/code/session_01YNQtqrorWo2jWXyLqpbwb8",
    );
    expect(parseRemoteUrl("/rc connecting…")).toBeNull();
  });

  it("parses `claude agents --json`, skipping malformed entries", () => {
    const entries = parseAgents(
      JSON.stringify([
        {
          id: "ba084a19",
          cwd: "/repo",
          kind: "background",
          startedAt: 5,
          sessionId: "s1",
          name: "A",
          state: "done",
        },
        {
          pid: 7,
          cwd: "/x",
          kind: "interactive",
          startedAt: 6,
          sessionId: "s2",
          status: "busy",
        },
        { cwd: "/broken" },
      ]),
    );
    expect(entries).toEqual([
      {
        id: "ba084a19",
        pid: null,
        cwd: "/repo",
        kind: "background",
        startedAt: 5,
        sessionId: "s1",
        name: "A",
        status: null,
        state: "done",
      },
      {
        id: null,
        pid: 7,
        cwd: "/x",
        kind: "interactive",
        startedAt: 6,
        sessionId: "s2",
        name: null,
        status: "busy",
        state: null,
      },
    ]);
    expect(() => parseAgents("{}")).toThrow();
  });

  it.each([
    [undefined, "missing"],
    [agent({ pid: null }), "stopped"],
    [agent({ status: "busy", state: "working" }), "working"],
    [agent({ status: "idle", state: "working" }), "idle"],
    [agent({ state: "blocked" }), "waiting"],
    [agent({ state: "done" }), "idle"],
  ] as const)("maps %o to %s", (entry, status) => {
    expect(agentStatus(entry)).toBe(status);
  });
});

describe("reconcile", () => {
  const none = new Set<string>();

  it("brings back what was running before Bessel started", () => {
    const sessions = [
      stored({ key: "stopped" }),
      stored({ key: "gone", bgId: "deadbeef" }),
      stored({ key: "running", bgId: "c0ffee00" }),
      stored({ key: "ended", bgId: "0ddba11a", endedAt: 2 }),
    ];
    const agents = new Map([
      ["ba084a19", agent({ pid: null })],
      ["c0ffee00", agent({ id: "c0ffee00" })],
    ]);
    expect(
      reconcile(sessions, agents, {
        startup: true,
        pending: none,
        wasRunning: none,
      }),
    ).toEqual([
      { kind: "respawn", key: "stopped" },
      { kind: "resume", key: "gone" },
    ]);
  });

  it("treats a session that stops while Bessel watches as ended", () => {
    const agents = new Map([["ba084a19", agent({ pid: null })]]);
    expect(
      reconcile([stored()], agents, {
        startup: false,
        pending: none,
        wasRunning: new Set(["k1"]),
      }),
    ).toEqual([{ kind: "end", key: "k1" }]);
  });

  it("leaves sessions Bessel is still starting alone", () => {
    expect(
      reconcile([stored()], new Map(), {
        startup: false,
        pending: new Set(["k1"]),
        wasRunning: new Set(["k1"]),
      }),
    ).toEqual([]);
  });
});

it("keeps only recent ended sessions", () => {
  const day = 24 * 60 * 60 * 1000;
  const sessions = [
    stored({ key: "active" }),
    stored({ key: "old", endedAt: 0 }),
    stored({ key: "recent", endedAt: 20 * day }),
    stored({ key: "newest", endedAt: 21 * day }),
  ];
  expect(
    pruneEnded(sessions, 21 * day, { maxAgeMs: 14 * day, maxCount: 1 }).map(
      (s) => s.key,
    ),
  ).toEqual(["active", "newest"]);
});

describe("transcripts", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "bessel-claude-"));
    vi.spyOn(os, "homedir").mockReturnValue(home);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(home, { recursive: true, force: true });
  });

  function writeTranscript(
    cwd: string,
    sessionId: string,
    lines: object[],
    mtime: number,
  ) {
    const dir = path.join(
      home,
      ".claude",
      "projects",
      cwd.replace(/[^A-Za-z0-9]/g, "-"),
    );
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sessionId}.jsonl`);
    fs.writeFileSync(
      file,
      `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`,
    );
    fs.utimesSync(file, mtime, mtime);
    return file;
  }

  it("titles a conversation like Claude's resume picker", () => {
    const file = writeTranscript(
      "/repo",
      "11111111-1111-4111-8111-111111111111",
      [
        { type: "last-prompt", lastPrompt: "fix   the\nbug" },
        { type: "ai-title", aiTitle: "Calendar bug" },
        { type: "custom-title", customTitle: "My title" },
      ],
      1,
    );
    expect(transcriptTitle(file)).toBe("My title");
  });

  it("lists a project's conversations newest first, skipping empty ones", () => {
    writeTranscript(
      "/repo",
      "11111111-1111-4111-8111-111111111111",
      [{ type: "last-prompt", lastPrompt: "older" }],
      100,
    );
    writeTranscript(
      "/repo",
      "22222222-2222-4222-8222-222222222222",
      [{ type: "ai-title", aiTitle: "Newer" }],
      200,
    );
    writeTranscript(
      "/repo",
      "33333333-3333-4333-8333-333333333333",
      [{ type: "mode" }],
      300,
    );

    expect(listConversations("/repo", 10)).toEqual([
      {
        sessionId: "22222222-2222-4222-8222-222222222222",
        title: "Newer",
        updatedAt: 200_000,
      },
      {
        sessionId: "11111111-1111-4111-8111-111111111111",
        title: "older",
        updatedAt: 100_000,
      },
    ]);
    expect(listConversations("/elsewhere", 10)).toEqual([]);
  });
});

describe("isSessionId", () => {
  it("accepts UUIDs only", () => {
    expect(isSessionId("1b4e28ba-2fa1-11d2-883f-0016d3cca427")).toBe(true);
    expect(isSessionId("../../etc/passwd")).toBe(false);
    expect(isSessionId("--dangerous-flag")).toBe(false);
    expect(isSessionId("1b4e28ba-2fa1-11d2-883f-0016d3cca427/x")).toBe(false);
    expect(isSessionId(undefined)).toBe(false);
  });
});

describe("appendTail", () => {
  it("keeps the most recent output within the cap", () => {
    expect(appendTail("abc", "def", 10)).toBe("abcdef");
    expect(appendTail("abc", "def", 4)).toBe("cdef");
  });
});

describe("sessionStatus", () => {
  const checkedNow = { checked: true, pending: false };

  it("is unknown, shown as starting, until Claude's sessions have been checked", () => {
    expect(
      sessionStatus(stored(), undefined, { checked: false, pending: false }),
    ).toBe("starting");
    expect(
      sessionStatus(stored(), agent(), { checked: false, pending: false }),
    ).toBe("starting");
  });

  it("follows Claude once checked, and waits on a session being woken", () => {
    expect(sessionStatus(stored(), agent(), checkedNow)).toBe("idle");
    expect(sessionStatus(stored(), agent({ pid: null }), checkedNow)).toBe(
      "stopped",
    );
    expect(sessionStatus(stored(), undefined, checkedNow)).toBe("missing");
    expect(
      sessionStatus(stored(), agent({ pid: null }), {
        checked: true,
        pending: true,
      }),
    ).toBe("starting");
  });

  it("keeps an ended session ended", () => {
    expect(
      sessionStatus(stored({ endedAt: 5 }), agent(), {
        checked: false,
        pending: true,
      }),
    ).toBe("ended");
  });
});
