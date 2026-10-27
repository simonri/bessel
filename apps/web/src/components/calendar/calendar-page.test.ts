import { describe, expect, it } from "vitest";
import { defaultCalendarId, noCalendarNotice } from "./calendar-page";
import type { CalendarAccount, CalendarInfo } from "./calendar-types";

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

describe("noCalendarNotice", () => {
  const account = (canWrite: boolean): CalendarAccount => ({
    id: "a",
    provider: "icloud",
    email: "me@example.com",
    lastSyncedAt: null,
    syncError: null,
    canWrite,
    canReadPeople: false,
  });

  it("sends a new user to add an account", () => {
    expect(noCalendarNotice([])).toEqual({
      message: "Connect a calendar to add events",
      action: "Connect",
      tab: "add",
    });
  });

  it("sends someone with only read-only or hidden calendars to their accounts", () => {
    expect(noCalendarNotice([account(false)])).toEqual({
      message: "None of your shown calendars allow adding events",
      action: "Manage accounts",
      tab: "connected",
    });
  });
});
