// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CalendarAttendee, CalendarEvent } from "./calendar-types";
import {
  Avatar,
  avatarColor,
  canReply,
  initialOf,
  ParticipantEditor,
  ParticipantList,
  RsvpBar,
  responseSummary,
} from "./participants";
import { PeopleProvider } from "./people";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const guest = (
  email: string,
  response: CalendarAttendee["response"],
  extra: Partial<CalendarAttendee> = {},
): CalendarAttendee => ({
  email,
  name: null,
  response,
  isSelf: false,
  isOrganizer: false,
  photoUrl: null,
  ...extra,
});

const guests = [
  guest("dan@oh.xyz", "accepted"),
  guest("matthew@oh.xyz", "accepted", { isOrganizer: true }),
  guest("will@mistrezz.ai", "accepted", { name: "Will Owen" }),
  guest("simon@mistrezz.ai", "needs_action", { isSelf: true }),
  guest("cy@corp.com", "declined"),
];

describe("avatars", () => {
  it("use the first letter of the name, else the email", () => {
    expect(initialOf({ name: "Will Owen", email: "w@x.com" })).toBe("W");
    expect(initialOf({ name: null, email: "dan@oh.xyz" })).toBe("D");
    expect(initialOf({ name: "  ", email: "_ab@x.com" })).toBe("A");
    expect(initialOf({ name: "Ölof", email: "o@x.com" })).toBe("Ö");
  });

  it("keep one colour per person regardless of case", () => {
    expect(avatarColor("Dan@Oh.xyz")).toBe(avatarColor("dan@oh.xyz"));
  });

  it("show the contact's photo, falling back to the initial if it fails", () => {
    const { container } = render(
      <Avatar
        attendee={guest("a@x.com", "accepted")}
        name="Andrey"
        photoUrl="https://lh3/a"
      />,
    );
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.src).toBe("https://lh3/a");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");

    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("A");
  });

  it("badge only people who answered", () => {
    render(<Avatar attendee={guest("a@x.com", "accepted")} name={null} />);
    expect(screen.getByRole("img", { name: "Going" })).toBeTruthy();
    cleanup();
    render(<Avatar attendee={guest("a@x.com", "needs_action")} name={null} />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("ParticipantList", () => {
  it("summarises answers, lists the organizer first and names people", () => {
    expect(responseSummary(guests)).toBe("3 yes, 1 no, 1 awaiting");
    render(<ParticipantList attendees={guests} />);
    expect(screen.getByText("5 participants")).toBeTruthy();
    const rows = screen.getAllByRole("listitem");
    // No name anywhere: the address, never a guess from it.
    expect(rows[0].textContent).toBe("Mmatthew@oh.xyzOrganizer");
    expect(rows.map((r) => r.textContent)).toContain("WWill Owen");
  });

  it("reveals and copies a person's email with buttons", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <ParticipantList
        attendees={[
          guest("will@mistrezz.ai", "accepted", { name: "Will Owen" }),
        ]}
      />,
    );
    expect(screen.queryByText("will@mistrezz.ai")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show email" }));
    expect(screen.getByText("will@mistrezz.ai")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    expect(writeText).toHaveBeenCalledWith("will@mistrezz.ai");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide email" }));
    expect(screen.queryByText("will@mistrezz.ai")).toBeNull();
  });

  it("offers copy, not reveal, when the address is all we show", () => {
    render(
      <ParticipantList attendees={[guest("admin@mistrezz.ai", "accepted")]} />,
    );
    expect(screen.getByText("admin@mistrezz.ai")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show email" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy email" })).toBeTruthy();
  });

  it("collapses long lists behind Show all", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      guest(`p${String.fromCharCode(97 + i)}@x.com`, "accepted"),
    );
    render(<ParticipantList attendees={many} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show all 11" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(11);
  });

  it("prefers a name another event gave for the same address", () => {
    const event = {
      id: "e",
      calendarId: "c",
      title: "x",
      allDay: false,
      start: new Date(),
      end: new Date(),
      details: {
        attendees: [guest("dg@oh.xyz", "accepted", { name: "Dan Gordon" })],
        creatorEmail: null,
        creatorName: null,
      },
    } as unknown as CalendarEvent;
    render(
      <PeopleProvider events={[event]}>
        <ParticipantList attendees={[guest("DG@oh.xyz", "accepted")]} />
      </PeopleProvider>,
    );
    expect(screen.getByText("Dan Gordon")).toBeTruthy();
  });
});

describe("ParticipantEditor", () => {
  const known = {
    id: "e",
    calendarId: "c",
    title: "x",
    allDay: false,
    start: new Date(),
    end: new Date(),
    details: {
      attendees: [
        guest("andrey@oh.xyz", "accepted", { name: "Andrey Grushevskiy" }),
        guest("dan@oh.xyz", "accepted"),
      ],
      creatorEmail: null,
      creatorName: null,
    },
  } as unknown as CalendarEvent;

  function setup(emails: string[] = []) {
    const onChange = vi.fn();
    render(
      <PeopleProvider events={[known]}>
        <ParticipantEditor emails={emails} known={[]} onChange={onChange} />
      </PeopleProvider>,
    );
    return { onChange, input: screen.getByLabelText("Add participant") };
  }

  it("suggests people from other events by name and adds with Enter", () => {
    const { onChange, input } = setup();
    fireEvent.change(input, { target: { value: "gru" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "AAndrey Grushevskiyandrey@oh.xyz",
    ]);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["andrey@oh.xyz"]);
  });

  it("moves through suggestions with the arrow keys", () => {
    const { onChange, input } = setup();
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("adds a typed address nobody has used yet, and rejects junk", () => {
    const { onChange, input } = setup();
    fireEvent.change(input, { target: { value: "New.Person@Example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["new.person@example.com"]);

    fireEvent.change(input, { target: { value: "zzz" } });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("doesn't suggest people already invited, and removes them", () => {
    const { onChange, input } = setup(["dan@oh.xyz"]);
    fireEvent.change(input, { target: { value: "dan" } });
    expect(screen.queryAllByRole("option")).toEqual([]);
    fireEvent.click(screen.getByLabelText("Remove dan@oh.xyz"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe("canReply", () => {
  it("only for guests who aren't organizing", () => {
    expect(canReply(guests)).toBe(true);
    expect(
      canReply([
        guest("me@x.com", "accepted", { isSelf: true, isOrganizer: true }),
      ]),
    ).toBe(false);
    expect(canReply([guest("other@x.com", "accepted")])).toBe(false);
  });
});

describe("RsvpBar", () => {
  it("answers a single event directly and marks the current answer", () => {
    const onReply = vi.fn();
    render(<RsvpBar value="tentative" recurring={false} onReply={onReply} />);
    expect(
      screen
        .getByRole("button", { name: "Maybe" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(onReply).toHaveBeenCalledWith("accepted", "this");
  });

  it("asks which occurrences for a repeating event", () => {
    const onReply = vi.fn();
    render(<RsvpBar value="needs_action" recurring onReply={onReply} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "No" }), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "All events" }));
    expect(onReply).toHaveBeenCalledWith("declined", "all");
  });
});
