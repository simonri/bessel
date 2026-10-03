import { format } from "date-fns";
import { CheckCircle2, Monitor, Sparkles, Timer } from "lucide-react";
import { pastel } from "@/components/timeline/day-ribbon";
import { LANE_META } from "@/components/timeline/day-summary";
import { cn } from "@/lib/utils";
import { fmtDur } from "@/routes/_app/-activity-utils";
import {
  appHue,
  type comparedToUsual,
  type Session,
} from "./activity-insights";

const FOCUS_HUE = 25;
const TASKS_HUE = 150;

function clock(ts: number): string {
  return format(new Date(ts * 1000), "h:mma").toLowerCase();
}

function StatCard({
  icon: Icon,
  hue,
  label,
  value,
  detail,
  detailClassName,
}: {
  icon: typeof Monitor;
  hue: number;
  label: string;
  value: string;
  detail?: string;
  detailClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-white/[0.06] transition-colors duration-200 hover:bg-white/[0.06]">
      <div className="flex items-center gap-2">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: pastel(hue, 0.16), color: pastel(hue) }}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="text-11 font-medium text-white/50">{label}</span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold tabular-nums tracking-tight text-white/90">
          {value}
        </p>
        <p className={cn("truncate text-11 text-white/40", detailClassName)}>
          {detail ?? " "}
        </p>
      </div>
    </div>
  );
}

export function ActivityCards({
  totalSecs,
  compared,
  longest,
  topApp,
  tasksDone,
}: {
  totalSecs: number;
  compared: ReturnType<typeof comparedToUsual>;
  longest: Session | null;
  topApp: { name: string; percentage: number } | null;
  tasksDone: number | null;
}) {
  const hasData = totalSecs > 0;
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <StatCard
        icon={Monitor}
        hue={LANE_META.pc.hue}
        label="Screen time"
        value={hasData ? fmtDur(totalSecs) : "–"}
        detail={
          hasData
            ? (compared?.label ?? "Not enough days to compare yet")
            : "Nothing tracked"
        }
        detailClassName={
          compared?.tone === "less" ? "text-emerald-300/80" : undefined
        }
      />
      <StatCard
        icon={Timer}
        hue={FOCUS_HUE}
        label="Longest stretch"
        value={longest ? fmtDur(longest.endTs - longest.startTs) : "–"}
        detail={
          longest
            ? `${clock(longest.startTs)} to ${clock(longest.endTs)}`
            : "No sessions"
        }
      />
      <StatCard
        icon={Sparkles}
        hue={topApp ? appHue(topApp.name) : 300}
        label="Top app"
        value={topApp?.name ?? "–"}
        detail={
          topApp
            ? `${Math.round(topApp.percentage)}% of your screen time`
            : "Nothing yet"
        }
      />
      <StatCard
        icon={CheckCircle2}
        hue={TASKS_HUE}
        label="Tasks done"
        value={tasksDone === null ? "–" : String(tasksDone)}
        detail={
          tasksDone
            ? tasksDone === 1
              ? "One thing off the list"
              : "Nicely done ✨"
            : "None finished"
        }
      />
    </div>
  );
}
