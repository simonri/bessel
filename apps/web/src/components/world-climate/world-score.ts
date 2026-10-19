import {
  type AdvisoryLevel,
  type ClimatePoint,
  type CountryFacts,
  type Internet,
  type MalariaRisk,
  malariaRisk,
  type Rides,
  type Scene,
} from "./climate-scale";

/**
 * How much each part counts. Simon's preferences: hot weather first, then a
 * warm sea with beaches close by and the tropics; rent up to $1,500 is fine;
 * a café and coworking scene counts, and Airbnb and lots of tourists are
 * small pluses. Tap water and city size don't count. Malaria, low development and danger are taken off
 * the total afterwards, as are slow internet and storm season; visa-free
 * entry adds a little. Cheapness uses rent where known, else salary.
 */
export const SCORE_WEIGHTS = {
  weather: 0.4,
  sea: 0.2,
  tropical: 0.1,
  cheap: 0.1,
  airbnb: 0.05,
  scene: 0.1,
  tourism: 0.05,
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
  | "rides"
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

/** Having to phone or hail a taxi costs 12; an app with few drivers or rules against it, 5. */
export const RIDES_PENALTY: Record<Rides["status"], number> = {
  yes: 0,
  limited: 5,
  no: 12,
};

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

/**
 * A warm sea is worth less without beaches: a coast with none mapped keeps
 * 30%, five or more keep it all. Unknown counts as fine.
 */
export function beachFactor(beaches: number | null): number {
  if (beaches === null) return 1;
  return 0.3 + 0.7 * clamp01(beaches / 5);
}

/** Tourists spending $100 million a year or less is nothing, $30 billion+ full marks, on a log scale. */
export function tourismScore(tourism: CountryFacts["tourism"]): number {
  if (!tourism) return 0.5;
  return clamp01(Math.log10(Math.max(tourism.usd, 1) / 1e8) / Math.log10(300));
}

/** No cloud to 40% is full marks, 90%+ nothing. */
export function sunScore(cloudPercent: number): number {
  return clamp01(1 - (cloudPercent - 40) / 50);
}

/** $1,500 a month or less is full marks, $3,000+ nothing. */
export function rentScore(usd: number): number {
  return clamp01(1 - (usd - 1500) / 1500);
}

/** Full marks inside the tropics, fading out to nothing at 30° north or south. */
export function tropicalScore(lat: number): number {
  return clamp01((30 - Math.abs(lat)) / (30 - 23.5));
}

/**
 * A coworking space counts as ten cafés: 10 or fewer is nothing, 1,000+ full
 * marks, on a log scale. Unknown is neutral.
 */
export function sceneScore(scene: Scene | null): number {
  if (!scene) return 0.5;
  const places = scene.cafes + 10 * scene.coworking;
  return clamp01(Math.log10(Math.max(places, 1) / 10) / 2);
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
      0.6 * temperatureScore(point.temps[month]) +
      0.3 * rainScore(point.rainMm[month]) +
      0.1 * sunScore(point.cloud[month]),
    sea:
      seaScore(point.seaTemps[month], point.seaKm) * beachFactor(point.beaches),
    tropical: tropicalScore(point.lat),
    cheap: point.rent ? rentScore(point.rent.usd) : cheapScore(facts.salary),
    airbnb: airbnbScore(point.airbnb.status),
    scene: sceneScore(point.scene),
    tourism: tourismScore(facts.tourism),
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
    rides: point.rides ? -RIDES_PENALTY[point.rides.status] : 0,
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
  tropical: "Tropics",
  cheap: "Cheap",
  airbnb: "Airbnb",
  scene: "Scene",
  tourism: "Tourism",
};

const ADJUSTMENT_LABEL: Record<Adjustment, string> = {
  malaria: "Malaria",
  hdi: "HDI",
  safety: "Safety",
  internet: "Internet",
  storms: "Storms",
  rides: "Taxi app",
  visa: "Visa free",
};

/** "Weather 36/40, Sea 14/20, Tropics 10/10, Cheap 8/10, Airbnb 5/5, Scene 7/10, Tourism 4/5, Malaria -12". */
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
