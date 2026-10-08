import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { fmtDur } from "@/routes/_app/-activity-utils";
import type { WeekDay } from "./activity-insights";

/** The last seven days as soft bars — the selected one in the accent colour. */
export function WeekStrip({
  days,
  usual,
  onSelect,
}: {
  days: WeekDay[];
  usual: number | null;
  onSelect: (date: Date) => void;
}) {
  const max = Math.max(...days.map((d) => d.secs), usual ?? 0, 1);
  const usualPct = usual ? (usual / max) * 100 : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-white/70">This week</span>
        {usual !== null && (
          <span className="text-11 text-white/40">usual {fmtDur(usual)}</span>
        )}
      </div>
      <div className="relative flex h-24 items-end gap-2">
        {usualPct !== null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/15"
            style={{ bottom: `${usualPct}%` }}
          />
        )}
        {days.map((d) => (
          <button
            key={d.date.toISOString()}
            type="button"
            onClick={() => onSelect(d.date)}
            aria-label={`${format(d.date, "EEEE")}: ${d.secs ? fmtDur(d.secs) : "no screen time"}`}
            title={`${format(d.date, "EEEE")}: ${d.secs ? fmtDur(d.secs) : "no screen time"}`}
            className="group flex h-full min-w-0 flex-1 items-end justify-center"
          >
            <div
              className={cn(
                "w-full max-w-7 transition-[background-color,height] duration-300 ease-out",
                d.isSelected
                  ? "bg-primary-400"
                  : "bg-white/[0.12] group-hover:bg-white/25",
              )}
              style={{
                height: `${Math.max((d.secs / max) * 100, d.secs ? 6 : 3)}%`,
              }}
            />
          </button>
        ))}
      </div>
      <div className="-mt-1 flex gap-2">
        {days.map((d) => (
          <span
            key={d.date.toISOString()}
            className={cn(
              "min-w-0 flex-1 truncate text-center text-10 font-medium",
              d.isSelected
                ? "text-primary-300"
                : d.isToday
                  ? "text-white/70"
                  : "text-white/35",
            )}
          >
            {d.isToday ? "Today" : format(d.date, "EEE")}
          </span>
        ))}
      </div>
    </div>
  );
}
