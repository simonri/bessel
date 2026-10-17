import { useMemo, useRef, useState } from "react";
import {
  type CountryClimate,
  type CountryFacts,
  formatSalary,
  formatSeaDistance,
  formatTemp,
  type MapShape,
  placeKey,
  tempColor,
} from "./climate-scale";
import { scoreColor } from "./world-score";

const NO_DATA = "rgba(255, 255, 255, 0.06)";
const TOOLTIP_WIDTH = 236;

interface Hover {
  x: number;
  /** Distance from the top, or from the bottom when the card opens upwards. */
  y: number;
  above: boolean;
  country: string;
}

export type MapMode = "temperature" | "score";

/** The world coloured by each country's average temperature or score in `month`. */
export function WorldMap({
  shapes,
  view,
  climates,
  countries,
  month,
  mode,
  scores,
}: {
  /** Country outlines, already projected into `view`'s coordinates. */
  shapes: MapShape[];
  view: { width: number; height: number; top: number };
  climates: CountryClimate[];
  countries: Record<string, CountryFacts>;
  month: number;
  mode: MapMode;
  /** Each place's score for `month`, by placeKey, and each country's average. */
  scores: { byPlace: Map<string, number>; byCountry: Map<string, number> };
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
  const hoveredFacts = hover ? countries[hover.country] : undefined;

  const track = (country: string) => (e: React.PointerEvent) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const pointerY = e.clientY - box.top;
    // In the lower half the card opens upwards so a long city list fits.
    const above = pointerY > box.height / 2;
    setHover({
      x: Math.min(e.clientX - box.left + 14, box.width - TOOLTIP_WIDTH),
      y: above ? box.height - pointerY + 14 : pointerY + 14,
      above,
      country,
    });
  };

  const countryFill = (name: string, climate?: CountryClimate) => {
    if (!climate) return NO_DATA;
    if (mode === "temperature") return tempColor(climate.temps[month]);
    const score = scores.byCountry.get(name);
    return score === undefined ? NO_DATA : scoreColor(score);
  };
  const countryScore = hover ? scores.byCountry.get(hover.country) : undefined;

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
        aria-label={
          mode === "score"
            ? "World map of city scores"
            : "World map of average temperatures"
        }
      >
        {shapes.map(({ name, d }) => {
          const climate = byCountry.get(name);
          return (
            <path
              key={name}
              d={d}
              data-country={name}
              fill={countryFill(name, climate)}
              stroke="rgba(0, 0, 0, 0.35)"
              strokeWidth={0.5}
              className="transition-[fill] duration-300 hover:brightness-110"
              onPointerMove={track(name)}
            />
          );
        })}
        {places.map((place) => (
          <circle
            key={placeKey(place)}
            cx={place.x}
            cy={place.y}
            r={place.capital ? 2.6 : 2}
            fill={
              mode === "score"
                ? scoreColor(scores.byPlace.get(placeKey(place)) ?? 0)
                : tempColor(place.temps[month])
            }
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
          style={{
            left: hover.x,
            width: TOOLTIP_WIDTH,
            ...(hover.above ? { bottom: hover.y } : { top: hover.y }),
          }}
        >
          <p className="flex items-baseline justify-between gap-3 font-medium text-white/90">
            <span className="truncate">{hovered.country}</span>
            <span className="shrink-0 tabular-nums">
              {mode === "score" && countryScore !== undefined
                ? `Score ${Math.round(countryScore)}`
                : formatTemp(hovered.temps[month])}
            </span>
          </p>
          {hoveredFacts && (
            <p className="mt-0.5 text-11 text-white/45">
              {formatSalary(hoveredFacts.salary)} a month
              {hoveredFacts.tapWater &&
                ` - tap water ${hoveredFacts.tapWater === "safe" ? "safe" : "not safe"}`}
            </p>
          )}
          {hoveredPlaces.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-white/60">
              {hoveredPlaces.map((p) => (
                <li
                  key={placeKey(p)}
                  className="flex items-baseline justify-between gap-3"
                  title={`Sea ${formatSeaDistance(p.seaKm).toLowerCase()}`}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {mode === "score" && (
                      <span className="text-white/85">
                        {scores.byPlace.get(placeKey(p))}{" "}
                      </span>
                    )}
                    {formatTemp(p.temps[month])}
                    <span className="text-11 text-sky-200/60">
                      {" "}
                      sea {formatTemp(p.seaTemps[month])}
                    </span>
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
