// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CalendarPicker, groupByAccount } from "./calendar-picker";
import type { CalendarAccount, CalendarInfo } from "./calendar-types";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const account = (
  id: string,
  email: string,
  provider: CalendarAccount["provider"] = "google",
): CalendarAccount => ({
  id,
  provider,
  email,
  lastSyncedAt: null,
  syncError: null,
  canWrite: true,
});
const calendar = (id: string, accountId: string): CalendarInfo => ({
  id,
  accountId,
  name: id,
  color: "#4986e7",
  hidden: false,
  writable: true,
  primary: false,
});

const accounts = [
  account("g1", "simon@gmail.com"),
  account("g2", "simon@risberg.eu"),
  account("i1", "Simon@risberg.eu", "icloud"),
  account("empty", "nothing@writable.com"),
];
const calendars = [
  calendar("Privat", "g1"),
  calendar("Familjen", "g1"),
  calendar("Work", "i1"),
  calendar("Risberg", "g2"),
];

describe("groupByAccount", () => {
  it("groups in account order, naming the provider only when emails clash", () => {
    expect(
      groupByAccount(calendars, accounts).map((g) => [
        g.account.id,
        g.provider,
        g.calendars.map((c) => c.id),
      ]),
    ).toEqual([
      ["g1", null, ["Privat", "Familjen"]],
      ["g2", "Google", ["Risberg"]],
      ["i1", "iCloud", ["Work"]],
    ]);
  });
});

describe("CalendarPicker", () => {
  it("lists calendars under their accounts and marks the chosen one", () => {
    const onChange = vi.fn();
    render(
      <CalendarPicker
        value="Familjen"
        calendars={calendars}
        accounts={accounts}
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Calendar" });
    expect(trigger.textContent).toContain("Familjen");

    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(screen.getByText("simon@gmail.com")).toBeTruthy();
    expect(screen.queryByText("nothing@writable.com")).toBeNull();
    const checked = screen
      .getAllByRole("menuitemradio")
      .filter((item) => item.getAttribute("aria-checked") === "true");
    expect(checked.map((item) => item.textContent)).toEqual(["Familjen"]);

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Work" }));
    expect(onChange).toHaveBeenCalledWith("Work");
  });
});
