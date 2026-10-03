// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  CalendarAccount,
  CalendarEvent,
  CalendarInfo,
} from "./calendar-types";
import { EventPopover, readOnlyReason } from "./event-details-popover";

beforeAll(() => {
  // Radix popper measures its anchor with ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const account: CalendarAccount = {
  id: "a",
  provider: "google",
  email: "me@gmail.com",
  lastSyncedAt: null,
  syncError: null,
  canWrite: true,
  canReadPeople: true,
};
const calendar: CalendarInfo = {
  id: "c",
  accountId: "a",
  name: "Familjen",
  color: "#4986e7",
  hidden: false,
  writable: true,
  primary: true,
};

function event(id: string, title: string, editable = true): CalendarEvent {
  return {
    id,
    calendarId: "c",
    title,
    allDay: false,
    start: new Date(2026, 9, 6, 10),
    end: new Date(2026, 9, 6, 11),
    details: {
      location: null,
      description: null,
      creatorName: null,
      creatorEmail: "boss@corp.com",
      attendees: [],
      myResponse: null,
      colorId: null,
      conferenceUrl: null,
      htmlLink: null,
      busy: true,
      recurring: false,
      visibility: null,
      editable,
      rule: null,
      recurrence: null,
    },
  };
}

describe("readOnlyReason", () => {
  it("explains why an event can't be edited", () => {
    expect(readOnlyReason(event("e", "x"), calendar, account)).toBeNull();
    expect(
      readOnlyReason(event("e", "x"), calendar, {
        ...account,
        canWrite: false,
      }),
    ).toBe("reconnect");
    expect(
      readOnlyReason(
        event("e", "x"),
        { ...calendar, writable: false },
        account,
      ),
    ).toBe("calendar");
    expect(readOnlyReason(event("e", "x", false), calendar, account)).toBe(
      "invitation",
    );
    expect(readOnlyReason(event("e", "x"), undefined, undefined)).toBe(
      "reconnect",
    );
  });
});

describe("EventPopover", () => {
  function popover(
    shown: CalendarEvent | null,
    handlers: {
      onSave?: () => void;
      onDelete?: () => void;
      onReply?: () => void;
    } = {},
  ) {
    const anchor = document.body.appendChild(document.createElement("div"));
    const timed = shown && !shown.allDay ? shown : null;
    const start = timed?.start ?? new Date(2026, 9, 6, 12);
    const end = timed?.end ?? new Date(2026, 9, 6, 13);
    return (
      <EventPopover
        subject={{
          event: shown,
          timing: { allDay: false, start, end },
          calendarId: "c",
        }}
        anchor={anchor}
        calendars={[calendar]}
        writableCalendars={[calendar]}
        accounts={[account]}
        timeZone="Europe/Stockholm"
        saving={false}
        onSave={handlers.onSave ?? vi.fn()}
        onDelete={handlers.onDelete ?? vi.fn()}
        onReply={handlers.onReply ?? vi.fn()}
        replying={false}
        onReconnect={vi.fn()}
        onClose={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    );
  }

  const openMenu = () =>
    fireEvent.keyDown(screen.getByTitle("More actions"), { key: "Enter" });

  it("hides the save bar until something changes", () => {
    render(popover(event("a", "First")));
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: "Cafe" },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("always offers Create for a new event", () => {
    render(popover(null));
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
    expect(screen.queryByTitle("More actions")).toBeNull();
  });

  it("saves a picked end time with only the timing changed", () => {
    const onSave = vi.fn();
    render(popover(event("a", "First"), { onSave }));

    fireEvent.click(screen.getByLabelText("End time"));
    fireEvent.click(screen.getByRole("option", { name: /12:30 PM/ }));
    expect(screen.getByLabelText("End time").textContent).toBe("12:30 PM");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      changes: {
        timing: {
          allDay: false,
          start: new Date(2026, 9, 6, 10),
          end: new Date(2026, 9, 6, 12, 30),
        },
      },
      calendarId: "c",
      scope: undefined,
      notifyGuests: false,
    });
  });

  it("the all-day switch turns the event into a whole day", () => {
    render(popover(event("a", "First")));
    fireEvent.click(screen.getByRole("switch", { name: "All-day" }));

    expect(screen.getByLabelText("Start date").textContent).toBe("Tue Oct 6");
    expect(screen.queryByLabelText("Start time")).toBeNull();
    expect(screen.getByText("1 day")).toBeTruthy();
  });

  it("deletes a one-off event from the menu after confirming", () => {
    const onDelete = vi.fn();
    render(popover(event("a", "First"), { onDelete }));

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Delete this event?")).toBeTruthy();
    // No guests: nobody to email.
    expect(screen.queryByLabelText(/Email guests/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(undefined, false);
  });

  it("lets the user choose not to email guests about a deletion", () => {
    const onDelete = vi.fn();
    const withGuests = event("a", "First");
    withGuests.details.attendees = [
      {
        email: "al@x.com",
        name: null,
        response: "accepted",
        isSelf: false,
        isOrganizer: false,
        photoUrl: null,
      },
    ];
    render(popover(withGuests, { onDelete }));

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(screen.getByLabelText(/Email guests/));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(undefined, false);
  });

  it("deletes a repeating event with the chosen scope", () => {
    const onDelete = vi.fn();
    const repeating = event("a", "Standup");
    repeating.details.recurring = true;
    render(popover(repeating, { onDelete }));

    openMenu();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Delete" }), {
      key: "ArrowRight",
    });
    fireEvent.click(
      screen.getByRole("menuitem", { name: "This and following events" }),
    );
    expect(screen.getByText("Delete this and following events?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith("following", false);
  });

  it("can't delete invitations", () => {
    render(popover(event("i", "Boss meeting", false)));
    expect(screen.queryByTitle("More actions")).toBeNull();
  });

  it("starts each event clean, without the previous one's unsaved state", () => {
    const { rerender } = render(popover(event("a", "First")));
    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: "Cafe" },
    });
    fireEvent.click(screen.getByTitle("Close"));
    expect(screen.getByText("Discard unsaved changes?")).toBeTruthy();

    rerender(popover(event("b", "Second")));

    expect(screen.queryByText("Discard unsaved changes?")).toBeNull();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Second",
    );
    expect((screen.getByLabelText("Location") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("shows invitations read-only, without a notice", () => {
    render(popover(event("i", "Boss meeting", false)));
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(screen.getByText("Boss meeting")).toBeTruthy();
    expect(screen.queryByText(/organizer can change/)).toBeNull();
  });

  it("shows a read-only calendar's event without a notice", () => {
    render(
      <EventPopover
        {...popover(event("r", "Holiday")).props}
        calendars={[{ ...calendar, writable: false }]}
      />,
    );
    expect(screen.getByText("Holiday")).toBeTruthy();
    expect(screen.queryByText(/read-only/)).toBeNull();
  });

  it("offers to reconnect an account connected without edit access", () => {
    render(
      <EventPopover
        {...popover(event("r", "Planning")).props}
        accounts={[{ ...account, canWrite: false }]}
      />,
    );
    expect(screen.getByText(/connected read-only/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Reconnect to edit" }),
    ).toBeTruthy();
  });

  it("lets a guest answer an invitation they can't edit", () => {
    const onReply = vi.fn();
    const invite = event("i", "Mistrezz.AI x OhAPI", false);
    invite.details.myResponse = "needs_action";
    invite.details.attendees = [
      {
        email: "boss@corp.com",
        name: null,
        response: "accepted",
        isSelf: false,
        isOrganizer: true,
        photoUrl: null,
      },
      {
        email: "me@gmail.com",
        name: null,
        response: "needs_action",
        isSelf: true,
        isOrganizer: false,
        photoUrl: null,
      },
    ];
    render(popover(invite, { onReply }));

    expect(screen.getByText("2 participants")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Maybe" }));
    expect(onReply).toHaveBeenCalledWith("tentative", "this");
  });

  it("shows no answer buttons to the organizer", () => {
    const mine = event("m", "My meeting");
    mine.details.myResponse = "accepted";
    mine.details.attendees = [
      {
        email: "me@gmail.com",
        name: null,
        response: "accepted",
        isSelf: true,
        isOrganizer: true,
        photoUrl: null,
      },
      {
        email: "al@x.com",
        name: null,
        response: "needs_action",
        isSelf: false,
        isOrganizer: false,
        photoUrl: null,
      },
    ];
    render(popover(mine));
    expect(screen.queryByRole("group", { name: "Going?" })).toBeNull();
  });
});
