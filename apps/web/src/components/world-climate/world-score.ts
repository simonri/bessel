import {
  type AdvisoryLevel,
  type ClimatePoint,
  type CountryFacts,
  type Internet,
  type MalariaRisk,
  malariaRisk,
} from "./climate-scale";

/**
 * How much each part counts. Simon's preferences: hot weather first, then a
 * warm sea close by; cheap places and Airbnb are small pluses. Tap water and
 * city size don't count. Malaria, low development and danger are taken off
 * the total afterwards, as are slow internet and storm season; visa-free
 * entry adds a little. Cheapness uses rent where known, else salary.
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
  /** Points added to (positive) or taken off (negative) the weighted total. */
  adjustments: Record<Adjustment, number>;
}

export type Adjustment =
  | "malaria"
  | "hdi"
  | "safety"
  | "internet"
  | "storms"
  | "visa";

export const VISA_FREE_BONUS = 5;

/** Points off the 0-100 score: a high risk sinks even a perfect beach. */
export const MALARIA_PENALTY: Record<MalariaRisk, number> = {
  none: 0,
  low: 3,
  moderate: 12,
  high: 30,
};

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

/** Most of Europe is level 2 for terrorism, so that's only a nudge. */
export const ADVISORY_PENALTY: Record<AdvisoryLevel, number> = {
  1: 0,
  2: 3,
  3: 20,
  4: 50,
};

/** Nothing off from 2 homicides per 100,000 a year; the full 15 at 40 and up. */
export function homicidePenalty(per100k: number | null): number {
  if (per100k === null) return 0;
  return Math.round(15 * clamp01((per100k - 2) / 38));
}

export function safetyPenalty(facts: CountryFacts): number {
  const advisory = facts.advisory ? ADVISORY_PENALTY[facts.advisory] : 0;
  return advisory + homicidePenalty(facts.homicides);
}

/**
 * Video calls need both ways, so upload counts four times over: nothing off
 * from 50 Mbit/s, the full 15 at 5 or below. Unknown counts as fine.
 */
export function internetPenalty(internet: Internet | null): number {
  if (!internet) return 0;
  const usable = Math.min(internet.downMbps, internet.upMbps * 4);
  return Math.round(15 * clamp01((50 - usable) / 45));
}

/** A storm in half the years (or more) for this month takes the full 20 off. */
export function stormPenalty(share: number): number {
  return Math.round(20 * clamp01(share / 0.5));
}

/** Nothing off from an HDI of 0.7; the full 20 points at 0.45 and below. */
export function hdiPenalty(hdi: number | null): number {
  if (hdi === null) return 0;
  return Math.round(20 * clamp01((0.7 - hdi) / 0.25));
}

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

/** $800 a month or less is full marks, $4,000+ nothing. */
export function rentScore(usd: number): number {
  return clamp01(1 - (usd - 800) / 3200);
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
    cheap: point.rent ? rentScore(point.rent.usd) : cheapScore(facts.salary),
    airbnb: airbnbScore(point.airbnb.status),
  };
  const total = (Object.keys(SCORE_WEIGHTS) as ScorePart[]).reduce(
    (sum, part) => sum + SCORE_WEIGHTS[part] * parts[part],
    0,
  );
  const adjustments: Record<Adjustment, number> = {
    malaria:
      facts.malaria === null ? 0 : -MALARIA_PENALTY[malariaRisk(facts.malaria)],
    hdi: -hdiPenalty(facts.hdi),
    safety: -safetyPenalty(facts),
    internet: -internetPenalty(point.internet),
    storms: -stormPenalty(point.storms[month]),
    visa: facts.visa?.entry === "free" ? VISA_FREE_BONUS : 0,
  };
  const adjusted = (Object.values(adjustments) as number[]).reduce(
    (sum, points) => sum + points,
    Math.round(total * 100),
  );
  return {
    total: Math.min(Math.max(adjusted, 0), 100),
    parts,
    adjustments,
  };
}

export const SCORE_PART_LABEL: Record<ScorePart, string> = {
  weather: "Weather",
  sea: "Sea",
  cheap: "Cheap",
  airbnb: "Airbnb",
};

const ADJUSTMENT_LABEL: Record<Adjustment, string> = {
  malaria: "Malaria",
  hdi: "HDI",
  safety: "Safety",
  internet: "Internet",
  storms: "Storms",
  visa: "Visa free",
};

/** "Weather 45/50, Sea 24/30, Cheap 8/10, Airbnb 10/10, Malaria -12, Visa free +5". */
export function describeScore(score: CityScore): string {
  const parts = (Object.keys(SCORE_WEIGHTS) as ScorePart[]).map((part) => {
    const max = SCORE_WEIGHTS[part] * 100;
    return `${SCORE_PART_LABEL[part]} ${Math.round(score.parts[part] * max)}/${max}`;
  });
  for (const adjustment of Object.keys(ADJUSTMENT_LABEL) as Adjustment[]) {
    const points = score.adjustments[adjustment];
    if (points !== 0) {
      parts.push(
        `${ADJUSTMENT_LABEL[adjustment]} ${points > 0 ? "+" : ""}${points}`,
      );
    }
  }
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
