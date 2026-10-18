import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ADVISORY_LABEL,
  type AdvisoryLevel,
  AIRBNB_LABEL,
  type AirbnbRule,
  type ClimatePoint,
  type CountryFacts,
  formatSalary,
  formatSeaDistance,
  formatTemp,
  hdiTier,
  MALARIA_LABEL,
  type MalariaRisk,
  malariaRisk,
  NO_FACTS,
  placeKey,
  TAP_WATER_LABEL,
  tempColor,
  VISA_LABEL,
  type VisaEntry,
} from "./climate-scale";
import { type CityScore, describeScore, scoreColor } from "./world-score";

type SortKey =
  | "city"
  | "score"
  | "rain"
  | "humidity"
  | "cloud"
  | "population"
  | "density"
  | "air"
  | "sea"
  | "distance"
  | "salary"
  | "water"
  | "hdi"
  | "malaria"
  | "advisory"
  | "homicides"
  | "visa"
  | "airbnb";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "city", label: "City", numeric: false },
  { key: "score", label: "Score", numeric: true },
  { key: "air", label: "Air", numeric: true },
  { key: "sea", label: "Sea", numeric: true },
  { key: "rain", label: "Rain", numeric: true },
  { key: "humidity", label: "Humidity", numeric: true },
  { key: "cloud", label: "Cloud", numeric: true },
  { key: "distance", label: "To the sea", numeric: true },
  { key: "population", label: "Population", numeric: true },
  { key: "density", label: "Density", numeric: true },
  { key: "salary", label: "Salary", numeric: true },
  { key: "water", label: "Tap water", numeric: false },
  { key: "hdi", label: "HDI", numeric: true },
  { key: "malaria", label: "Malaria", numeric: false },
  { key: "advisory", label: "Advisory", numeric: false },
  { key: "homicides", label: "Homicides", numeric: true },
  { key: "visa", label: "Visa", numeric: false },
  { key: "airbnb", label: "Airbnb", numeric: false },
];

/** Columns that read best smallest first; the rest start with the largest. */
const ASCENDING_FIRST = new Set<SortKey>([
  "city",
  "distance",
  "water",
  "malaria",
  "advisory",
  "homicides",
  "visa",
  "airbnb",
  "rain",
  "humidity",
  "cloud",
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

const ADVISORY_TONE: Record<AdvisoryLevel, string> = {
  1: "text-white/60",
  2: "text-white/60",
  3: "text-amber-300",
  4: "text-rose-300",
};

const VISA_ORDER: VisaEntry[] = ["free", "arrival", "eta", "evisa", "required"];

const VISA_TONE: Record<VisaEntry, string> = {
  free: "text-emerald-300",
  arrival: "text-white/60",
  eta: "text-white/60",
  evisa: "text-white/60",
  required: "text-amber-300",
};

const MALARIA_TONE: Record<MalariaRisk, string> = {
  none: "text-white/60",
  low: "text-white/60",
  moderate: "text-amber-300",
  high: "text-rose-300",
};

function sortValue(
  point: ClimatePoint,
  facts: CountryFacts,
  score: CityScore | undefined,
  key: SortKey,
  month: number,
): string | number | null {
  switch (key) {
    case "score":
      return score?.total ?? null;
    case "rain":
      return point.rainMm[month];
    case "humidity":
      return point.humidity[month];
    case "cloud":
      return point.cloud[month];
    case "population":
      return point.population ?? null;
    case "density":
      return point.densityKm2 ?? null;
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
    case "hdi":
      return facts.hdi;
    case "malaria":
      return facts.malaria;
    case "advisory":
      return facts.advisory;
    case "homicides":
      return facts.homicides;
    case "visa":
      return facts.visa ? VISA_ORDER.indexOf(facts.visa.entry) : null;
    case "airbnb":
      return AIRBNB_ORDER.indexOf(point.airbnb.status);
    default:
      return point.name ?? "";
  }
}

/** "1.3M", "540k", "30k". */
function formatPopulation(people: number): string {
  if (people >= 1_000_000) return `${(people / 1_000_000).toFixed(1)}M`;
  return `${Math.round(people / 1000)}k`;
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
  scores,
  month,
  query,
}: {
  points: ClimatePoint[];
  countries: Record<string, CountryFacts>;
  /** Each place's score for `month`, by placeKey. */
  scores: Map<string, CityScore>;
  month: number;
  query: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "score",
    descending: true,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const direction = sort.descending ? -1 : 1;
    const value = (p: ClimatePoint) =>
      sortValue(
        p,
        countries[p.country] ?? NO_FACTS,
        scores.get(placeKey(p)),
        sort.key,
        month,
      );
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
  }, [points, countries, scores, month, query, sort]);

  const sortBy = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, descending: !current.descending }
        : { key, descending: !ASCENDING_FIRST.has(key) },
    );

  return (
    <div className="overflow-x-auto rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
      <table className="w-full min-w-[1760px] border-collapse text-12 tabular-nums">
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
            const score = scores.get(placeKey(p));
            return (
              <tr key={placeKey(p)} className="border-t border-white/[0.05]">
                <th scope="row" className="px-4 py-1.5 text-left font-normal">
                  <span className="text-white/85">{p.name}</span>
                  <span className="text-white/40"> - {p.country}</span>
                </th>
                <td className="px-4 py-1 text-right">
                  {score && (
                    <span
                      title={describeScore(score)}
                      className="inline-flex h-6 min-w-9 items-center justify-center rounded-[4px] px-1.5 text-11 font-semibold text-black/80"
                      style={{ background: scoreColor(score.total) }}
                    >
                      {score.total}
                    </span>
                  )}
                </td>
                <td className="px-4 py-1 text-right">
                  <TempChip celsius={p.temps[month]} />
                </td>
                <td className="px-4 py-1 text-right">
                  <TempChip celsius={p.seaTemps[month]} />
                </td>
                <td className="px-4 py-1.5 text-right text-white/70">
                  {p.rainMm[month]} mm
                </td>
                <td className="px-4 py-1.5 text-right text-white/70">
                  {p.humidity[month]}%
                </td>
                <td className="px-4 py-1.5 text-right text-white/70">
                  {p.cloud[month]}%
                </td>
                <td className="px-4 py-1.5 text-right text-white/70">
                  {formatSeaDistance(p.seaKm)}
                </td>
                <td
                  className={cn(
                    "px-4 py-1.5 text-right",
                    p.population ? "text-white/70" : "text-white/30",
                  )}
                >
                  {p.population ? formatPopulation(p.population) : "No data"}
                </td>
                <td
                  className={cn(
                    "px-4 py-1.5 text-right",
                    p.densityKm2 ? "text-white/70" : "text-white/30",
                  )}
                >
                  {p.densityKm2
                    ? `${p.densityKm2.toLocaleString("en-US")}/km²`
                    : "No data"}
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
                  className={cn(
                    "px-4 py-1.5 text-right",
                    facts.hdi === null ? "text-white/30" : "text-white/70",
                  )}
                  title={facts.hdi === null ? undefined : hdiTier(facts.hdi)}
                >
                  {facts.hdi === null ? "No data" : facts.hdi.toFixed(3)}
                </td>
                <td
                  className={cn(
                    "px-4 py-1.5",
                    facts.malaria === null
                      ? "text-white/30"
                      : MALARIA_TONE[malariaRisk(facts.malaria)],
                  )}
                  title={
                    facts.malaria
                      ? `${facts.malaria} cases per 1,000 people a year in ${p.country}`
                      : undefined
                  }
                >
                  {facts.malaria === null
                    ? "No data"
                    : MALARIA_LABEL[malariaRisk(facts.malaria)]}
                </td>
                <td
                  className={cn(
                    "px-4 py-1.5",
                    facts.advisory === null
                      ? "text-white/30"
                      : ADVISORY_TONE[facts.advisory],
                  )}
                  title={
                    facts.advisory === null
                      ? undefined
                      : ADVISORY_LABEL[facts.advisory]
                  }
                >
                  {facts.advisory === null
                    ? "No data"
                    : `Level ${facts.advisory}`}
                </td>
                <td
                  className={cn(
                    "px-4 py-1.5 text-right",
                    facts.homicides === null
                      ? "text-white/30"
                      : "text-white/70",
                  )}
                  title={
                    facts.homicides === null
                      ? undefined
                      : `Per 100,000 people a year in ${p.country}`
                  }
                >
                  {facts.homicides === null ? "No data" : facts.homicides}
                </td>
                <td
                  className={cn(
                    "px-4 py-1.5",
                    facts.visa ? VISA_TONE[facts.visa.entry] : "text-white/30",
                  )}
                  title={
                    facts.visa?.days
                      ? `Up to ${facts.visa.days} days with a Swedish passport`
                      : undefined
                  }
                >
                  {facts.visa ? VISA_LABEL[facts.visa.entry] : "No data"}
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
