import type { ActivityAppSummary } from "@bessel/client";
import { useState } from "react";
import { pastel } from "@/components/timeline/day-ribbon";
import { fmtDur } from "@/routes/_app/-activity-utils";
import { appHue } from "./activity-insights";

const VISIBLE_APPS = 6;

/** Where the time went: one soft pastel bar per app, each app its own colour. */
export function AppBreakdown({
  apps,
  displayName,
}: {
  apps: readonly ActivityAppSummary[];
  displayName: (appClass: string) => string;
}) {
  const [showAll, setShowAll] = useState(false);
  const max = Math.max(...apps.map((a) => a.active_secs), 1);
  const visible = showAll ? apps : apps.slice(0, VISIBLE_APPS);

  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-white/[0.04] p-2 ring-1 ring-white/[0.06]">
      {visible.map((app) => {
        const name = displayName(app.app_class);
        const hue = appHue(app.app_class);
        return (
          <div
            key={app.app_class}
            className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors duration-150 hover:bg-white/[0.04]"
          >
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-11 font-semibold uppercase"
              style={{ backgroundColor: pastel(hue, 0.16), color: pastel(hue) }}
            >
              {name.slice(0, 1)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-13 text-white/85">{name}</span>
                <span className="shrink-0 text-xs tabular-nums text-white/70">
                  {fmtDur(app.active_secs)}
                  <span className="ml-2 text-11 text-white/35">
                    {Math.round(app.percentage)}%
                  </span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${(app.active_secs / max) * 100}%`,
                    backgroundColor: pastel(hue, 0.85),
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
      {apps.length > VISIBLE_APPS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mx-2 my-1 self-start rounded-full px-2.5 py-1 text-11 font-medium text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/80"
        >
          {showAll ? "Show fewer" : `Show all ${apps.length} apps`}
        </button>
      )}
    </div>
  );
}
