import type { HealthSummaryResponse } from "@bessel/client";
import { Moon, PersonStanding, Zap } from "lucide-react";

type Ring = {
  key: string;
  title: string;
  icon: typeof Moon;
  hue: number;
  score: number | null;
  label: string;
};

const SIZE = 64;
const STROKE = 7;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ScoreRing({ ring }: { ring: Ring }) {
  const Icon = ring.icon;
  const filled = ((ring.score ?? 0) / 100) * CIRCUMFERENCE;
  return (
    <div className="relative size-16 shrink-0">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="size-16 -rotate-90"
        aria-hidden
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          stroke={`oklch(0.8 0.1 ${ring.hue} / 0.16)`}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          stroke={`oklch(0.78 0.12 ${ring.hue})`}
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <Icon
        className="absolute inset-0 m-auto size-5"
        style={{ color: `oklch(0.8 0.1 ${ring.hue})` }}
      />
    </div>
  );
}

/**
 * The same day summary as the iPhone's Health page: sleep, movement and
 * energy as rings against the person's own usual, with a sentence about the day.
 */
export function DayRings({ summary }: { summary: HealthSummaryResponse }) {
  const rings: Ring[] = [
    {
      key: "sleep",
      title: "Sleep",
      icon: Moon,
      hue: 285,
      score: summary.sleep?.score ?? null,
      label: summary.sleep?.label ?? "Not recorded",
    },
    {
      key: "move",
      title: "Move",
      icon: PersonStanding,
      hue: 25,
      score: summary.move?.score ?? null,
      label: summary.move?.label ?? "Not recorded",
    },
  ];
  // No heart data at all means no Apple Watch: two rings, not an empty third.
  if (summary.energy) {
    rings.push({
      key: "energy",
      title: "Energy",
      icon: Zap,
      hue: 160,
      score: summary.energy.score ?? null,
      label: summary.energy.label,
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06] sm:flex-row sm:items-center">
      <div className="flex shrink-0 gap-5">
        {rings.map((ring) => (
          <div key={ring.key} className="flex items-center gap-2.5">
            <ScoreRing ring={ring} />
            <div className="min-w-0">
              <p className="text-11 text-white/45">{ring.title}</p>
              <p
                className={`text-13 font-medium ${ring.score === null ? "text-white/45" : "text-white/85"}`}
              >
                {ring.label}
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-13 leading-relaxed text-white/70 sm:ml-auto sm:max-w-xs sm:text-right">
        {summary.insight}
      </p>
    </div>
  );
}
