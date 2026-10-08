import fs from "node:fs";
import path from "node:path";

// Claude Code token usage and plan limits, collected by the desktop app.
// No Electron imports: the scanner runs in a worker thread and in tests.

export const AGENT_ID = "claude-code";

export interface TokenCounts {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

export interface DailyUsage {
  device: string;
  agent: string;
  date: string;
  models: ({ model: string } & TokenCounts)[];
}

export interface RateLimit {
  window_label: string;
  utilization_pct: number;
  resets_at: string | null;
}

/** A local calendar day, YYYY-MM-DD. */
export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayOf(raw: unknown): string {
  const parsed = typeof raw === "string" ? new Date(raw) : null;
  return localDay(
    parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(),
  );
}

function int(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

const NEWLINE = 0x0a;

/**
 * Sums Claude Code's per-message token usage per (local day, model) from the
 * transcripts under `projectsDir`.
 *
 * Transcripts are append-only and can run to gigabytes, so each file is read
 * from where the last scan stopped. Messages are counted once by id: resumed
 * conversations repeat earlier messages in their new transcript.
 */
export class TranscriptScanner {
  private readonly offsets = new Map<string, number>();
  private readonly seen = new Set<string>();
  private readonly totals = new Map<string, TokenCounts>();

  constructor(private readonly projectsDir: string) {}

  async scan(cutoffDay: string): Promise<Map<string, TokenCounts>> {
    const cutoffMs = new Date(`${cutoffDay}T00:00:00`).getTime();
    for (const file of await this.transcripts()) {
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(file);
      } catch {
        continue;
      }
      const known = this.offsets.get(file);
      // Untouched since before the cutoff: nothing in it can count.
      if (known === undefined && stat.mtimeMs < cutoffMs) continue;
      // Rewritten rather than appended to: read it again (ids dedupe).
      const from = known !== undefined && known <= stat.size ? known : 0;
      if (from === stat.size) continue;
      try {
        this.offsets.set(
          file,
          await this.readFrom(file, from, stat.size, cutoffDay),
        );
      } catch {
        // Unreadable right now; tried again next scan.
      }
    }
    for (const key of this.totals.keys())
      if (key.split("\t")[0] < cutoffDay) this.totals.delete(key);
    return this.totals;
  }

  private async transcripts(): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(this.projectsDir, {
        recursive: true,
        withFileTypes: true,
      });
      return entries
        .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
        .map((e) => path.join(e.parentPath, e.name));
    } catch {
      return [];
    }
  }

  /** Reads whole lines from `start`; returns the offset after the last one. */
  private async readFrom(
    file: string,
    start: number,
    end: number,
    cutoffDay: string,
  ): Promise<number> {
    let offset = start;
    let pending: Buffer = Buffer.alloc(0);
    const stream = fs.createReadStream(file, { start, end: end - 1 });
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      const buffer = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      const last = buffer.lastIndexOf(NEWLINE);
      if (last === -1) {
        pending = buffer;
        continue;
      }
      let lineStart = 0;
      while (lineStart <= last) {
        const lineEnd = buffer.indexOf(NEWLINE, lineStart);
        this.countLine(buffer.toString("utf8", lineStart, lineEnd), cutoffDay);
        lineStart = lineEnd + 1;
      }
      offset += last + 1;
      pending = buffer.subarray(last + 1);
    }
    return offset;
  }

  private countLine(line: string, cutoffDay: string): void {
    if (!line.includes('"usage":')) return;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      return;
    }
    const message =
      entry.message && typeof entry.message === "object"
        ? (entry.message as Record<string, unknown>)
        : {};
    if (entry.type !== "assistant" && message.role !== "assistant") return;
    const usage = (message.usage ?? entry.usage) as
      | Record<string, unknown>
      | undefined;
    if (!usage || typeof usage !== "object") return;

    const id = String(message.id ?? entry.uuid ?? "");
    if (id) {
      if (this.seen.has(id)) return;
      this.seen.add(id);
    }
    const day = dayOf(entry.timestamp ?? message.timestamp);
    if (day < cutoffDay) return;

    const key = `${day}\t${String(message.model ?? "claude")}`;
    const counts = this.totals.get(key) ?? {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
    };
    counts.input_tokens += int(usage.input_tokens);
    counts.output_tokens += int(usage.output_tokens);
    counts.cache_read_tokens += int(usage.cache_read_input_tokens);
    counts.cache_creation_tokens += int(usage.cache_creation_input_tokens);
    this.totals.set(key, counts);
  }
}

/** The scanner's totals as the API's sync payload, one entry per day. */
export function dailyPayload(
  totals: Map<string, TokenCounts>,
  device: string,
): DailyUsage[] {
  const byDay = new Map<string, DailyUsage["models"]>();
  for (const [key, counts] of totals) {
    // Synthetic messages ("<synthetic>") carry a usage block with no tokens.
    if (!Object.values(counts).some(Boolean)) continue;
    const [day, model] = key.split("\t");
    const models = byDay.get(day) ?? [];
    models.push({ model, ...counts });
    byDay.set(day, models);
  }
  return [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, models]) => ({ device, agent: AGENT_ID, date, models }));
}

function percentOf(value: unknown, percentScale: boolean): number | null {
  const n = Number(
    String(value ?? "")
      .trim()
      .replace("%", ""),
  );
  if (value === null || value === undefined || !Number.isFinite(n) || n < 0)
    return null;
  // Seen as both 37.0 and 0.37 across payload versions; above 1 is a percent.
  return Math.min(100, percentScale || n > 1 ? n : n * 100);
}

const looksLikePercent = (value: unknown) =>
  Number(
    String(value ?? "")
      .trim()
      .replace("%", ""),
  ) >= 1;

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;

/** Plan limits from Anthropic's OAuth usage endpoint, as sync rows. */
export function parseRateLimits(payload: unknown): RateLimit[] {
  const body = asObject(payload) ?? {};
  const session = asObject(body.five_hour);
  const weekly =
    asObject(body.seven_day_oauth_apps) ?? asObject(body.seven_day);
  const scoped = Array.isArray(body.limits)
    ? body.limits.map(asObject).filter((e): e is Json => e !== null)
    : [];
  const percentScale = [
    session?.utilization,
    weekly?.utilization,
    ...scoped.map((e) => e.percent),
  ].some(looksLikePercent);

  const limits: RateLimit[] = [];
  const add = (label: string, value: unknown, resetsAt: unknown) => {
    const pct = percentOf(value, percentScale);
    if (pct === null) return;
    limits.push({
      window_label: label.slice(0, 50),
      utilization_pct: pct,
      resets_at: typeof resetsAt === "string" ? resetsAt : null,
    });
  };
  if (session) add("session_5h", session.utilization, session.resets_at);
  if (weekly) add("week", weekly.utilization, weekly.resets_at);
  for (const entry of scoped) {
    const model = asObject(asObject(entry.scope)?.model);
    const name = model?.id ?? model?.display_name;
    if (!name) continue;
    add(
      `${name}_${entry.kind ?? ""}`.replace(/_+$/, ""),
      entry.percent,
      entry.resets_at,
    );
  }
  return limits;
}

export interface ClaudeLogin {
  accessToken: string;
  /** e.g. "default_claude_max_5x"; falls back to the plan name ("max"). */
  tier: string | null;
}

/** The `claudeAiOauth` login from Claude Code's credentials JSON. */
export function parseClaudeLogin(raw: string): ClaudeLogin | null {
  try {
    const login = asObject(asObject(JSON.parse(raw))?.claudeAiOauth);
    if (typeof login?.accessToken !== "string" || !login.accessToken)
      return null;
    const tier = login.rateLimitTier ?? login.subscriptionType;
    return {
      accessToken: login.accessToken,
      tier: typeof tier === "string" && tier ? tier : null,
    };
  } catch {
    return null;
  }
}
