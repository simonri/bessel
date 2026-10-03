import { format } from "date-fns";
import { LogIn, MapPin, Monitor, Moon, Sun } from "lucide-react";
import { pastel } from "./day-ribbon";
import { LANE_META, type Moment } from "./day-summary";

const KIND: Record<Moment["kind"], { icon: typeof Moon; hue: number }> = {
  sleep: { icon: Moon, hue: LANE_META.sleep.hue },
  wake: { icon: Sun, hue: 75 },
  screen: { icon: Monitor, hue: LANE_META.pc.hue },
  place: { icon: MapPin, hue: LANE_META.places.hue },
};

/** The day as a short, readable story. */
export function MomentsList({ moments }: { moments: Moment[] }) {
  if (moments.length === 0) return null;
  return (
    <ol className="relative flex flex-col">
      <span
        aria-hidden
        className="absolute top-3 bottom-3 left-[4.75rem] w-px bg-white/[0.07]"
      />
      {moments.map((m) => {
        const { icon: Icon, hue } = KIND[m.kind] ?? { icon: LogIn, hue: 0 };
        return (
          <li
            key={`${m.ts}-${m.kind}-${m.text}`}
            className="relative flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors duration-150 hover:bg-white/[0.03]"
          >
            <span className="w-14 shrink-0 text-right text-11 tabular-nums text-white/40">
              {format(new Date(m.ts * 1000), "h:mma").toLowerCase()}
            </span>
            <span
              className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-[var(--color-panel)]"
              style={{ backgroundColor: pastel(hue, 0.18), color: pastel(hue) }}
            >
              <Icon className="size-3" />
            </span>
            <span className="min-w-0 flex-1 truncate text-13 text-white/80">
              {m.text}
            </span>
            {m.detail && (
              <span className="shrink-0 pr-1 text-11 tabular-nums text-white/35">
                {m.detail}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
