// @vitest-environment jsdom
import type { RecipeBody } from "@bessel/client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RecipeReader } from "./recipe-reader";

afterEach(cleanup);

const BURGER: RecipeBody = {
  yield_text: "3 burgare",
  total_minutes: 60,
  active_minutes: 10,
  ingredient_groups: [
    {
      title: "Puckarna",
      items: [
        { amount: 500, unit: "g", name: "nötfärs", note: "20 % fetthalt" },
        { amount: 0.5, unit: "tsk", name: "lökpulver" },
      ],
    },
    { items: [{ name: "Finrivet skal från ½ citron" }] },
  ],
  steps: [
    {
      title: "Gör dressingen",
      text: "Blanda **allt**.",
      time_label: "5 min + 30 min i kyl",
      callouts: [{ kind: "tip", label: "Proffstips", text: "Gurklag." }],
    },
    {
      text: "Hetta upp pannan.",
      callouts: [
        { kind: "warning", label: "Vanligaste misstaget", text: "Sval panna." },
      ],
    },
  ],
  sections: [{ title: "Varianter", text: "- **Oklahoma onions**" }],
};

it("lays out groups, quantities, steps, callouts and sections", () => {
  render(<RecipeReader title="Hamburgare" type="main" body={BURGER} />);

  expect(screen.getByText("3 burgare")).toBeTruthy();
  expect(screen.getByText("1 h")).toBeTruthy();
  expect(screen.getByText("10 min active")).toBeTruthy();
  expect(screen.getByText("Puckarna")).toBeTruthy();
  expect(screen.getByText("½ tsk")).toBeTruthy();
  expect(screen.getByText("Gör dressingen")).toBeTruthy();
  expect(screen.getByText("5 min + 30 min i kyl")).toBeTruthy();
  expect(screen.getByText("allt").tagName).toBe("STRONG");
  expect(screen.getByText("Proffstips:")).toBeTruthy();
  expect(screen.getByText("Vanligaste misstaget:")).toBeTruthy();
  expect(screen.getByText("Varianter")).toBeTruthy();
});

it("lets ingredients be ticked off", () => {
  render(<RecipeReader title="Hamburgare" type="main" body={BURGER} />);

  const beef = screen.getByRole("button", { name: /nötfärs/ });
  expect(beef.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(beef);
  expect(beef.getAttribute("aria-pressed")).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /lökpulver/ })
      .getAttribute("aria-pressed"),
  ).toBe("false");
});

it("nudges towards Edit when there's nothing written", () => {
  render(<RecipeReader title="" type="other" body={{}} />);
  expect(screen.getByText("Untitled")).toBeTruthy();
  expect(screen.getByText(/switch to Edit/)).toBeTruthy();
});
