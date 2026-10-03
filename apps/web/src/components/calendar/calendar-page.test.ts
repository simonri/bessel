import { describe, expect, it } from "vitest";
import { defaultCalendarId } from "./calendar-page";
import type { CalendarInfo } from "./calendar-types";

const calendar = (id: string, primary = false): CalendarInfo => ({
  id,
  accountId: "a",
  name: id,
  color: "#000000",
  hidden: false,
  writable: true,
  primary,
});

describe("defaultCalendarId", () => {
  const writable = [calendar("work"), calendar("me", true)];

  it("prefers the last calendar used", () => {
    expect(defaultCalendarId(writable, "work")).toBe("work");
  });

  it("falls back to the primary calendar, then the first", () => {
    expect(defaultCalendarId(writable, "deleted")).toBe("me");
    expect(defaultCalendarId([calendar("x")], null)).toBe("x");
  });

  it("is null when nothing is writable", () => {
    expect(defaultCalendarId([], "work")).toBeNull();
  });
});
