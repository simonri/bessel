// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkDayHint, workDaysRange } from "./time-page";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WorkDayHint", () => {
  it("names the previous day while the work day hasn't turned", () => {
    vi.setSystemTime(new Date("2026-10-27T03:26:00Z"));
    render(<WorkDayHint timeZone="UTC" />);
    expect(
      screen.getByText("Before 04:00 - still counting Mon 26"),
    ).toBeTruthy();
  });

  it("still shows a minute before the day turns", () => {
    vi.setSystemTime(new Date("2026-10-27T03:59:00Z"));
    render(<WorkDayHint timeZone="UTC" />);
    expect(screen.queryByText(/still counting Mon 26/)).toBeTruthy();
  });

  it("is gone once the work day turns at 04:00", () => {
    vi.setSystemTime(new Date("2026-10-27T04:00:00Z"));
    const { container } = render(<WorkDayHint timeZone="UTC" />);
    expect(container.textContent).toBe("");
  });

  it("names the day before on the night the clocks fall back", () => {
    vi.stubEnv("TZ", "Europe/Stockholm");
    try {
      // 02:30 UTC is 03:30 in Stockholm, after the clocks went back an hour.
      vi.setSystemTime(new Date("2026-10-25T02:30:00Z"));
      render(<WorkDayHint timeZone="Europe/Stockholm" />);
      expect(
        screen.getByText("Before 04:00 - still counting Sat 24"),
      ).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reads the hour in the calendar's time zone, not the instant's", () => {
    // 03:30 in UTC is 04:30 in Stockholm (CET), past the day start there.
    vi.setSystemTime(new Date("2026-10-27T03:30:00Z"));
    const { container } = render(<WorkDayHint timeZone="Europe/Stockholm" />);
    expect(container.textContent).toBe("");
  });
});

describe("workDaysRange", () => {
  it("runs from 4am on the first day to 4am after the last", () => {
    expect(
      workDaysRange([new Date(2026, 9, 5), new Date(2026, 9, 6)], "UTC"),
    ).toEqual([
      new Date("2026-10-05T04:00:00Z"),
      new Date("2026-10-07T04:00:00Z"),
    ]);
  });

  describe("on DST days", () => {
    beforeEach(() => {
      vi.stubEnv("TZ", "Europe/Stockholm");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("starts at 4am on the clock after the clocks spring forward", () => {
      const springForward = new Date(2026, 2, 29);
      expect(workDaysRange([springForward], "Europe/Stockholm")).toEqual([
        new Date("2026-03-29T02:00:00Z"),
        new Date("2026-03-30T02:00:00Z"),
      ]);
    });

    it("ends at 4am on the clock after the clocks fall back", () => {
      const dayBefore = new Date(2026, 9, 24);
      expect(workDaysRange([dayBefore], "Europe/Stockholm")).toEqual([
        new Date("2026-10-24T02:00:00Z"),
        new Date("2026-10-25T03:00:00Z"),
      ]);
    });
  });
});
