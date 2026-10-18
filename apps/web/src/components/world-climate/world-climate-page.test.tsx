// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorldClimatePage } from "./world-climate-page";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 0, 15));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const sweden = () =>
  document.querySelector('path[data-country="Sweden"]') as SVGPathElement;
const countryRows = () =>
  screen
    .getAllByRole("rowheader")
    .map((cell) => cell.textContent)
    .filter(Boolean);

const cityRows = () =>
  screen.getAllByRole("rowheader").map((cell) => cell.textContent ?? "");

describe("WorldClimatePage", () => {
  it("opens on the current month and recolours the map for another month", () => {
    render(<WorldClimatePage />);
    expect(
      screen
        .getByRole("button", { name: "January" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    const january = sweden().getAttribute("fill");

    fireEvent.click(screen.getByRole("button", { name: "July" }));

    expect(
      screen.getByRole("button", { name: "July" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(sweden().getAttribute("fill")).not.toBe(january);
    expect(screen.getByText(/^July on average/)).toBeTruthy();
  });

  it("steps through months with the arrow keys, wrapping around the year", () => {
    render(<WorldClimatePage />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(
      screen
        .getByRole("button", { name: "December" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      screen
        .getByRole("button", { name: "February" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("ranks countries warmest first and finds one by a city in it", () => {
    render(<WorldClimatePage />);
    const ranked = countryRows();
    expect(ranked.indexOf("Russia")).toBeGreaterThan(ranked.indexOf("Brazil"));

    fireEvent.change(screen.getByLabelText("Find a country or city"), {
      target: { value: "stockholm" },
    });
    expect(countryRows()).toEqual(["Sweden"]);
  });

  it("lists cities with their sea's temperature and distance for the month", () => {
    render(<WorldClimatePage />);
    fireEvent.click(screen.getByRole("button", { name: "Cities" }));
    fireEvent.change(screen.getByLabelText("Find a country or city"), {
      target: { value: "stockholm" },
    });
    const row = screen.getByRole("rowheader", { name: /Stockholm/ })
      .parentElement as HTMLElement;
    expect(row.textContent).toContain("−3\u00a0°C");
    expect(row.textContent).toContain("3\u00a0°C");
    expect(row.textContent).toContain("On the coast");

    fireEvent.click(screen.getByRole("button", { name: "July" }));
    expect(row.textContent).toContain("16\u00a0°C");
  });

  it("sorts cities by distance to the sea, nearest first, then flips", () => {
    render(<WorldClimatePage />);
    fireEvent.click(screen.getByRole("button", { name: "Cities" }));
    fireEvent.click(screen.getByRole("button", { name: "To the sea" }));
    const nearest = cityRows();
    expect(nearest.at(-1)).toMatch(/Dund-Us/);

    fireEvent.click(screen.getByRole("button", { name: "To the sea" }));
    expect(cityRows()[0]).toMatch(/Dund-Us/);
  });

  it("shows each city's country salary, tap water, HDI, malaria and Airbnb rules", () => {
    render(<WorldClimatePage />);
    fireEvent.click(screen.getByRole("button", { name: "Cities" }));
    const row = (city: RegExp) =>
      screen.getByRole("rowheader", { name: city })
        .parentElement as HTMLElement;
    const search = screen.getByLabelText("Find a country or city");

    fireEvent.change(search, { target: { value: "stockholm" } });
    expect(row(/Stockholm/).textContent).toContain("$2,752");
    expect(row(/Stockholm/).textContent).toContain("Safe");
    expect(row(/Stockholm/).textContent).toContain("Allowed");
    expect(row(/Stockholm/).textContent).toContain("0.959");
    expect(row(/Stockholm/).textContent).toContain("None");

    fireEvent.change(search, { target: { value: "lomé" } });
    expect(row(/Lomé/).textContent).toContain("0.571");
    expect(row(/Lomé/).textContent).toContain("High");

    fireEvent.change(search, { target: { value: "barcelona" } });
    expect(row(/Barcelona/).textContent).toContain("Restricted");

    fireEvent.change(search, { target: { value: "moscow" } });
    expect(row(/Moscow/).textContent).toContain("No data");
    expect(row(/Moscow/).textContent).toContain("Not available");

    fireEvent.change(search, { target: { value: "new delhi" } });
    expect(row(/New Delhi/).textContent).toContain("≈ $152");
    expect(row(/New Delhi/).textContent).toContain("Not safe");
  });

  it("sorts cities by salary, highest first, with no-data cities last both ways", () => {
    render(<WorldClimatePage />);
    fireEvent.click(screen.getByRole("button", { name: "Cities" }));
    const rowTexts = () =>
      screen
        .getAllByRole("rowheader")
        .map((cell) => cell.parentElement?.textContent ?? "");

    fireEvent.click(screen.getByRole("button", { name: "Salary" }));
    expect(rowTexts()[0]).toMatch(/^Bern/);
    expect(rowTexts().at(-1)).toContain("No data");

    fireEvent.click(screen.getByRole("button", { name: "Salary" }));
    expect(rowTexts()[0]).not.toContain("No data");
    expect(rowTexts().at(-1)).toContain("No data");
  });

  it("ranks cities by score for the month, best first, and explains each score", () => {
    render(<WorldClimatePage />);
    fireEvent.click(screen.getByRole("button", { name: "Cities" }));
    const scoreCells = () =>
      screen
        .getAllByRole("rowheader")
        .map((cell) => Number(cell.parentElement?.children[1]?.textContent));
    const january = scoreCells();
    expect(january[0]).toBeGreaterThanOrEqual(january[1]);
    expect(january[0]).toBeGreaterThan(january.at(-1) ?? 0);

    const best = screen
      .getAllByRole("rowheader")[0]
      .parentElement?.querySelector("[title]") as HTMLElement;
    expect(best.title).toMatch(
      /^Weather \d+\/50, Sea \d+\/30, Cheap \d+\/10, Airbnb \d+\/10(, Malaria -\d+)?(, HDI -\d+)?$/,
    );

    expect(screen.getByText(/Best for you in January/).textContent).toContain(
      screen.getAllByRole("rowheader")[0].textContent?.split(" - ")[0] ?? "",
    );
  });

  it("colours the map by score when asked", () => {
    render(<WorldClimatePage />);
    const brazil = () =>
      document
        .querySelector('path[data-country="Brazil"]')
        ?.getAttribute("fill");
    const byTemperature = brazil();
    fireEvent.click(screen.getByRole("button", { name: "Score" }));
    expect(
      screen
        .getByRole("button", { name: "Score" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(brazil()).not.toBe(byTemperature);
    expect(
      screen.getByRole("img", { name: "World map of city scores" }),
    ).toBeTruthy();
  });
});
