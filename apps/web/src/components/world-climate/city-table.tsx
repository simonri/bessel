import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  type ClimatePoint,
  formatSeaDistance,
  formatTemp,
  placeKey,
  tempColor,
} from "./climate-scale";

type SortKey = "city" | "air" | "sea" | "distance";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "city", label: "City", numeric: false },
  { key: "air", label: "Air", numeric: true },
  { key: "sea", label: "Sea", numeric: true },
  { key: "distance", label: "To the sea", numeric: true },
];

function sortValue(point: ClimatePoint, key: SortKey, month: number) {
  if (key === "air") return point.temps[month];
  if (key === "sea") return point.seaTemps[month];
  if (key === "distance") return point.seaKm;
  return point.name ?? "";
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

/** Every city with its air and sea temperature in `month` and how far the sea is. */
export function CityTable({
  points,
  month,
  query,
}: {
  points: ClimatePoint[];
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
    return points
      .filter(
        (p) =>
          p.name &&
          (!q ||
            p.name.toLowerCase().includes(q) ||
            p.country.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const x = sortValue(a, sort.key, month);
        const y = sortValue(b, sort.key, month);
        return (
          direction *
          (typeof x === "string"
            ? x.localeCompare(y as string)
            : x - (y as number))
        );
      });
  }, [points, month, query, sort]);

  const sortBy = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, descending: !current.descending }
        : { key, descending: key !== "city" && key !== "distance" },
    );

  return (
    <div className="overflow-x-auto rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
      <table className="w-full min-w-[560px] border-collapse text-12 tabular-nums">
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
          {rows.map((p) => (
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
            </tr>
          ))}
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
