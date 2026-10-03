import { format } from "date-fns";
import { Leaf, MapPin, Monitor, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDur } from "@/routes/_app/-activity-utils";
import { pastel } from "./day-ribbon";
import {
  LANE_META,
  longestBlockSecs,
  nightOf,
  type RibbonLane,
  uniquePlaces,
} from "./day-summary";

const FREE_TIME_HUE = 85;

function clock(ts: number): string {
  return format(new Date(ts * 1000), "h:mma").toLowerCase();
}

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
  detail?: string;
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
        <p className="text-lg font-semibold tabular-nums tracking-tight text-white/90">
          {value}
        </p>
        <p className="truncate text-11 text-white/40">{detail ?? " "}</p>
      </div>
    </div>
  );
}

export function SummaryCards({
  lanes,
  freeSecs,
  isToday,
}: {
  lanes: RibbonLane[];
  freeSecs: number | null;
  isToday: boolean;
}) {
  const sleep = lanes.find((l) => l.key === "sleep");
  const screen = lanes.find((l) => l.key === "pc");
  const places = lanes.find((l) => l.key === "places");
  const night = nightOf(sleep);
  const placeNames = uniquePlaces(places);
  const sessions = screen?.blocks.length ?? 0;
  const hasPlaces = (places?.blocks.length ?? 0) > 0;

  return (
    <div className="@container">
      <div
        className={cn(
          "grid grid-cols-2 gap-2.5",
          hasPlaces ? "@3xl:grid-cols-4" : "@2xl:grid-cols-3",
        )}
      >
        <Card
          icon={Moon}
          hue={LANE_META.sleep.hue}
          label="Sleep"
          value={
            sleep && sleep.blocks.length > 0 ? fmtDur(sleep.totalSecs) : "–"
          }
          detail={
            night
              ? `${clock(night.bedTs)} to ${clock(night.wakeTs)}`
              : "No sleep recorded"
          }
        />
        <Card
          icon={Monitor}
          hue={LANE_META.pc.hue}
          label="Screen time"
          value={sessions > 0 && screen ? fmtDur(screen.totalSecs) : "–"}
          detail={
            sessions > 0
              ? `${sessions} ${sessions === 1 ? "session" : "sessions"} - longest ${fmtDur(longestBlockSecs(screen))}`
              : "Away from the computer"
          }
        />
        {places && hasPlaces && (
          <Card
            icon={MapPin}
            hue={LANE_META.places.hue}
            label="Places"
            value={`${placeNames.length} ${placeNames.length === 1 ? "place" : "places"}`}
            detail={placeNames.join(", ")}
          />
        )}
        <Card
          icon={Leaf}
          hue={FREE_TIME_HUE}
          label="Free time"
          value={freeSecs !== null ? fmtDur(freeSecs) : "–"}
          detail={
            isToday ? "Away from it all, so far today" : "Away from it all"
          }
        />
      </div>
    </div>
  );
}
