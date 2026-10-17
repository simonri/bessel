import { useMemo, useRef, useState } from "react";
import {
  type CountryClimate,
  formatTemp,
  type MapShape,
  tempColor,
} from "./climate-scale";

const NO_DATA = "rgba(255, 255, 255, 0.06)";
const TOOLTIP_WIDTH = 200;

interface Hover {
  x: number;
  y: number;
  country: string;
}

/** The world coloured by each country's average temperature in `month`. */
export function WorldMap({
  shapes,
  view,
  climates,
  month,
}: {
  /** Country outlines, already projected into `view`'s coordinates. */
  shapes: MapShape[];
  view: { width: number; height: number; top: number };
  climates: CountryClimate[];
  month: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const byCountry = useMemo(
    () => new Map(climates.map((c) => [c.country, c])),
    [climates],
  );
  const places = useMemo(
    () => climates.flatMap((c) => c.places).filter((p) => p.name),
    [climates],
  );
  const hovered = hover ? byCountry.get(hover.country) : undefined;
  const hoveredPlaces = hovered?.places.filter((p) => p.name) ?? [];

  const track = (country: string) => (e: React.PointerEvent) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    setHover({
      x: Math.min(e.clientX - box.left + 14, box.width - TOOLTIP_WIDTH),
      y: e.clientY - box.top + 14,
      country,
    });
  };

  return (
    <div
      ref={wrapRef}
      className="relative overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06]"
      onPointerLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 ${view.top} ${view.width} ${view.height}`}
        className="block h-auto w-full"
        role="img"
        aria-label="World map of average temperatures"
      >
        {shapes.map(({ name, d }) => {
          const climate = byCountry.get(name);
          return (
            <path
              key={name}
              d={d}
              data-country={name}
              fill={climate ? tempColor(climate.temps[month]) : NO_DATA}
              stroke="rgba(0, 0, 0, 0.35)"
              strokeWidth={0.5}
              className="transition-[fill] duration-300 hover:brightness-110"
              onPointerMove={track(name)}
            />
          );
        })}
        {places.map((place) => (
          <circle
            key={`${place.country}-${place.name}`}
            cx={place.x}
            cy={place.y}
            r={place.capital ? 2.6 : 2}
            fill={tempColor(place.temps[month])}
            stroke="rgba(0, 0, 0, 0.6)"
            strokeWidth={0.75}
            onPointerMove={track(place.country)}
          />
        ))}
      </svg>

      {hover && hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 rounded-lg border border-white/10 bg-popover px-3 py-2 text-12 shadow-xl"
          style={{ left: hover.x, top: hover.y, width: TOOLTIP_WIDTH }}
        >
          <p className="flex items-baseline justify-between gap-3 font-medium text-white/90">
            <span className="truncate">{hovered.country}</span>
            <span className="shrink-0 tabular-nums">
              {formatTemp(hovered.temps[month])}
            </span>
          </p>
          {hoveredPlaces.length > 1 && (
            <ul className="mt-1 space-y-0.5 text-white/60">
              {hoveredPlaces.map((p) => (
                <li key={p.name} className="flex justify-between gap-3">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatTemp(p.temps[month])}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
