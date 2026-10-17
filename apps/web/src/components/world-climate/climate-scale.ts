export interface ClimatePoint {
  country: string;
  /** Null for a country's centre, used when no city was listed for it. */
  name: string | null;
  capital: boolean;
  lat: number;
  lon: number;
  /** Position on the projected map. */
  x: number;
  y: number;
  /** Average °C for January..December. */
  temps: number[];
}

/** A country outline as an SVG path on the projected map. */
export interface MapShape {
  name: string;
  d: string;
}

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Cold to hot (ColorBrewer RdYlBu, reversed), pinned to temperatures so a
// colour means the same thing in every month.
const STOPS: [number, string][] = [
  [-30, "#313695"],
  [-20, "#4575b4"],
  [-10, "#74add1"],
  [0, "#abd9e9"],
  [8, "#e0f3f8"],
  [15, "#fee090"],
  [22, "#fdae61"],
  [28, "#f46d43"],
  [34, "#d73027"],
  [40, "#a50026"],
];
export const SCALE_MIN = STOPS[0][0];
export const SCALE_MAX = STOPS[STOPS.length - 1][0];

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function tempColor(celsius: number): string {
  const t = Math.min(Math.max(celsius, SCALE_MIN), SCALE_MAX);
  const upper = STOPS.findIndex(([at]) => at >= t);
  if (upper <= 0) return STOPS[0][1];
  const [loT, loHex] = STOPS[upper - 1];
  const [hiT, hiHex] = STOPS[upper];
  const f = (t - loT) / (hiT - loT);
  const [a, b] = [rgb(loHex), rgb(hiHex)];
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * f));
  return `rgb(${mix.join(", ")})`;
}

/** CSS gradient of the whole scale, for the legend. */
export function scaleGradient(): string {
  const stops = STOPS.map(
    ([t, hex]) =>
      `${hex} ${((t - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100}%`,
  );
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

export function formatTemp(celsius: number): string {
  return `${Math.round(celsius)} °C`.replace("-", "−");
}

export interface CountryClimate {
  country: string;
  /** Mean of the country's places, per month. */
  temps: number[];
  places: ClimatePoint[];
}

/** One climate per country: the mean of its places, month by month. */
export function countryClimates(points: ClimatePoint[]): CountryClimate[] {
  const byCountry = new Map<string, ClimatePoint[]>();
  for (const point of points) {
    byCountry.set(point.country, [
      ...(byCountry.get(point.country) ?? []),
      point,
    ]);
  }
  return [...byCountry].map(([country, places]) => ({
    country,
    places,
    temps: MONTHS.map(
      (_, m) => places.reduce((sum, p) => sum + p.temps[m], 0) / places.length,
    ),
  }));
}
