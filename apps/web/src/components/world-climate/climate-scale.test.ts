import { describe, expect, it } from "vitest";
import {
  type ClimatePoint,
  countryClimates,
  formatSalary,
  formatSeaDistance,
  formatTemp,
  tempColor,
} from "./climate-scale";

const point = (
  country: string,
  name: string,
  january: number,
  july: number,
): ClimatePoint => ({
  country,
  name,
  capital: false,
  lat: 0,
  lon: 0,
  x: 0,
  y: 0,
  temps: [january, 0, 0, 0, 0, 0, july, 0, 0, 0, 0, 0],
  seaKm: 0,
  seaTemps: Array<number>(12).fill(0),
  airbnb: { status: "allowed" },
  humidity: Array<number>(12).fill(0),
  rainMm: Array<number>(12).fill(0),
  cloud: Array<number>(12).fill(0),
});

describe("tempColor", () => {
  it("hits each stop exactly and blends between them", () => {
    expect(tempColor(0)).toBe("rgb(171, 217, 233)");
    expect(tempColor(8)).toBe("rgb(224, 243, 248)");
    expect(tempColor(4)).toBe("rgb(198, 230, 241)");
  });

  it("clamps temperatures beyond the scale to its ends", () => {
    expect(tempColor(-55)).toBe(tempColor(-30));
    expect(tempColor(52)).toBe(tempColor(40));
  });
});

describe("countryClimates", () => {
  it("averages a country's places month by month", () => {
    const [russia, sweden] = countryClimates([
      point("Russia", "Moscow", -10, 19),
      point("Russia", "Irkutsk", -20, 21),
      point("Sweden", "Stockholm", -3, 18),
    ]);
    expect(russia.country).toBe("Russia");
    expect(russia.temps[0]).toBe(-15);
    expect(russia.temps[6]).toBe(20);
    expect(russia.places.map((p) => p.name)).toEqual(["Moscow", "Irkutsk"]);
    expect(sweden.temps[0]).toBe(-3);
  });
});

describe("formatTemp", () => {
  it("rounds and writes a real minus sign", () => {
    expect(formatTemp(-3.4)).toBe("−3 °C");
    expect(formatTemp(26.6)).toBe("27 °C");
  });
});

describe("formatSeaDistance", () => {
  it("calls anything within the data's accuracy on the coast", () => {
    expect(formatSeaDistance(5)).toBe("On the coast");
    expect(formatSeaDistance(10)).toBe("10 km");
    expect(formatSeaDistance(2292)).toBe("2,292 km");
  });
});

describe("formatSalary", () => {
  it("marks estimates and says when there's no data", () => {
    expect(formatSalary({ usd: 2752, basis: "survey", year: 2025 })).toBe(
      "$2,752",
    );
    expect(formatSalary({ usd: 152, basis: "estimate", year: 2025 })).toBe(
      "≈ $152",
    );
    expect(formatSalary(null)).toBe("No data");
  });
});
