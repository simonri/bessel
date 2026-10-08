import {
  getAgentUsageDailyV1AgentUsageDailyGetOptions,
  getAgentUsageStatusV1AgentUsageStatusGetOptions,
} from "@bessel/client";
import { Popover, PopoverTrigger } from "@bessel/ui/components/popover";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNowStrict, parseISO, subDays } from "date-fns";
import { Gauge } from "lucide-react";
import { useMemo, useState } from "react";
import { client } from "@/lib/client";
import { apiDate, localIsoDay, useLocalDay } from "@/lib/local-day";
import { cn } from "@/lib/utils";
import {
  latestLimits,
  limitLabel,
  planLabel,
  resetLabel,
} from "./agent-usage-limits";
import {
  FAMILY_COLOR,
  FAMILY_LABEL,
  FAMILY_ORDER,
  type ModelFamily,
  modelFamily,
  modelLabel,
} from "./agent-usage-models";
import { TopbarPanel, TopbarPanelHeader } from "./topbar-panel";
import { TOPBAR_BADGE_RING, TOPBAR_ICON_BUTTON } from "./topbar-styles";
import { TopbarTooltip } from "./topbar-tooltip";

const HISTORY_DAYS = 30;
const STALE_MS = 30 * 60 * 1000;
const WARN_THRESHOLD_PCT = 85;
const USAGE_SETTINGS_URL = "https://claude.ai/settings/usage";
const LIMIT_COLOR = "#3987e5";

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

  const todayStr = useLocalDay();
  const today = useMemo(() => parseISO(todayStr), [todayStr]);
  const range = useMemo(
    () => ({
      start_date: apiDate(localIsoDay(subDays(today, HISTORY_DAYS - 1))),
      end_date: apiDate(todayStr),
    }),
    [today, todayStr],
  );
  const { data: daily, isLoading: dailyLoading } = useQuery({
    ...getAgentUsageDailyV1AgentUsageDailyGetOptions({
      client,
      query: range,
    }),
    refetchInterval: 60_000,
  });

  const entries = daily?.entries ?? [];
  const statusEntries = status?.entries ?? [];
  const limits = latestLimits(statusEntries);
  const plan = planLabel(limits.find((l) => l.tier)?.tier);
  const lastObserved = Math.max(
    ...limits.map((l) => new Date(l.observed_at).getTime()),
  );
  const stale = limits.length > 0 && Date.now() - lastObserved > STALE_MS;

  // Charted by family: every version and dated snapshot as its own series
  // made the legend run off the panel and recycled the colours.
  const totalsByDate = new Map<string, Partial<Record<ModelFamily, number>>>();
  for (const e of entries) {
    const perFamily = totalsByDate.get(e.date) ?? {};
    const family = modelFamily(e.model);
    perFamily[family] = (perFamily[family] ?? 0) + entryTotal(e);
    totalsByDate.set(e.date, perFamily);
  }
  const families = FAMILY_ORDER.filter((f) =>
    entries.some((e) => modelFamily(e.model) === f),
  );

  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const d = localIsoDay(subDays(today, HISTORY_DAYS - 1 - i));
    const perFamily = totalsByDate.get(d) ?? {};
    const total = Object.values(perFamily).reduce((a, b) => a + b, 0);
    return { date: d, perFamily, total };
  });
  const maxTotal = Math.max(...days.map((d) => d.total), 1);

  // Each device reports its own rows; today's list is per model.
  const todayByModel = new Map<string, number>();
  for (const e of entries)
    if (e.date === todayStr)
      todayByModel.set(
        e.model,
        (todayByModel.get(e.model) ?? 0) + entryTotal(e),
      );
  const todayModels = [...todayByModel].sort((a, b) => b[1] - a[1]);
  const todayTotal = todayModels.reduce((sum, [, n]) => sum + n, 0);

  const loading = (statusLoading || dailyLoading) && !status && !daily;
  const hasAnyData = statusEntries.length > 0 || entries.length > 0;
  const needsAttention = limits.some(
    (e) => e.utilization_pct >= WARN_THRESHOLD_PCT,
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <TopbarTooltip label="Agent usage">
          <button
            type="button"
            aria-label="Agent usage"
            className={TOPBAR_ICON_BUTTON}
          >
            <Gauge />
            {needsAttention && (
              <span
                className={cn(
                  "absolute top-1 right-1 size-2 rounded-full",
                  TOPBAR_BADGE_RING,
                )}
                style={{ background: severityColor(95) }}
              />
            )}
          </button>
        </TopbarTooltip>
      </PopoverTrigger>
      <TopbarPanel width="lg">
        <TopbarPanelHeader
          title={`Plan usage limits${plan ? ` - ${plan}` : ""}`}
          href={USAGE_SETTINGS_URL}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
          {loading ? (
            <div className="space-y-3">
              {["session", "week", "scoped"].map((row) => (
                <div
                  key={row}
                  className="h-8 w-full animate-pulse rounded bg-white/5"
                />
              ))}
            </div>
          ) : !hasAnyData ? (
            <p className="text-xs text-white/50">
              No agent usage data yet - install the collector from Settings,
              Agent usage on a machine running Claude Code.
            </p>
          ) : (
            <div className="space-y-5">
              {limits.length > 0 && (
                <div className="space-y-3.5">
                  {limits.map((limit) => {
                    const pct = Math.round(limit.utilization_pct);
                    return (
                      <div key={limit.window_label} className="space-y-1.5">
                        <div className="flex items-baseline gap-3 text-13">
                          <span className="min-w-0 flex-1 truncate text-white/85">
                            {limitLabel(limit.window_label)}
                          </span>
                          {limit.resets_at && (
                            <span className="shrink-0 text-white/45">
                              {resetLabel(new Date(limit.resets_at))}
                            </span>
                          )}
                          <span className="w-9 shrink-0 text-right tabular-nums text-white/70">
                            {pct}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className="h-full rounded-full transition-[width] duration-500 ease-out"
                            style={{
                              width: `${Math.min(100, limit.utilization_pct)}%`,
                              background:
                                pct >= WARN_THRESHOLD_PCT
                                  ? severityColor(pct)
                                  : LIMIT_COLOR,
                              opacity: stale ? 0.45 : 1,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {stale && (
                    <p className="text-11 text-amber-300/75">
                      Last updated{" "}
                      {formatDistanceToNowStrict(new Date(lastObserved))} ago.
                      Check the collector in Settings, Agent usage.
                    </p>
                  )}
                </div>
              )}

              {entries.length > 0 && (
                <div className="space-y-2 border-t border-white/[0.06] pt-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-13 text-white/55">
                      Last {HISTORY_DAYS} days
                    </span>
                    {families.length > 1 && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {families.map((f) => (
                          <span
                            key={f}
                            className="flex items-center gap-1.5 text-12 text-white/50"
                          >
                            <span
                              className="size-2 rounded-full"
                              style={{ background: FAMILY_COLOR[f] }}
                            />
                            {FAMILY_LABEL[f]}
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
                              {format(parseISO(d.date), "MMM d")} -{" "}
                            </span>
                            {d.total > 0
                              ? `${fmtTokens(d.total)} tokens`
                              : "No usage"}
                          </div>
                        )}
                        {families.map((f) => {
                          const v = d.perFamily[f] ?? 0;
                          if (v === 0) return null;
                          return (
                            <div
                              key={f}
                              className="w-full"
                              style={{
                                height: `${(v / maxTotal) * 100}%`,
                                background: FAMILY_COLOR[f],
                              }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {todayModels.length > 0 && (
                <div className="space-y-1.5 border-t border-white/[0.06] pt-4">
                  <p className="text-13 text-white/55">
                    <span className="text-base font-medium tabular-nums text-white/85">
                      {fmtTokens(todayTotal)}
                    </span>{" "}
                    tokens today
                  </p>
                  {todayModels.map(([model, tokens]) => (
                    <div
                      key={model}
                      className="flex items-center gap-2 text-13 text-white/70"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: FAMILY_COLOR[modelFamily(model)] }}
                      />
                      <span className="min-w-0 flex-1 truncate" title={model}>
                        {modelLabel(model)}
                      </span>
                      <span className="tabular-nums text-white/45">
                        {fmtTokens(tokens)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </TopbarPanel>
    </Popover>
  );
}
