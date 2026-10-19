import { describe, expect, it } from "vitest";
import type { ClimatePoint, CountryFacts } from "./climate-scale";
import {
  airbnbScore,
  beachFactor,
  cheapScore,
  describeScore,
  hdiPenalty,
  homicidePenalty,
  internetPenalty,
  rainScore,
  rentScore,
  sceneScore,
  scoreCity,
  scoreColor,
  seaScore,
  stormPenalty,
  temperatureScore,
  tourismScore,
  tropicalScore,
} from "./world-score";

const month = (value: number) => Array<number>(12).fill(value);

function city(over: Partial<ClimatePoint> = {}): ClimatePoint {
  return {
    country: "Testland",
    name: "Testville",
    capital: true,
    lat: 0,
    lon: 0,
    x: 0,
    y: 0,
    temps: month(30),
    seaKm: 5,
    seaTemps: month(27),
    airbnb: { status: "allowed" },
    humidity: month(70),
    rainMm: month(10),
    cloud: month(30),
    storms: month(0),
    internet: null,
    rent: null,
    scene: { cafes: 1000, coworking: 10 },
    beaches: 10,
    ...over,
  };
}

const cheapCountry: CountryFacts = {
  salary: { usd: 300, basis: "survey", year: 2025 },
  tapWater: "unsafe",
  malaria: 0,
  hdi: 0.7,
  advisory: 1,
  homicides: 1,
  arrivals: 40_000_000,
  visa: null,
};

describe("temperatureScore", () => {
  it("is full from 28 to 38 °C and falls off either side", () => {
    expect(temperatureScore(28)).toBe(1);
    expect(temperatureScore(38)).toBe(1);
    expect(temperatureScore(19)).toBe(0.5);
    expect(temperatureScore(10)).toBe(0);
    expect(temperatureScore(41.5)).toBe(0.5);
    expect(temperatureScore(45)).toBe(0);
  });
});

describe("rainScore", () => {
  it("is full up to 30 mm and nothing from 300 mm", () => {
    expect(rainScore(30)).toBe(1);
    expect(rainScore(165)).toBe(0.5);
    expect(rainScore(300)).toBe(0);
  });
});

describe("seaScore", () => {
  it("needs a sea that's both warm and close", () => {
    expect(seaScore(26, 10)).toBe(1);
    expect(seaScore(21, 5)).toBe(0.5);
    expect(seaScore(26, 105)).toBe(0.5);
    expect(seaScore(30, 400)).toBe(0);
    expect(seaScore(14, 0)).toBe(0);
  });
});

describe("cheapScore and airbnbScore", () => {
  it("rewards lower pay and treats a missing salary as neutral", () => {
    expect(cheapScore({ usd: 300, basis: "survey", year: 2025 })).toBe(1);
    expect(cheapScore({ usd: 2150, basis: "estimate", year: 2025 })).toBe(0.5);
    expect(cheapScore({ usd: 6000, basis: "survey", year: 2025 })).toBe(0);
    expect(cheapScore(null)).toBe(0.5);
  });

  it("gives half for restricted and nothing where Airbnb can't be used", () => {
    expect(airbnbScore("allowed")).toBe(1);
    expect(airbnbScore("restricted")).toBe(0.5);
    expect(airbnbScore("banned")).toBe(0);
    expect(airbnbScore("unavailable")).toBe(0);
  });
});

describe("scoreCity", () => {
  it("scores a hot, dry, cheap beach city with Airbnb 100", () => {
    expect(scoreCity(city(), cheapCountry, 0).total).toBe(100);
  });

  it("weights weather 40, sea 20, tropics 10, cheap 10, Airbnb 5, scene 10, tourism 5", () => {
    const cold = city({ temps: month(10), rainMm: month(300) });
    expect(scoreCity(cold, cheapCountry, 0).total).toBe(60);
    const inland = city({ seaKm: 500 });
    expect(scoreCity(inland, cheapCountry, 0).total).toBe(80);
    expect(scoreCity(city({ lat: 45 }), cheapCountry, 0).total).toBe(90);
    const quiet = city({ scene: { cafes: 0, coworking: 0 } });
    expect(scoreCity(quiet, cheapCountry, 0).total).toBe(90);
    const unvisited = { ...cheapCountry, arrivals: 200_000 };
    expect(scoreCity(city(), unvisited, 0).total).toBe(95);
    const rich: CountryFacts = {
      ...cheapCountry,
      salary: { usd: 5000, basis: "survey", year: 2025 },
    };
    expect(scoreCity(city(), rich, 0).total).toBe(90);
    expect(
      scoreCity(city({ airbnb: { status: "unavailable" } }), cheapCountry, 0)
        .total,
    ).toBe(95);
  });

  it("reads air, rain and sea for the chosen month", () => {
    const july = (summer: number, rest: number) =>
      month(rest).map((v, i) => (i === 6 ? summer : v));
    const seasonal = city({
      temps: july(30, 10),
      rainMm: july(10, 300),
      seaTemps: july(27, 14),
    });
    const winter = scoreCity(seasonal, cheapCountry, 0).parts;
    const summer = scoreCity(seasonal, cheapCountry, 6).parts;
    expect([winter.weather, winter.sea]).toEqual([0, 0]);
    expect([summer.weather, summer.sea]).toEqual([1, 1]);
  });

  it("takes points off for malaria, more the higher the risk", () => {
    const withMalaria = (casesPer1000: number | null) =>
      scoreCity(city(), { ...cheapCountry, malaria: casesPer1000 }, 0);
    expect(withMalaria(0).total).toBe(100);
    expect(withMalaria(null).total).toBe(100);
    expect(withMalaria(0.5).total).toBe(97);
    expect(withMalaria(20).total).toBe(88);
    expect(withMalaria(280).total).toBe(70);
    expect(withMalaria(280).adjustments.malaria).toBe(-30);
  });

  it("takes up to 20 points off below an HDI of 0.7", () => {
    expect(hdiPenalty(0.95)).toBe(0);
    expect(hdiPenalty(0.7)).toBe(0);
    expect(hdiPenalty(0.575)).toBe(10);
    expect(hdiPenalty(0.45)).toBe(20);
    expect(hdiPenalty(0.3)).toBe(20);
    expect(hdiPenalty(null)).toBe(0);
    const poor = scoreCity(city(), { ...cheapCountry, hdi: 0.575 }, 0);
    expect(poor.total).toBe(90);
    const both = { ...cheapCountry, hdi: 0.575, malaria: 280 };
    expect(scoreCity(city(), both, 0).total).toBe(60);
  });

  it("takes points off for travel advisories and homicides", () => {
    const withSafety = (
      advisory: CountryFacts["advisory"],
      homicides: number | null,
    ) => scoreCity(city(), { ...cheapCountry, advisory, homicides }, 0);
    expect(withSafety(1, 2).total).toBe(100);
    expect(withSafety(null, null).total).toBe(100);
    expect(withSafety(2, 2).total).toBe(97);
    expect(withSafety(3, 2).total).toBe(80);
    expect(withSafety(4, 2).total).toBe(50);
    expect(withSafety(1, 21).total).toBe(92);
    expect(withSafety(3, 60).adjustments.safety).toBe(-35);

    expect(homicidePenalty(2)).toBe(0);
    expect(homicidePenalty(21)).toBe(8);
    expect(homicidePenalty(40)).toBe(15);
    expect(homicidePenalty(90)).toBe(15);
  });

  it("adds 5 for visa-free entry, but never above 100", () => {
    const withVisa = (visa: CountryFacts["visa"]) =>
      scoreCity(city({ seaKm: 162 }), { ...cheapCountry, visa }, 0);
    expect(withVisa(null).total).toBe(84);
    expect(withVisa({ entry: "free", days: 45 }).total).toBe(89);
    expect(withVisa({ entry: "free", days: 45 }).adjustments.visa).toBe(5);
    expect(withVisa({ entry: "arrival" }).total).toBe(84);
    expect(withVisa({ entry: "eta" }).total).toBe(84);
    expect(withVisa({ entry: "required" }).total).toBe(84);
    const perfect = scoreCity(
      city(),
      { ...cheapCountry, visa: { entry: "free" } },
      0,
    );
    expect(perfect.total).toBe(100);
  });

  it("takes up to 15 off for internet too slow for video calls", () => {
    const net = (downMbps: number, upMbps: number) => ({
      downMbps,
      upMbps,
      latencyMs: 20,
      kind: "fixed" as const,
    });
    expect(internetPenalty(null)).toBe(0);
    expect(internetPenalty(net(300, 200))).toBe(0);
    expect(internetPenalty(net(50, 12.5))).toBe(0);
    expect(internetPenalty(net(27.5, 100))).toBe(8);
    expect(internetPenalty(net(300, 6.875))).toBe(8);
    expect(internetPenalty(net(5, 5))).toBe(15);
    expect(internetPenalty(net(1, 1))).toBe(15);
    const slow = scoreCity(city({ internet: net(5, 1) }), cheapCountry, 0);
    expect(slow.total).toBe(85);
  });

  it("takes up to 20 off in storm season, for the chosen month", () => {
    expect(stormPenalty(0)).toBe(0);
    expect(stormPenalty(0.25)).toBe(10);
    expect(stormPenalty(0.5)).toBe(20);
    expect(stormPenalty(0.9)).toBe(20);
    const september = month(0).map((v, i) => (i === 8 ? 0.25 : v));
    const stormy = city({ storms: september });
    expect(scoreCity(stormy, cheapCountry, 0).total).toBe(100);
    expect(scoreCity(stormy, cheapCountry, 8).total).toBe(90);
    expect(scoreCity(stormy, cheapCountry, 8).adjustments.storms).toBe(-10);
  });

  it("prices cheapness by rent where known, else by salary", () => {
    expect(rentScore(800)).toBe(1);
    expect(rentScore(1500)).toBe(1);
    expect(rentScore(2250)).toBe(0.5);
    expect(rentScore(3000)).toBe(0);
    expect(rentScore(9000)).toBe(0);
    const pricey = city({ rent: { usd: 2250, basis: "estimate" } });
    expect(scoreCity(pricey, cheapCountry, 0).parts.cheap).toBe(0.5);
    expect(scoreCity(city(), cheapCountry, 0).parts.cheap).toBe(1);
  });

  it("favours the tropics, fading out by 30°", () => {
    expect(tropicalScore(0)).toBe(1);
    expect(tropicalScore(-23.5)).toBe(1);
    expect(tropicalScore(26.75)).toBe(0.5);
    expect(tropicalScore(-30)).toBe(0);
    expect(tropicalScore(59)).toBe(0);
  });

  it("rewards cafés and coworking on a log scale, neutral when unknown", () => {
    expect(sceneScore(null)).toBe(0.5);
    expect(sceneScore({ cafes: 0, coworking: 0 })).toBe(0);
    expect(sceneScore({ cafes: 10, coworking: 0 })).toBe(0);
    expect(sceneScore({ cafes: 50, coworking: 5 })).toBe(0.5);
    expect(sceneScore({ cafes: 1000, coworking: 0 })).toBe(1);
    expect(sceneScore({ cafes: 5000, coworking: 50 })).toBe(1);
  });

  it("counts a warm sea for less where there are no beaches", () => {
    expect(beachFactor(null)).toBe(1);
    expect(beachFactor(0)).toBe(0.3);
    expect(beachFactor(2)).toBeCloseTo(0.58);
    expect(beachFactor(5)).toBe(1);
    expect(beachFactor(40)).toBe(1);
    const muddy = scoreCity(city({ beaches: 0 }), cheapCountry, 0);
    expect(muddy.parts.sea).toBe(0.3);
    expect(muddy.total).toBe(86);
  });

  it("rewards places lots of tourists visit, on a log scale", () => {
    expect(tourismScore(null)).toBe(0.5);
    expect(tourismScore(100_000)).toBe(0);
    expect(tourismScore(200_000)).toBe(0);
    expect(tourismScore(2_000_000)).toBe(0.5);
    expect(tourismScore(20_000_000)).toBe(1);
    expect(tourismScore(90_000_000)).toBe(1);
  });

  it("never goes below 0", () => {
    const awful = city({ temps: month(0), seaKm: 900, rainMm: month(400) });
    const facts: CountryFacts = {
      ...cheapCountry,
      salary: { usd: 9000, basis: "survey", year: 2025 },
      malaria: 300,
    };
    expect(scoreCity(awful, facts, 0).total).toBe(0);
  });

  it("colours scores from the first to the last stop, clamped", () => {
    expect(scoreColor(0)).toBe("rgb(68, 1, 84)");
    expect(scoreColor(100)).toBe("rgb(253, 231, 37)");
    expect(scoreColor(50)).toBe("rgb(33, 145, 140)");
    expect(scoreColor(-10)).toBe(scoreColor(0));
    expect(scoreColor(140)).toBe(scoreColor(100));
  });

  it("explains itself part by part, with adjustments only when they count", () => {
    const score = scoreCity(city({ seaKm: 162 }), cheapCountry, 0);
    expect(describeScore(score)).toBe(
      "Weather 40/40, Sea 4/20, Tropics 10/10, Cheap 10/10, Airbnb 5/5, Scene 10/10, Tourism 5/5",
    );
    const malarial = scoreCity(
      city(),
      {
        ...cheapCountry,
        malaria: 20,
        hdi: 0.575,
        advisory: 2,
        visa: { entry: "free" },
      },
      0,
    );
    expect(describeScore(malarial)).toBe(
      "Weather 40/40, Sea 20/20, Tropics 10/10, Cheap 10/10, Airbnb 5/5, Scene 10/10, Tourism 5/5, Malaria -12, HDI -10, Safety -3, Visa free +5",
    );
  });
});
