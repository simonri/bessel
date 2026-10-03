import { AlarmClock, BedDouble, Moon, Sparkles } from "lucide-react";
import { fmtDur } from "@/routes/_app/-activity-utils";
import {
  compareToUsual,
  eveningMinutes,
  formatEveningClock,
} from "./sleep-summary";

function Card({
  icon: Icon,
  hue,
  label,
  value,
  detail,
}: {
  icon: typeof Moon;
  hue: number;
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-white/[0.06] transition-colors duration-200 hover:bg-white/[0.06]">
      <div className="flex items-center gap-2">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: `oklch(0.8 0.1 ${hue} / 0.16)`,
            color: `oklch(0.8 0.1 ${hue})`,
          }}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="text-11 font-medium text-white/50">{label}</span>
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold tabular-nums tracking-tight text-white/90">
          {value}
        </p>
        <p className="truncate text-11 text-white/40">{detail ?? " "}</p>
      </div>
    </div>
  );
}

export function SleepCards({
  asleepSecs,
  usualAsleepSecs,
  onset,
  wake,
  usualBedtime,
  usualWake,
  deepSecs,
  remSecs,
}: {
  asleepSecs: number | null;
  usualAsleepSecs: number | null;
  onset: string | null;
  wake: string | null;
  usualBedtime: number | null;
  usualWake: number | null;
  deepSecs: number;
  remSecs: number;
}) {
  const bed = onset ? eveningMinutes(onset) : null;
  const up = wake ? eveningMinutes(wake) : null;
  const restful = deepSecs + remSecs;
  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-4">
        <Card
          icon={Moon}
          hue={290}
          label="Asleep"
          value={asleepSecs ? fmtDur(asleepSecs) : "–"}
          detail={
            asleepSecs
              ? compareToUsual(asleepSecs, usualAsleepSecs)
              : "No sleep recorded"
          }
        />
        <Card
          icon={BedDouble}
          hue={260}
          label="Fell asleep"
          value={bed !== null ? formatEveningClock(bed) : "–"}
          detail={
            usualBedtime !== null
              ? `Usually ${formatEveningClock(usualBedtime)}`
              : null
          }
        />
        <Card
          icon={AlarmClock}
          hue={60}
          label="Woke up"
          value={up !== null ? formatEveningClock(up) : "–"}
          detail={
            usualWake !== null
              ? `Usually ${formatEveningClock(usualWake)}`
              : null
          }
        />
        <Card
          icon={Sparkles}
          hue={315}
          label="Deep + REM"
          value={asleepSecs ? fmtDur(restful) : "–"}
          detail={
            asleepSecs
              ? `${Math.round((restful / asleepSecs) * 100)}% of your sleep`
              : null
          }
        />
      </div>
    </div>
  );
}
