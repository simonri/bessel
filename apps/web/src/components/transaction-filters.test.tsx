// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type TransactionFilters,
  TransactionFiltersBar,
} from "./transaction-filters";

function mount(filters: TransactionFilters, tags: string[], count?: number) {
  const onFiltersChange = vi.fn();
  render(
    <TransactionFiltersBar
      filters={filters}
      onFiltersChange={onFiltersChange}
      accounts={[]}
      categories={[]}
      tags={tags}
      toReviewCount={count}
    />,
  );
  return onFiltersChange;
}

afterEach(cleanup);

describe("the review filter", () => {
  it("says how many wait, and turns on and off", () => {
    const change = mount({ direction: "debit" }, [], 7);
    const chip = screen.getByRole("button", { name: /To review/ });
    expect(chip.textContent).toBe("To review7");
    fireEvent.click(chip);
    expect(change).toHaveBeenLastCalledWith({
      direction: "debit",
      to_review: true,
    });

    cleanup();
    const off = mount({ to_review: true }, [], 7);
    fireEvent.click(screen.getByRole("button", { name: /To review/ }));
    expect(off).toHaveBeenLastCalledWith({ to_review: undefined });
  });
});

describe("the tag filter", () => {
  it("is there only once the user has tags", () => {
    mount({}, []);
    expect(screen.queryByRole("button", { name: "Tag" })).toBeNull();
  });

  it("adds a picked tag to those chosen, and clears them", () => {
    const change = mount({ tag: ["Lisbon"] }, ["Lisbon", "Work"]);
    fireEvent.click(screen.getByRole("button", { name: /Lisbon/ }));
    fireEvent.click(screen.getByRole("checkbox", { checked: false }));
    expect(change).toHaveBeenLastCalledWith({ tag: ["Lisbon", "Work"] });
  });
});
