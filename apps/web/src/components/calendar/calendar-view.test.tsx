// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  type CalendarNavigation,
  CalendarView,
  type EventWriter,
} from "./calendar-page";
import type { CalendarAccount, CalendarInfo } from "./calendar-types";
import type { CalendarActions, CalendarData } from "./use-calendar-data";

const api = vi.hoisted(() => ({
  openSettings: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("@/components/settings-dialog", () => ({
  useOpenSettings: () => api.openSettings,
}));
vi.mock("./calendar-sidebar", () => ({ CalendarSidebar: () => null }));
vi.mock("sonner", () => ({
  toast: { info: api.toastInfo, error: vi.fn(), success: vi.fn() },
}));

beforeAll(() => {
  // Narrow, so the sidebar (which has its own connect button) stays closed.
  globalThis.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() {
      this.callback(
        [{ contentRect: { width: 600 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollTo = () => {};
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const days = [5, 6, 7, 8, 9, 10, 11].map((d) => new Date(2026, 9, d));
const nav: CalendarNavigation = {
  date: days[0],
  view: "week",
  days,
  setDate: () => {},
  setView: () => {},
};

const account: CalendarAccount = {
  id: "a",
  provider: "google",
  email: "me@example.com",
  lastSyncedAt: null,
  syncError: null,
  canWrite: true,
  canReadPeople: false,
};
const calendar: CalendarInfo = {
  id: "c",
  accountId: "a",
  name: "Me",
  color: "#4986e7",
  hidden: false,
  writable: true,
  primary: true,
};

function renderView(data: Partial<CalendarData>) {
  const { container } = render(
    <CalendarView
      nav={nav}
      data={{
        accounts: [],
        calendars: [],
        events: [],
        isLoading: false,
        ...data,
      }}
      actions={{} as CalendarActions}
      mutations={{ isSaving: false, isReplying: false } as EventWriter}
      timeZone="UTC"
      onTimeZoneChange={() => {}}
    />,
  );
  return container.querySelector(".select-none.touch-none") as HTMLElement;
}

function press(grid: HTMLElement) {
  fireEvent.pointerDown(grid, {
    button: 0,
    pointerId: 1,
    clientX: 10,
    clientY: 20,
  });
  fireEvent.pointerUp(grid, { pointerId: 1, clientX: 10, clientY: 20 });
}

describe("CalendarView with no calendar to add to", () => {
  it("explains a press on the grid and offers to connect one", () => {
    press(renderView({}));

    expect(api.toastInfo).toHaveBeenCalledTimes(1);
    const [message, options] = api.toastInfo.mock.calls[0];
    expect(message).toBe("Connect a calendar to add events");
    options.action.onClick();
    expect(api.openSettings).toHaveBeenCalledWith("integrations", "add");
  });

  it("says nothing while the accounts are still loading", () => {
    press(renderView({ isLoading: true }));
    expect(api.toastInfo).not.toHaveBeenCalled();
    expect(screen.queryByText(/No calendar connected/)).toBeNull();
  });

  it("starts a draft instead once a writable calendar is connected", () => {
    const grid = renderView({ accounts: [account], calendars: [calendar] });
    press(grid);
    fireEvent.doubleClick(grid, { clientX: 10, clientY: 20 });
    expect(api.toastInfo).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("New event")).toBeTruthy();
    expect(screen.queryByText(/No calendar connected/)).toBeNull();
  });

  it("with only read-only calendars, explains a press but not one that closes an event", () => {
    const grid = renderView({
      accounts: [{ ...account, canWrite: false }],
      calendars: [calendar],
      events: [
        {
          id: "e1",
          calendarId: "c",
          title: "Planning",
          allDay: false,
          start: new Date(Date.UTC(2026, 9, 6, 10)),
          end: new Date(Date.UTC(2026, 9, 6, 11)),
          details: {
            location: null,
            description: null,
            creatorName: null,
            creatorEmail: null,
            attendees: [],
            myResponse: null,
            colorId: null,
            conferenceUrl: null,
            htmlLink: null,
            busy: true,
            recurring: false,
            visibility: null,
            editable: false,
            rule: null,
            recurrence: null,
          },
        },
      ],
    });
    expect(screen.queryByText(/No calendar connected/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Planning/ }));
    press(grid);
    expect(api.toastInfo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Planning/ }));
    press(grid);
    expect(api.toastInfo).toHaveBeenCalledWith(
      "None of your shown calendars allow adding events",
      expect.anything(),
    );
  });

  it("points to Settings from the page when nothing is connected", () => {
    renderView({});
    fireEvent.click(screen.getByRole("button", { name: "Connect one" }));
    expect(api.openSettings).toHaveBeenCalledWith("integrations", "add");
  });
});
