import { format } from "date-fns";
import { Coffee, Moon, Sunrise } from "lucide-react";
import { pastel } from "@/components/timeline/day-ribbon";
import { fmtDur } from "@/routes/_app/-activity-utils";
import type { Session } from "./activity-insights";

function clock(ts: number): string {
  return format(new Date(ts * 1000), "h:mma").toLowerCase();
}

function Row({
  icon: Icon,
  hue,
  label,
  value,
}: {
  icon: typeof Moon;
  hue: number;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: pastel(hue, 0.16), color: pastel(hue) }}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="flex-1 text-xs text-white/55">{label}</span>
      <span className="text-xs font-medium tabular-nums text-white/85">
        {value}
      </span>
    </div>
  );
}

/** When the day at the computer started and ended, and how it was split up. */
export function DayRhythm({
  sessions,
  isToday,
}: {
  sessions: readonly Session[];
  isToday: boolean;
}) {
  if (sessions.length === 0) return null;
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  const breaks = sessions.length - 1;
  const average =
    sessions.reduce((sum, s) => sum + (s.endTs - s.startTs), 0) /
    sessions.length;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]">
      <span className="text-xs font-medium text-white/70">Day rhythm</span>
      <Row
        icon={Sunrise}
        hue={70}
        label="Started"
        value={clock(first.startTs)}
      />
      <Row
        icon={Moon}
        hue={295}
        label={isToday ? "Latest" : "Wrapped up"}
        value={clock(last.endTs)}
      />
      <Row
        icon={Coffee}
        hue={40}
        label={`${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}, ${breaks} ${breaks === 1 ? "break" : "breaks"}`}
        value={`~${fmtDur(average)} each`}
      />
    </div>
  );
}
