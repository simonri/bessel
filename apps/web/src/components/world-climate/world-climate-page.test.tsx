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
});
