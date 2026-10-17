import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AIRBNB_LABEL,
  type AirbnbRule,
  type ClimatePoint,
  type CountryFacts,
  formatSalary,
  formatSeaDistance,
  formatTemp,
  placeKey,
  TAP_WATER_LABEL,
  tempColor,
} from "./climate-scale";

type SortKey =
  | "city"
  | "air"
  | "sea"
  | "distance"
  | "salary"
  | "water"
  | "airbnb";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "city", label: "City", numeric: false },
  { key: "air", label: "Air", numeric: true },
  { key: "sea", label: "Sea", numeric: true },
  { key: "distance", label: "To the sea", numeric: true },
  { key: "salary", label: "Salary", numeric: true },
  { key: "water", label: "Tap water", numeric: false },
  { key: "airbnb", label: "Airbnb", numeric: false },
];

/** Columns that read best smallest first; the rest start with the largest. */
const ASCENDING_FIRST = new Set<SortKey>([
  "city",
  "distance",
  "water",
  "airbnb",
]);

const AIRBNB_ORDER: AirbnbRule["status"][] = [
  "allowed",
  "restricted",
  "banned",
  "unavailable",
];

const AIRBNB_TONE: Record<AirbnbRule["status"], string> = {
  allowed: "text-white/60",
  restricted: "text-amber-300",
  banned: "text-rose-300",
  unavailable: "text-white/40",
};

const NO_FACTS: CountryFacts = { salary: null, tapWater: null };

function sortValue(
  point: ClimatePoint,
  facts: CountryFacts,
  key: SortKey,
  month: number,
): string | number | null {
  switch (key) {
    case "air":
      return point.temps[month];
    case "sea":
      return point.seaTemps[month];
    case "distance":
      return point.seaKm;
    case "salary":
      return facts.salary?.usd ?? null;
    case "water":
      return facts.tapWater === null ? null : facts.tapWater === "safe" ? 0 : 1;
    case "airbnb":
      return AIRBNB_ORDER.indexOf(point.airbnb.status);
    default:
      return point.name ?? "";
  }
}

function TempChip({ celsius }: { celsius: number }) {
  return (
    <span
      className="inline-flex h-6 min-w-14 items-center justify-center rounded-[4px] px-1.5 text-11 font-medium text-black/75"
      style={{ background: tempColor(celsius) }}
    >
      {formatTemp(celsius)}
    </span>
  );
}

/** Every city with its air and sea temperature in `month`, how far the sea
 *  is, and its country's salary, tap water and Airbnb rules. */
export function CityTable({
  points,
  countries,
  month,
  query,
}: {
  points: ClimatePoint[];
  countries: Record<string, CountryFacts>;
  month: number;
  query: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "air",
    descending: true,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const direction = sort.descending ? -1 : 1;
    const value = (p: ClimatePoint) =>
      sortValue(p, countries[p.country] ?? NO_FACTS, sort.key, month);
    return points
      .filter(
        (p) =>
          p.name &&
          (!q ||
            p.name.toLowerCase().includes(q) ||
            p.country.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const x = value(a);
        const y = value(b);
        // Missing data sorts last whichever way the column runs.
        if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
        return (
          direction *
          (typeof x === "string"
            ? x.localeCompare(y as string)
            : x - (y as number))
        );
      });
  }, [points, countries, month, query, sort]);

  const sortBy = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, descending: !current.descending }
        : { key, descending: !ASCENDING_FIRST.has(key) },
    );

  return (
    <div className="overflow-x-auto rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
      <table className="w-full min-w-[880px] border-collapse text-12 tabular-nums">
        <thead>
          <tr className="text-white/45">
            {COLUMNS.map(({ key, label, numeric }) => {
              const active = sort.key === key;
              const Arrow = sort.descending ? ArrowDown : ArrowUp;
              return (
                <th
                  key={key}
                  aria-sort={
                    active
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : undefined
                  }
                  className={cn(
                    "px-4 py-1.5 font-medium",
                    numeric ? "text-right" : "text-left",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => sortBy(key)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-md transition-colors duration-150 hover:text-white/80",
                      active && "text-white/85",
                    )}
                  >
                    {label}
                    {active && <Arrow className="size-3" />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const facts = countries[p.country] ?? NO_FACTS;
            return (
              <tr key={placeKey(p)} className="border-t border-white/[0.05]">
                <th scope="row" className="px-4 py-1.5 text-left font-normal">
                  <span className="text-white/85">{p.name}</span>
                  <span className="text-white/40"> - {p.country}</span>
                </th>
                <td className="px-4 py-1 text-right">
                  <TempChip celsius={p.temps[month]} />
                </td>
                <td className="px-4 py-1 text-right">
                  <TempChip celsius={p.seaTemps[month]} />
                </td>
                <td className="px-4 py-1.5 text-right text-white/70">
                  {formatSeaDistance(p.seaKm)}
                </td>
                <td
                  className={cn(
                    "px-4 py-1.5 text-right",
                    facts.salary ? "text-white/80" : "text-white/30",
                  )}
                  title={
                    facts.salary
                      ? `${p.country}, ${facts.salary.year}${facts.salary.basis === "estimate" ? " - estimated from gross earnings" : ""}`
                      : undefined
                  }
                >
                  {formatSalary(facts.salary)}
                </td>
                <td
                  className={cn(
                    "px-4 py-1.5",
                    facts.tapWater === "safe"
                      ? "text-emerald-300"
                      : facts.tapWater === "unsafe"
                        ? "text-white/60"
                        : "text-white/30",
                  )}
                >
                  {facts.tapWater ? TAP_WATER_LABEL[facts.tapWater] : "No data"}
                </td>
                <td
                  className={cn("px-4 py-1.5", AIRBNB_TONE[p.airbnb.status])}
                  title={p.airbnb.note}
                >
                  {AIRBNB_LABEL[p.airbnb.status]}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="px-4 py-6 text-center text-12 text-white/45">
          No city matches that.
        </p>
      )}
    </div>
  );
}
