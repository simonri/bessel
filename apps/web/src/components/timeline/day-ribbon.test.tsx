// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DayRibbon } from "./day-ribbon";
import type { RibbonLane } from "./day-summary";

afterEach(cleanup);

const DAY = Math.floor(new Date("2026-09-15T06:00:00").getTime() / 1000);
const block = { startTs: DAY + 3600, endTs: DAY + 7200, name: "x", hue: 200 };
const LANES: RibbonLane[] = [
  { key: "sleep", title: "Sleep", totalSecs: 3600, blocks: [block] },
  { key: "pc", title: "Screen time", totalSecs: 3600, blocks: [block] },
];

function ribbon(onOpenLane?: Parameters<typeof DayRibbon>[0]["onOpenLane"]) {
  render(
    <DayRibbon
      date={new Date(DAY * 1000)}
      lanes={LANES}
      startTs={DAY}
      endTs={DAY + 86400}
      nowTs={null}
      onOpenLane={onOpenLane}
    />,
  );
}

describe("DayRibbon lane links", () => {
  it("opens a lane's own page from its label", () => {
    const openScreenTime = vi.fn();
    ribbon({ pc: openScreenTime });

    fireEvent.click(screen.getByRole("button", { name: /Screen time/ }));

    expect(openScreenTime).toHaveBeenCalledOnce();
  });

  it("leaves lanes without a page as plain labels", () => {
    ribbon({ pc: vi.fn() });

    expect(screen.getByText("Sleep").closest("button")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("has no links at all where none are given, as on the Screen time page", () => {
    ribbon();

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
