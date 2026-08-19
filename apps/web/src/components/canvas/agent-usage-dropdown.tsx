import {
  getAgentUsageDailyV1AgentUsageDailyGetOptions,
  getAgentUsageStatusV1AgentUsageStatusGetOptions,
} from "@bessel/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  formatDistanceToNowStrict,
  intervalToDuration,
  isPast,
  subDays,
} from "date-fns";
import { Gauge } from "lucide-react";
import { useState } from "react";
import { client } from "@/lib/client";

const HISTORY_DAYS = 30;
const STALE_MS = 30 * 60 * 1000;
const WARN_THRESHOLD_PCT = 85;

// Dark-mode categorical steps from the dataviz skill's validated default
// palette (slots 1-4: blue, orange, aqua, yellow) — fixed order, never cycled.
const MODEL_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500"];

// Status palette from the same reference — mode-invariant.
function severityColor(pct: number): string {
  if (pct >= 95) return "#d03b3b"; // critical
  if (pct >= 85) return "#ec835a"; // serious
  if (pct >= 60) return "#fab219"; // warning
  return "#0ca30c"; // good
}

function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// formatDistanceToNowStrict rounds to a single largest unit — a reset 20
// hours out reads as "1 day", which is misleading for a countdown. Always
// pair the largest unit with the next one down instead.
function resetLabel(resetsAt: Date): string {
  if (isPast(resetsAt)) return "Resets any moment";
  const { days, hours, minutes } = intervalToDuration({
    start: new Date(),
    end: resetsAt,
  });
  if (days) return `Resets in ${days}d ${hours ?? 0}h`;
  if (hours) return `Resets in ${hours}h ${minutes ?? 0}m`;
  return `Resets in ${minutes ?? 0}m`;
}

function windowLabel(label: string): string {
  if (label === "session_5h") return "Session (5h)";
  if (label === "week") return "Weekly";
  return label.replace(/_/g, " ");
}

function entryTotal(e: {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}): number {
  return (
    e.input_tokens +
    e.output_tokens +
    e.cache_read_tokens +
    e.cache_creation_tokens
  );
}

export function AgentUsageDropdown() {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery({
    ...getAgentUsageStatusV1AgentUsageStatusGetOptions({ client }),
    refetchInterval: 60_000,
  });

  // Stable for the component's lifetime: recomputing these on every render
  // would change the query key each time (Date objects, not primitives) and
  // cause TanStack Query to treat every render as a new query.
  const [today] = useState(() => new Date());
  const startDate = subDays(today, HISTORY_DAYS - 1);
  const { data: daily, isLoading: dailyLoading } = useQuery({
    ...getAgentUsageDailyV1AgentUsageDailyGetOptions({
      client,
      query: { start_date: startDate, end_date: today },
    }),
    refetchInterval: 60_000,
  });

  const entries = daily?.entries ?? [];
  const statusEntries = status?.entries ?? [];

  const models = Array.from(new Set(entries.map((e) => e.model))).sort();
  const totalsByDate = new Map<string, Record<string, number>>();
  for (const e of entries) {
    const perModel = totalsByDate.get(e.date) ?? {};
    perModel[e.model] = (perModel[e.model] ?? 0) + entryTotal(e);
    totalsByDate.set(e.date, perModel);
  }

  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const d = format(subDays(today, HISTORY_DAYS - 1 - i), "yyyy-MM-dd");
    const perModel = totalsByDate.get(d) ?? {};
    const total = Object.values(perModel).reduce((a, b) => a + b, 0);
    return { date: d, perModel, total };
  });
  const maxTotal = Math.max(...days.map((d) => d.total), 1);

  const todayStr = format(today, "yyyy-MM-dd");
  const todayEntries = entries.filter((e) => e.date === todayStr);
  const todayTotal = todayEntries.reduce((sum, e) => sum + entryTotal(e), 0);

  const loading = (statusLoading || dailyLoading) && !status && !daily;
  const hasAnyData = statusEntries.length > 0 || entries.length > 0;
  const needsAttention = statusEntries.some(
    (e) => e.utilization_pct >= WARN_THRESHOLD_PCT,
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title="Agent Usage"
          className="relative flex items-center justify-center rounded p-1 text-white/40 transition-[color,transform] duration-150 hover:text-white/70 active:scale-95 motion-reduce:active:scale-100"
        >
          <Gauge className="size-4" />
          {needsAttention && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-black/60"
              style={{ background: severityColor(95) }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex w-96 flex-col overflow-hidden rounded-xl border-white/10 bg-black/60 p-0 shadow-2xl backdrop-blur-xl"
        style={{ maxHeight: "min(32rem, 80vh)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
          <span className="text-sm font-medium text-white/80">Agent Usage</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-6 w-full animate-pulse rounded bg-white/5"
                />
              ))}
            </div>
          ) : !hasAnyData ? (
            <p className="text-xs text-white/50">
              No agent usage data yet — install the collector script (
              <code className="font-mono">tools/agent-usage-collector</code>) on
              a machine running Claude Code.
            </p>
          ) : (
            <div className="space-y-5">
              {statusEntries.length > 0 && (
                <div className="space-y-3">
                  {statusEntries.map((entry) => {
                    const observedAt = new Date(entry.observed_at);
                    const stale = Date.now() - observedAt.getTime() > STALE_MS;
                    const color = severityColor(entry.utilization_pct);
                    return (
                      <div
                        key={`${entry.device}-${entry.agent}-${entry.window_label}`}
                        className="space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/70">
                            {windowLabel(entry.window_label)}
                          </span>
                          <span
                            className={
                              stale ? "text-white/30" : "text-white/50"
                            }
                          >
                            {entry.utilization_pct.toFixed(0)}% ·{" "}
                            {formatDistanceToNowStrict(observedAt)} ago
                            {stale ? " (stale)" : ""}
                          </span>
                        </div>
                        {entry.resets_at && (
                          <div className="text-right text-10 text-white/35">
                            {resetLabel(new Date(entry.resets_at))}
                          </div>
                        )}
                        <div
                          className="relative h-2 w-full overflow-hidden rounded-full"
                          style={{ background: "rgba(255,255,255,0.07)" }}
                        >
                          <div
                            className="absolute inset-y-0 left-0 w-full rounded-full transition-transform"
                            style={{
                              transform: `translateX(-${100 - entry.utilization_pct}%)`,
                              background: color,
                              opacity: stale ? 0.4 : 1,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {entries.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/50">
                      Last {HISTORY_DAYS} days
                    </span>
                    {models.length > 1 && (
                      <div className="flex items-center gap-3">
                        {models.map((m, i) => (
                          <span
                            key={m}
                            className="flex items-center gap-1 text-11 text-white/50"
                          >
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{
                                background:
                                  MODEL_COLORS[i % MODEL_COLORS.length],
                              }}
                            />
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex h-24 items-end gap-0.5">
                    {days.map((d) => (
                      <div
                        key={d.date}
                        className="relative flex h-full flex-1 flex-col justify-end gap-0.5"
                        onMouseEnter={() => setHoveredDate(d.date)}
                        onMouseLeave={() =>
                          setHoveredDate((cur) => (cur === d.date ? null : cur))
                        }
                      >
                        {hoveredDate === d.date && (
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-10 text-white/80">
                            <span className="text-white/50">
                              {format(new Date(d.date), "MMM d")} ·{" "}
                            </span>
                            {d.total > 0
                              ? `${fmtTokens(d.total)} tokens`
                              : "No usage"}
                          </div>
                        )}
                        {models.map((m, i) => {
                          const v = d.perModel[m] ?? 0;
                          if (v === 0) return null;
                          return (
                            <div
                              key={m}
                              className="w-full rounded-t-sm"
                              style={{
                                height: `${(v / maxTotal) * 100}%`,
                                background:
                                  MODEL_COLORS[i % MODEL_COLORS.length],
                              }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {todayEntries.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm text-white/50">
                    <span className="text-base font-medium text-white/80">
                      {fmtTokens(todayTotal)}
                    </span>{" "}
                    tokens today
                  </p>
                  {todayEntries.map((e) => (
                    <div
                      key={e.model}
                      className="flex items-center justify-between text-xs text-white/60"
                    >
                      <span className="font-mono">{e.model}</span>
                      <span className="tabular-nums">
                        {fmtTokens(entryTotal(e))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
