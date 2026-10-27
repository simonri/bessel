// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkDayHint } from "./time-page";

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

  it("reads the hour in the calendar's time zone, not the instant's", () => {
    // 03:30 in UTC is 04:30 in Stockholm (CET), past the day start there.
    vi.setSystemTime(new Date("2026-10-27T03:30:00Z"));
    const { container } = render(<WorkDayHint timeZone="Europe/Stockholm" />);
    expect(container.textContent).toBe("");
  });
});
