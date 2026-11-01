import { describe, expect, it } from "vitest";
import {
  groupSubpages,
  movePage,
  orderPrimaryPages,
  type PageKey,
  PRIMARY_PAGES,
} from "./pages";

describe("orderPrimaryPages", () => {
  it("keeps the default order when nothing is saved", () => {
    expect(orderPrimaryPages([])).toEqual(PRIMARY_PAGES);
  });

  it("applies a saved order", () => {
    const reversed = [...PRIMARY_PAGES].reverse();
    expect(orderPrimaryPages(reversed)).toEqual(reversed);
  });

  it("drops pages that are no longer in the sidebar", () => {
    const order = ["removed", ...PRIMARY_PAGES, "sessions"];
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

describe("movePage", () => {
  it("moves the page onto the other one", () => {
    const moved = movePage([], "today", "travel");
    expect(moved.slice(0, 3)).toEqual(["canvas", "travel", "today"]);
  });

  it("saves every page, so ones hidden from the sidebar keep their place", () => {
    const order = [...PRIMARY_PAGES].reverse();
    const moved = movePage(order, "recipes", "investments");
    const expected: PageKey[] = order.filter((key) => key !== "recipes");
    expected.splice(order.indexOf("investments"), 0, "recipes");
    expect(moved).toEqual(expected);
  });
});

describe("groupSubpages", () => {
  it("puts Screen time and Location history under Timeline, wherever they were", () => {
    const pages: PageKey[] = [
      "today",
      "activity",
      "timeline",
      "tasks",
      "googleTimeline",
    ];

    expect(groupSubpages(pages)).toEqual([
      { page: "today", subpages: [] },
      { page: "timeline", subpages: ["activity", "googleTimeline"] },
      { page: "tasks", subpages: [] },
    ]);
  });

  it("leaves out a subpage that's hidden", () => {
    expect(groupSubpages(["timeline", "googleTimeline"])).toEqual([
      { page: "timeline", subpages: ["googleTimeline"] },
    ]);
  });

  it("shows a subpage on its own when its parent is hidden", () => {
    expect(groupSubpages(["today", "activity"])).toEqual([
      { page: "today", subpages: [] },
      { page: "activity", subpages: [] },
    ]);
  });
});
