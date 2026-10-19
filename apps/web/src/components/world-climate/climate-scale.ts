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
  /** Kilometres to the nearest ocean coast. */
  seaKm: number;
  /** That sea's average surface °C for January..December. */
  seaTemps: number[];
  airbnb: AirbnbRule;
  /** Average relative humidity per month, %. */
  humidity: number[];
  /** Total rain per month, mm. */
  rainMm: number[];
  /** Average cloud cover per month, %. */
  cloud: number[];
  /** Metro population, where known. */
  population?: number;
  /** People per km² in the city proper, where known. */
  densityKm2?: number;
  /** Share of years with a tropical storm within 150 km, per month (0-1). */
  storms: number[];
  /** Average fixed broadband, or mobile where fixed has too few tests. */
  internet: Internet | null;
  /** A month in an entire Airbnb home, in USD. */
  rent: Rent | null;
  /** Cafés and coworking spaces within 5 km (OpenStreetMap). */
  scene: Scene | null;
}

export interface Scene {
  cafes: number;
  coworking: number;
}

export interface Internet {
  downMbps: number;
  upMbps: number;
  latencyMs: number;
  kind: "fixed" | "mobile";
}

export interface Rent {
  usd: number;
  /** Measured from local monthly listings, or estimated from the country's price level. */
  basis: "airbnb" | "estimate";
}

export interface AirbnbRule {
  status: "allowed" | "restricted" | "banned" | "unavailable";
  /** Why, for anything but allowed. */
  note?: string;
}

/** Facts that come per country, shown for each of its cities. */
export interface CountryFacts {
  /** Median monthly salary after tax, in USD. */
  salary: {
    usd: number;
    /** A national survey median, or estimated from gross earnings. */
    basis: "survey" | "estimate";
    year: number;
  } | null;
  /** CDC traveller guidance on drinking the tap water. */
  tapWater: "safe" | "unsafe" | null;
  /** WHO's estimated malaria cases per 1,000 people a year; 0 where there's none. */
  malaria: number | null;
  /** UNDP Human Development Index, 0-1. */
  hdi: number | null;
  /** US State Department travel advisory: 1 normal precautions, 4 do not travel. */
  advisory: AdvisoryLevel | null;
  /** Intentional homicides per 100,000 people a year (UNODC). */
  homicides: number | null;
  /** What a Swedish passport needs to get in, and for how many days if visa free. */
  visa: { entry: VisaEntry; days?: number } | null;
}

export type VisaEntry = "free" | "arrival" | "evisa" | "eta" | "required";

export const VISA_LABEL: Record<VisaEntry, string> = {
  free: "Visa free",
  arrival: "On arrival",
  evisa: "e-Visa",
  eta: "ETA",
  required: "Visa needed",
};

export type AdvisoryLevel = 1 | 2 | 3 | 4;

export const ADVISORY_LABEL: Record<AdvisoryLevel, string> = {
  1: "Normal precautions",
  2: "Increased caution",
  3: "Reconsider travel",
  4: "Do not travel",
};

export const NO_FACTS: CountryFacts = {
  salary: null,
  tapWater: null,
  malaria: null,
  hdi: null,
  advisory: null,
  homicides: null,
  visa: null,
};

export type MalariaRisk = "none" | "low" | "moderate" | "high";

/** Under 1 case per 1,000 is mostly remote areas; 50+ means most places. */
export function malariaRisk(casesPer1000: number): MalariaRisk {
  if (casesPer1000 === 0) return "none";
  if (casesPer1000 < 1) return "low";
  if (casesPer1000 < 50) return "moderate";
  return "high";
}

export const MALARIA_LABEL: Record<MalariaRisk, string> = {
  none: "None",
  low: "Low",
  moderate: "Moderate",
  high: "High",
};

/** UNDP's tiers. */
export function hdiTier(hdi: number): "Very high" | "High" | "Medium" | "Low" {
  if (hdi >= 0.8) return "Very high";
  if (hdi >= 0.7) return "High";
  if (hdi >= 0.55) return "Medium";
  return "Low";
}

export const AIRBNB_LABEL: Record<AirbnbRule["status"], string> = {
  allowed: "Allowed",
  restricted: "Restricted",
  banned: "Banned",
  unavailable: "Not available",
};

export const TAP_WATER_LABEL = { safe: "Safe", unsafe: "Not safe" } as const;

/** "$2,752", or "≈ $152" when estimated from gross earnings. */
export function formatSalary(salary: CountryFacts["salary"]): string {
  if (!salary) return "No data";
  const amount = `$${salary.usd.toLocaleString("en-US")}`;
  return salary.basis === "estimate" ? `≈ ${amount}` : amount;
}

/** "$1,060", or "≈ $1,110" when estimated from the price level. */
export function formatRent(rent: Rent | null): string {
  if (!rent) return "No data";
  const amount = `$${rent.usd.toLocaleString("en-US")}`;
  return rent.basis === "estimate" ? `≈ ${amount}` : amount;
}

/** Unique per place: names repeat, even within a country. */
export function placeKey(point: ClimatePoint): string {
  return `${point.lat},${point.lon}`;
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

/** The coastline data is only accurate to a few km, so close means on the coast. */
const ON_THE_COAST_KM = 10;

export function formatSeaDistance(km: number): string {
  return km < ON_THE_COAST_KM
    ? "On the coast"
    : `${km.toLocaleString("en-US")} km`;
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
