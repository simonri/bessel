import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, SectionLabel } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { CityTable } from "./city-table";
import data from "./climate-data.json";
import {
  type ClimatePoint,
  countryClimates,
  formatTemp,
  type MapShape,
  MONTHS,
  SCALE_MAX,
  SCALE_MIN,
  scaleGradient,
  tempColor,
} from "./climate-scale";
import { WorldMap } from "./world-map";

const climates = countryClimates(data.points as ClimatePoint[]);
// Uninhabited spots (a reef, a glacier) only have a centre point; the headline
// compares places people live.
const inhabited = climates.filter((c) => c.places.some((p) => p.name));

function MonthPicker({
  month,
  onChange,
}: {
  month: number;
  onChange: (month: number) => void;
}) {
  return (
    <fieldset className="grid grid-cols-6 gap-1 rounded-xl border-0 bg-white/[0.04] p-1 ring-1 ring-white/[0.06] sm:grid-cols-12">
      <legend className="sr-only">Month</legend>
      {MONTHS.map((name, i) => (
        <button
          key={name}
          type="button"
          aria-pressed={i === month}
          aria-label={name}
          onClick={() => onChange(i)}
          className={cn(
            "h-7 rounded-lg text-12 font-medium transition-colors duration-150",
            i === month
              ? "bg-white/[0.12] text-white/90"
              : "text-white/50 hover:bg-white/[0.05] hover:text-white/80",
          )}
        >
          {name.slice(0, 3)}
        </button>
      ))}
    </fieldset>
  );
}

function Legend() {
  // The in-between ticks only fit once there's room for them.
  const ticks = [
    { t: -30 },
    { t: -15, wide: true },
    { t: 0 },
    { t: 15, wide: true },
    { t: 30, wide: true },
    { t: 40 },
  ];
  return (
    <div className="flex flex-col gap-1">
      <div
        aria-hidden
        className="h-2 w-full rounded-full"
        style={{ background: scaleGradient() }}
      />
      <div className="relative h-4 text-11 tabular-nums text-white/45">
        {ticks.map(({ t, wide }) => (
          <span
            key={t}
            className={cn(
              "absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full",
              wide && "hidden sm:inline",
            )}
            style={{
              left: `${((t - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100}%`,
            }}
          >
            {formatTemp(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function CountryTable({ month, query }: { month: number; query: string }) {
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return climates
      .filter(
        (c) =>
          !q ||
          c.country.toLowerCase().includes(q) ||
          c.places.some((p) => p.name?.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.temps[month] - a.temps[month]);
  }, [month, query]);

  return (
    <div className="overflow-x-auto rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
      <table className="w-full min-w-[720px] border-collapse text-12 tabular-nums">
        <thead>
          <tr className="text-white/45">
            <th className="px-4 py-2.5 text-left font-medium">Country</th>
            {MONTHS.map((name, i) => (
              <th
                key={name}
                className={cn(
                  "px-0.5 py-2.5 font-medium",
                  i === month && "text-white/85",
                )}
              >
                {name.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.country} className="border-t border-white/[0.05]">
              <th
                scope="row"
                className="max-w-56 truncate px-4 py-1.5 text-left font-normal text-white/80"
                title={c.places
                  .map((p) => p.name)
                  .filter(Boolean)
                  .join(", ")}
              >
                {c.country}
              </th>
              {c.temps.map((t, i) => (
                <td
                  key={MONTHS[i]}
                  className="px-0.5 py-1"
                  aria-current={i === month ? "true" : undefined}
                >
                  <span
                    className={cn(
                      "flex h-6 items-center justify-center rounded-[4px] text-11 font-medium text-black/75",
                      i === month && "ring-1 ring-white/70",
                    )}
                    style={{ background: tempColor(t) }}
                  >
                    {Math.round(t)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="px-4 py-6 text-center text-12 text-white/45">
          No country or city matches that.
        </p>
      )}
    </div>
  );
}

const points = data.points as ClimatePoint[];

type TableView = "countries" | "cities";

function TableSwitch({
  view,
  onChange,
}: {
  view: TableView;
  onChange: (view: TableView) => void;
}) {
  return (
    <fieldset className="m-0 flex h-7 items-center rounded-lg border-0 bg-white/[0.04] p-0.5 ring-1 ring-white/[0.06]">
      <legend className="sr-only">Show</legend>
      {(["countries", "cities"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-full rounded-md px-2.5 text-12 font-medium transition-colors duration-150",
            view === v
              ? "bg-white/[0.1] text-white/90"
              : "text-white/50 hover:text-white/80",
          )}
        >
          {v === "countries" ? "Countries" : "Cities"}
        </button>
      ))}
    </fieldset>
  );
}

export function WorldClimatePage() {
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TableView>("countries");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea"))
        return;
      if (e.key === "ArrowRight") setMonth((m) => (m + 1) % 12);
      else if (e.key === "ArrowLeft") setMonth((m) => (m + 11) % 12);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const ranked = [...inhabited].sort((a, b) => b.temps[month] - a.temps[month]);
  const warmest = ranked[0];
  const coldest = ranked[ranked.length - 1];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        title="World"
        summary={`${MONTHS[month]} on average - warmest ${warmest.country} (${formatTemp(warmest.temps[month])}), coldest ${coldest.country} (${formatTemp(coldest.temps[month])})`}
      />

      <MonthPicker month={month} onChange={setMonth} />

      <section className="flex flex-col gap-3">
        <WorldMap
          shapes={data.shapes as MapShape[]}
          view={data}
          climates={climates}
          month={month}
        />
        <Legend />
        <p className="text-11 text-white/35">
          Air: 25-year monthly averages (2001-2025) from NASA POWER, at each
          country's capital and, for big countries, its major cities. Sea: the
          nearest ocean's surface temperature (NOAA, 1991-2020 averages). Use ←
          → to change month.
        </p>
      </section>

      <section>
        <SectionLabel
          action={
            <div className="flex items-center gap-2">
              <TableSwitch view={view} onChange={setView} />
              <label className="flex h-7 items-center gap-1.5 rounded-lg bg-white/[0.04] px-2 ring-1 ring-white/[0.06] focus-within:ring-primary-400/40">
                <Search className="size-3.5 text-white/35" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a country or city"
                  aria-label="Find a country or city"
                  className="w-28 min-w-0 bg-transparent text-12 sm:w-44 text-white/85 outline-none placeholder:text-white/30"
                />
              </label>
            </div>
          }
        >
          {view === "countries"
            ? `Every country, warmest first in ${MONTHS[month]}`
            : `Every city in ${MONTHS[month]}`}
        </SectionLabel>
        {view === "countries" ? (
          <CountryTable month={month} query={query} />
        ) : (
          <CityTable points={points} month={month} query={query} />
        )}
      </section>
    </div>
  );
}
