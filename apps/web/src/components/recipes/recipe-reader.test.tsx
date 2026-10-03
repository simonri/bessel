// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RecipeReader } from "./recipe-reader";

afterEach(cleanup);

const CONTENT =
  "## Ingredients\n\n- 2 eggs\n- Flour\n\n## Steps\n\n1. Mix\n2. Bake";

it("shows a summary and lets ingredients be ticked off", () => {
  render(<RecipeReader title="Pancakes" type="dessert" content={CONTENT} />);

  expect(screen.getByText("2 ingredients - 2 steps")).toBeTruthy();
  const eggs = screen.getByRole("button", { name: "2 eggs" });
  expect(eggs.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(eggs);
  expect(eggs.getAttribute("aria-pressed")).toBe("true");
  // Steps are a numbered list, not tickable.
  expect(screen.queryByRole("button", { name: "Mix" })).toBeNull();
  expect(screen.getByText("Mix")).toBeTruthy();
});

it("nudges towards Edit when there's nothing written", () => {
  render(<RecipeReader title="" type="other" content="  " />);
  expect(screen.getByText("Untitled")).toBeTruthy();
  expect(screen.getByText(/switch to Edit/)).toBeTruthy();
});
