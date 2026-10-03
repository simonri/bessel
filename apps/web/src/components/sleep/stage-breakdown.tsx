import { fmtDur } from "@/routes/_app/-activity-utils";
import { STAGE_META } from "@/routes/_app/-sleep-utils";

export interface StageTotal {
  key: string;
  secs: number;
  percentage: number;
}

/** How the night split into stages, with a word on what each one is for. */
export function StageBreakdown({ stages }: { stages: StageTotal[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
        {stages.map((stage) => (
          <span
            key={stage.key}
            title={`${STAGE_META[stage.key].label} - ${fmtDur(stage.secs)}`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              flexGrow: stage.secs,
              backgroundColor: STAGE_META[stage.key].color,
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 @lg:grid-cols-2">
        {stages.map((stage) => {
          const meta = STAGE_META[stage.key];
          return (
            <div key={stage.key} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="text-13 font-medium text-white/85">
                  {meta.label}
                </span>
                <span className="truncate text-11 text-white/40">
                  {meta.hint}
                </span>
              </div>
              <span className="text-13 tabular-nums text-white/80">
                {fmtDur(stage.secs)}
              </span>
              <span className="w-10 text-right text-11 tabular-nums text-white/40">
                {Math.round(stage.percentage)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
