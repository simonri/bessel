import { describe, expect, it } from "vitest";
import {
  apiDay,
  cookedLabel,
  cookedShort,
  lastCookedDay,
  sortRecipes,
} from "./recipe-meta";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("lastCookedDay", () => {
  it("reads the day the API sent, whatever the local time zone", () => {
    expect(apiDay(day("2026-10-08"))).toBe("2026-10-08");
    expect(lastCookedDay({ last_cooked_on: day("2026-10-08") })).toBe(
      "2026-10-08",
    );
    expect(lastCookedDay({ last_cooked_on: null })).toBeNull();
  });
});

describe("cookedLabel", () => {
  const today = "2026-10-25";

  it.each([
    [null, "Not cooked yet"],
    ["2026-10-25", "Cooked today"],
    ["2026-10-24", "Cooked yesterday"],
    ["2026-10-20", "Cooked 5 days ago"],
    ["2026-10-12", "Cooked 13 days ago"],
    ["2026-10-11", "Cooked 2 weeks ago"],
    ["2026-08-27", "Cooked 8 weeks ago"],
    ["2026-08-26", "Cooked 2 months ago"],
    ["2025-10-25", "Cooked over a year ago"],
  ])("%s reads %s", (last, expected) => {
    expect(cookedLabel(last, today)).toBe(expected);
  });

  it("has a short form for list rows", () => {
    expect(
      [
        null,
        "2026-10-25",
        "2026-10-20",
        "2026-10-11",
        "2026-08-26",
        "2025-01-01",
      ].map((last) => cookedShort(last, today)),
    ).toEqual(["", "today", "5d", "2w", "2mo", "1y"]);
  });
});

describe("sortRecipes", () => {
  const recipes = [
    { title: "dal", last_cooked_on: day("2026-10-20") },
    { title: "Carbonara", last_cooked_on: null },
    { title: "Lasagna", last_cooked_on: day("2026-09-01") },
    { title: "apple pie", last_cooked_on: null },
    { title: "Burgers", last_cooked_on: day("2026-10-20") },
  ];

  it("sorts by name, ignoring case", () => {
    expect(sortRecipes(recipes, "title").map((r) => r.title)).toEqual([
      "apple pie",
      "Burgers",
      "Carbonara",
      "dal",
      "Lasagna",
    ]);
  });

  it("puts the ones made longest ago first and never-made ones last, each by name", () => {
    expect(sortRecipes(recipes, "cooked").map((r) => r.title)).toEqual([
      "Lasagna",
      "Burgers",
      "dal",
      "apple pie",
      "Carbonara",
    ]);
  });

  it.each(["title", "cooked"] as const)(
    "leaves the list it was given alone when sorting by %s",
    (sort) => {
      const given = [
        { title: "Pho", last_cooked_on: null },
        { title: "Dal", last_cooked_on: day("2026-10-20") },
      ];
      sortRecipes(given, sort);
      expect(given.map((r) => r.title)).toEqual(["Pho", "Dal"]);
    },
  );
});
