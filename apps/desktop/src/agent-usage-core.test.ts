import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dailyPayload,
  localDay,
  parseClaudeLogin,
  parseRateLimits,
  TranscriptScanner,
} from "./agent-usage-core";

const TODAY = localDay(new Date());

function assistant(
  id: string,
  model: string,
  tokens: number,
  timestamp = new Date().toISOString(),
) {
  return `${JSON.stringify({
    type: "assistant",
    timestamp,
    message: {
      id,
      role: "assistant",
      model,
      usage: {
        input_tokens: tokens,
        output_tokens: 1,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 0,
      },
    },
  })}\n`;
}

describe("TranscriptScanner", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "transcripts-"));
    fs.mkdirSync(path.join(dir, "-home-me-app"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = (name: string) => path.join(dir, "-home-me-app", name);

  it("sums tokens per day and model, once per message", async () => {
    fs.writeFileSync(
      file("a.jsonl"),
      assistant("m1", "claude-opus-5-5", 100) +
        `${JSON.stringify({ type: "user", message: { role: "user", content: "hi" } })}\n` +
        assistant("m2", "claude-opus-5-5", 50),
    );
    // A resumed conversation repeats m1 in its own transcript.
    fs.writeFileSync(file("b.jsonl"), assistant("m1", "claude-opus-5-5", 100));

    const totals = await new TranscriptScanner(dir).scan(TODAY);
    expect(totals.get(`${TODAY}\tclaude-opus-5-5`)).toEqual({
      input_tokens: 150,
      output_tokens: 2,
      cache_read_tokens: 20,
      cache_creation_tokens: 0,
    });
  });

  it("reads only what was appended, and waits for a line to finish", async () => {
    const scanner = new TranscriptScanner(dir);
    fs.writeFileSync(file("a.jsonl"), assistant("m1", "claude-opus-5-5", 100));
    await scanner.scan(TODAY);

    const next = assistant("m2", "claude-opus-5-5", 7);
    fs.appendFileSync(file("a.jsonl"), next.slice(0, 40));
    let totals = await scanner.scan(TODAY);
    expect(totals.get(`${TODAY}\tclaude-opus-5-5`)?.input_tokens).toBe(100);

    fs.appendFileSync(file("a.jsonl"), next.slice(40));
    totals = await scanner.scan(TODAY);
    expect(totals.get(`${TODAY}\tclaude-opus-5-5`)?.input_tokens).toBe(107);
  });

  it("leaves out days before the cutoff", async () => {
    fs.writeFileSync(
      file("a.jsonl"),
      assistant("old", "claude-opus-5-5", 999, "2020-01-01T12:00:00Z") +
        assistant("new", "claude-opus-5-5", 5),
    );
    const totals = await new TranscriptScanner(dir).scan(TODAY);
    expect([...totals.keys()]).toEqual([`${TODAY}\tclaude-opus-5-5`]);
  });

  it("is empty without a projects folder", async () => {
    const totals = await new TranscriptScanner(path.join(dir, "missing")).scan(
      TODAY,
    );
    expect(totals.size).toBe(0);
  });
});

describe("dailyPayload", () => {
  it("groups by day and drops token-less models", () => {
    const zero = {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
    };
    const some = { ...zero, input_tokens: 3 };
    const payload = dailyPayload(
      new Map([
        ["2026-10-02\tclaude-opus-5-5", some],
        ["2026-10-01\tclaude-haiku-4-5", some],
        ["2026-10-02\t<synthetic>", zero],
      ]),
      "laptop",
    );
    expect(payload).toEqual([
      {
        device: "laptop",
        agent: "claude-code",
        date: "2026-10-01",
        models: [{ model: "claude-haiku-4-5", ...some }],
      },
      {
        device: "laptop",
        agent: "claude-code",
        date: "2026-10-02",
        models: [{ model: "claude-opus-5-5", ...some }],
      },
    ]);
  });
});

describe("parseRateLimits", () => {
  it("reads the session, the week and per-model weeks", () => {
    const payload = {
      five_hour: {
        utilization: 7.0,
        resets_at: "2026-10-04T02:50:00.090003+00:00",
      },
      seven_day: {
        utilization: 56.0,
        resets_at: "2026-10-05T03:00:00.090022+00:00",
      },
      seven_day_oauth_apps: null,
      limits: [
        {
          kind: "session",
          percent: 7,
          resets_at: "2026-10-04T02:50:00+00:00",
          scope: null,
        },
        {
          kind: "weekly_scoped",
          percent: 0,
          resets_at: "2026-10-05T03:00:00+00:00",
          scope: { model: { id: null, display_name: "Fable" }, surface: null },
        },
      ],
    };
    expect(parseRateLimits(payload)).toEqual([
      {
        window_label: "session_5h",
        utilization_pct: 7,
        resets_at: "2026-10-04T02:50:00.090003+00:00",
      },
      {
        window_label: "week",
        utilization_pct: 56,
        resets_at: "2026-10-05T03:00:00.090022+00:00",
      },
      {
        window_label: "Fable_weekly_scoped",
        utilization_pct: 0,
        resets_at: "2026-10-05T03:00:00+00:00",
      },
    ]);
  });

  it("scales fractions to percentages", () => {
    expect(
      parseRateLimits({ five_hour: { utilization: 0.37, resets_at: null } }),
    ).toEqual([
      { window_label: "session_5h", utilization_pct: 37, resets_at: null },
    ]);
  });

  it("is empty for anything unexpected", () => {
    expect(parseRateLimits(null)).toEqual([]);
    expect(parseRateLimits({ five_hour: "nope" })).toEqual([]);
  });
});

describe("parseClaudeLogin", () => {
  it("takes the token and the most specific tier", () => {
    const raw = JSON.stringify({
      claudeAiOauth: {
        accessToken: "tok",
        subscriptionType: "max",
        rateLimitTier: "default_claude_max_5x",
      },
    });
    expect(parseClaudeLogin(raw)).toEqual({
      accessToken: "tok",
      tier: "default_claude_max_5x",
    });
  });

  it("is null without a login", () => {
    expect(parseClaudeLogin("{}")).toBeNull();
    expect(parseClaudeLogin("not json")).toBeNull();
  });
});
