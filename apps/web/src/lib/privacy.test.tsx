// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Amount,
  HideAmountsButton,
  maskDigits,
  resetAmountsHiddenForTests,
  setAmountsHidden,
} from "./privacy";

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetAmountsHiddenForTests();
});

describe("Amount", () => {
  it("shows whole kronor until amounts are hidden, then never the real digits", () => {
    render(<Amount value={123456} />);
    expect(screen.getByText(/1\s235 kr/)).toBeTruthy();

    act(() => setAmountsHidden(true));

    expect(screen.queryByText(/1\s235/)).toBeNull();
    expect(screen.getByText("Amount hidden")).toBeTruthy();
    expect(screen.getByText(/^8\s888 kr$/)).toBeTruthy();
  });

  it("remembers the choice on this device", () => {
    render(<HideAmountsButton />);
    fireEvent.click(screen.getByRole("button", { name: "Hide amounts" }));
    cleanup();
    resetAmountsHiddenForTests();

    render(<Amount value={5000} />);

    expect(screen.getByText("Amount hidden")).toBeTruthy();
  });
});

describe("maskDigits", () => {
  it("keeps the shape of the amount", () => {
    expect(maskDigits("-1 234,5 mn kr")).toBe("-8 888,8 mn kr");
  });
});
