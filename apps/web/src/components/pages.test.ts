import { describe, expect, it } from "vitest";
import { orderPrimaryPages, PRIMARY_PAGES } from "./pages";

describe("orderPrimaryPages", () => {
  it("keeps the default order when nothing is saved", () => {
    expect(orderPrimaryPages([])).toEqual(PRIMARY_PAGES);
  });

  it("applies a saved order", () => {
    const reversed = [...PRIMARY_PAGES].reverse();
    expect(orderPrimaryPages(reversed)).toEqual(reversed);
  });

  it("drops pages that are no longer in the sidebar", () => {
    const order = ["removed", ...PRIMARY_PAGES, "transactions"];
    expect(orderPrimaryPages(order)).toEqual(PRIMARY_PAGES);
  });

  it("puts pages missing from the saved order at their default slot", () => {
    const [first, second, ...rest] = PRIMARY_PAGES;
    expect(orderPrimaryPages([...rest].reverse())).toEqual([
      first,
      second,
      ...[...rest].reverse(),
    ]);
  });
});
