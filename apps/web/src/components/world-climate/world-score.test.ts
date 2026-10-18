import { describe, expect, it } from "vitest";
import type { ClimatePoint, CountryFacts } from "./climate-scale";
import {
  airbnbScore,
  cheapScore,
  describeScore,
  hdiPenalty,
  homicidePenalty,
  rainScore,
  scoreCity,
  scoreColor,
  seaScore,
  temperatureScore,
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

  it("weights weather 50, sea 30, cheap 10, Airbnb 10", () => {
    const cold = city({ temps: month(10), rainMm: month(300) });
    expect(scoreCity(cold, cheapCountry, 0).total).toBe(50);
    const inland = city({ seaKm: 500 });
    expect(scoreCity(inland, cheapCountry, 0).total).toBe(70);
    const rich: CountryFacts = {
      ...cheapCountry,
      salary: { usd: 5000, basis: "survey", year: 2025 },
    };
    expect(scoreCity(city(), rich, 0).total).toBe(90);
    expect(
      scoreCity(city({ airbnb: { status: "unavailable" } }), cheapCountry, 0)
        .total,
    ).toBe(90);
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
    expect(withMalaria(280).penalties.malaria).toBe(30);
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
    expect(withSafety(3, 60).penalties.safety).toBe(35);

    expect(homicidePenalty(2)).toBe(0);
    expect(homicidePenalty(21)).toBe(8);
    expect(homicidePenalty(40)).toBe(15);
    expect(homicidePenalty(90)).toBe(15);
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

  it("explains itself part by part, with penalties only when they count", () => {
    const score = scoreCity(city({ seaKm: 105 }), cheapCountry, 0);
    expect(describeScore(score)).toBe(
      "Weather 50/50, Sea 15/30, Cheap 10/10, Airbnb 10/10",
    );
    const malarial = scoreCity(
      city(),
      { ...cheapCountry, malaria: 20, hdi: 0.575, advisory: 2 },
      0,
    );
    expect(describeScore(malarial)).toBe(
      "Weather 50/50, Sea 30/30, Cheap 10/10, Airbnb 10/10, Malaria -12, HDI -10, Safety -3",
    );
  });
});
