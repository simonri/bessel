import {
  type ClimatePoint,
  type CountryFacts,
  type MalariaRisk,
  malariaRisk,
} from "./climate-scale";

/**
 * How much each part counts. Simon's preferences: hot weather first, then a
 * warm sea close by; cheap places and Airbnb are small pluses. Tap water and
 * city size don't count. Malaria is taken off the total afterwards.
 */
export const SCORE_WEIGHTS = {
  weather: 0.5,
  sea: 0.3,
  cheap: 0.1,
  airbnb: 0.1,
} as const;

export type ScorePart = keyof typeof SCORE_WEIGHTS;

export interface CityScore {
  /** 0-100. */
  total: number;
  /** Each part from 0 (worst) to 1 (best), before weighting. */
  parts: Record<ScorePart, number>;
  /** Points taken off for malaria. */
  malaria: number;
}

/** Points off the 0-100 score: a high risk sinks even a perfect beach. */
export const MALARIA_PENALTY: Record<MalariaRisk, number> = {
  none: 0,
  low: 3,
  moderate: 12,
  high: 30,
};

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

/** Full marks from 28 to 38 °C; nothing at 10 °C or below, or 45 °C or above. */
export function temperatureScore(celsius: number): number {
  if (celsius < 28) return clamp01((celsius - 10) / 18);
  if (celsius <= 38) return 1;
  return clamp01((45 - celsius) / 7);
}

/** Full marks up to 30 mm in the month; nothing from 300 mm. */
export function rainScore(mm: number): number {
  return clamp01(1 - (mm - 30) / 270);
}

/** A sea needs to be both warm and close: 26 °C+ within 10 km is full marks. */
export function seaScore(seaCelsius: number, km: number): number {
  const warm = clamp01((seaCelsius - 16) / 10);
  const close = km <= 10 ? 1 : clamp01(1 - (km - 10) / 190);
  return warm * close;
}

/** Lower pay means cheaper living: $300 a month or less is full marks, $4,000+ nothing. */
export function cheapScore(salary: CountryFacts["salary"]): number {
  if (!salary) return 0.5;
  return clamp01(1 - (salary.usd - 300) / 3700);
}

export function airbnbScore(status: ClimatePoint["airbnb"]["status"]): number {
  if (status === "allowed") return 1;
  if (status === "restricted") return 0.5;
  return 0;
}

/** A city's score for one month. */
export function scoreCity(
  point: ClimatePoint,
  facts: CountryFacts,
  month: number,
): CityScore {
  const parts: Record<ScorePart, number> = {
    weather:
      0.75 * temperatureScore(point.temps[month]) +
      0.25 * rainScore(point.rainMm[month]),
    sea: seaScore(point.seaTemps[month], point.seaKm),
    cheap: cheapScore(facts.salary),
    airbnb: airbnbScore(point.airbnb.status),
  };
  const total = (Object.keys(SCORE_WEIGHTS) as ScorePart[]).reduce(
    (sum, part) => sum + SCORE_WEIGHTS[part] * parts[part],
    0,
  );
  const malaria =
    facts.malaria === null ? 0 : MALARIA_PENALTY[malariaRisk(facts.malaria)];
  return {
    total: Math.max(Math.round(total * 100) - malaria, 0),
    parts,
    malaria,
  };
}

export const SCORE_PART_LABEL: Record<ScorePart, string> = {
  weather: "Weather",
  sea: "Sea",
  cheap: "Cheap",
  airbnb: "Airbnb",
};

/** "Weather 45/50, Sea 24/30, Cheap 8/10, Airbnb 10/10, Malaria -12". */
export function describeScore(score: CityScore): string {
  const parts = (Object.keys(SCORE_WEIGHTS) as ScorePart[]).map((part) => {
    const max = SCORE_WEIGHTS[part] * 100;
    return `${SCORE_PART_LABEL[part]} ${Math.round(score.parts[part] * max)}/${max}`;
  });
  if (score.malaria > 0) parts.push(`Malaria -${score.malaria}`);
  return parts.join(", ");
}

// Viridis: perceptually even and readable with colour blindness.
const SCORE_STOPS = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"];

function hexToRgb(hex: string): number[] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The colour for a 0-100 score. */
export function scoreColor(score: number): string {
  const t =
    (Math.min(Math.max(score, 0), 100) / 100) * (SCORE_STOPS.length - 1);
  const i = Math.min(Math.floor(t), SCORE_STOPS.length - 2);
  const [a, b] = [hexToRgb(SCORE_STOPS[i]), hexToRgb(SCORE_STOPS[i + 1])];
  const f = t - i;
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(", ")})`;
}

export function scoreGradient(): string {
  return `linear-gradient(to right, ${SCORE_STOPS.join(", ")})`;
}
