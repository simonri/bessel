// @vitest-environment jsdom
import {
  ContextMenuContent,
  ContextMenuItem,
} from "@bessel/ui/components/context-menu";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "./calendar-types";
import { TimeGrid } from "./time-grid";

beforeAll(() => {
  // jsdom has neither pointer capture nor PointerEvent.
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  if (!("PointerEvent" in window)) {
    class PointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    Object.assign(window, { PointerEvent });
  }
});
afterEach(cleanup);

const days = [5, 6, 7, 8, 9, 10, 11].map((d) => new Date(2026, 9, d));
const event: CalendarEvent = {
  id: "e1",
  calendarId: "c",
  title: "Planning",
  allDay: false,
  start: new Date(2026, 9, 6, 10),
  end: new Date(2026, 9, 6, 11),
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
    editable: true,
    rule: null,
    recurrence: null,
  },
};

function renderGrid(editable: boolean, shown: CalendarEvent = event) {
  const onSelectEvent = vi.fn();
  const onMove = vi.fn();
  const onCreate = vi.fn();
  render(
    <TimeGrid
      days={days}
      events={[shown]}
      colorOf={() => "#4986e7"}
      selectedEventId={null}
      editableIds={new Set(editable ? ["e1"] : [])}
      canCreate
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
      onTimeZoneChange={() => {}}
      onSelectDay={() => {}}
      onSelectEvent={onSelectEvent}
      onSelectedAnchor={() => {}}
      onCreate={onCreate}
      onMove={onMove}
    />,
  );
  return {
    onSelectEvent,
    onMove,
    onCreate,
    chip: screen.getByRole("button", { name: /Planning/ }),
  };
}

describe("TimeGrid", () => {
  it("a press without movement on an editable event selects it once", () => {
    const { onSelectEvent, onMove, chip } = renderGrid(true);
    const grid = chip.closest(".touch-none") as HTMLElement;

    fireEvent.pointerDown(chip, {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    // Pointer capture delivers the release (and click) to the grid.
    fireEvent.pointerUp(grid, {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.click(chip);

    expect(onSelectEvent).toHaveBeenCalledTimes(1);
    expect(onSelectEvent).toHaveBeenCalledWith("e1");
    expect(onMove).not.toHaveBeenCalled();
  });

  it("read-only events select on click and can't be dragged", () => {
    const { onSelectEvent, onMove, chip } = renderGrid(false);
    fireEvent.pointerDown(chip, {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.click(chip);
    expect(onSelectEvent).toHaveBeenCalledWith("e1");
    expect(onMove).not.toHaveBeenCalled();
  });

  it("a drag past the threshold moves instead of selecting", () => {
    const { onSelectEvent, onMove, chip } = renderGrid(true);
    const grid = chip.closest(".touch-none") as HTMLElement;

    fireEvent.pointerDown(chip, {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(grid, {
      pointerId: 1,
      clientX: 10,
      clientY: 10 + 48,
    });
    fireEvent.pointerUp(grid, { pointerId: 1, clientX: 10, clientY: 10 + 48 });

    expect(onSelectEvent).not.toHaveBeenCalled();
    expect(onMove).toHaveBeenCalledTimes(1);
    const [, timing] = onMove.mock.calls[0];
    expect(timing.start).toEqual(new Date(2026, 9, 6, 11));
    expect(timing.end).toEqual(new Date(2026, 9, 6, 12));
  });

  describe("creating", () => {
    const press = (target: HTMLElement, grid: HTMLElement, y: number) => {
      fireEvent.pointerDown(target, {
        button: 0,
        pointerId: 1,
        clientX: 10,
        clientY: y,
      });
      fireEvent.pointerUp(grid, { pointerId: 1, clientX: 10, clientY: y });
      fireEvent.click(grid, { clientX: 10, clientY: y });
    };
    const columns = (chip: HTMLElement) =>
      chip.closest(".touch-none") as HTMLElement;
    const allDayRow = () =>
      document.querySelector(".touch-none.border-y") as HTMLElement;

    it("a single click on empty time doesn't create an event", () => {
      const { onCreate, chip } = renderGrid(true);
      press(columns(chip), columns(chip), 9 * 48);
      expect(onCreate).not.toHaveBeenCalled();
    });

    it("a double click on empty time creates an hour at that slot", () => {
      const { onCreate, chip } = renderGrid(true);
      const grid = columns(chip);
      press(grid, grid, 9 * 48 + 20);
      press(grid, grid, 9 * 48 + 20);
      fireEvent.doubleClick(grid, { clientX: 10, clientY: 9 * 48 + 20 });

      expect(onCreate).toHaveBeenCalledTimes(1);
      expect(onCreate).toHaveBeenCalledWith({
        allDay: false,
        start: new Date(2026, 9, 5, 9, 15),
        end: new Date(2026, 9, 5, 10, 15),
      });
    });

    it("a drag on empty time creates the dragged range", () => {
      const { onCreate, chip } = renderGrid(true);
      const grid = columns(chip);
      fireEvent.pointerDown(grid, {
        button: 0,
        pointerId: 1,
        clientX: 10,
        clientY: 13 * 48,
      });
      fireEvent.pointerMove(grid, {
        pointerId: 1,
        clientX: 10,
        clientY: 14 * 48,
      });
      fireEvent.pointerUp(grid, {
        pointerId: 1,
        clientX: 10,
        clientY: 14 * 48,
      });

      expect(onCreate).toHaveBeenCalledWith({
        allDay: false,
        start: new Date(2026, 9, 5, 13),
        end: new Date(2026, 9, 5, 14, 15),
      });
    });

    it("double clicking an event after clicking empty time doesn't create one", () => {
      const { onCreate, chip } = renderGrid(true);
      const grid = columns(chip);
      // An earlier press on empty time must not count for the event's clicks.
      press(grid, grid, 15 * 48);
      press(chip, grid, 10);
      press(chip, grid, 10);
      fireEvent.doubleClick(grid, { clientX: 10, clientY: 10 });
      expect(onCreate).not.toHaveBeenCalled();
    });

    it("double clicking an event doesn't create one", () => {
      const { onCreate, chip } = renderGrid(true);
      const grid = columns(chip);
      press(chip, grid, 10);
      press(chip, grid, 10);
      // Pointer capture retargets the double click to the grid.
      fireEvent.doubleClick(grid, { clientX: 10, clientY: 10 });
      expect(onCreate).not.toHaveBeenCalled();
    });

    it("all-day row: a click doesn't create, a double click does", () => {
      const { onCreate } = renderGrid(true);
      const row = allDayRow();
      press(row, row, 5);
      expect(onCreate).not.toHaveBeenCalled();

      press(row, row, 5);
      fireEvent.doubleClick(row, { clientX: 10, clientY: 5 });
      expect(onCreate).toHaveBeenCalledWith({
        allDay: true,
        start: days[0],
        end: new Date(2026, 9, 6),
      });
    });
  });

  it("outlines unanswered invitations with dashes", () => {
    const invite = {
      ...event,
      details: { ...event.details, myResponse: "needs_action" as const },
    };
    const { chip } = renderGrid(false, invite);
    expect(chip.className).toContain("border-dashed");
    cleanup();

    const answered = {
      ...event,
      details: { ...event.details, myResponse: "accepted" as const },
    };
    expect(renderGrid(false, answered).chip.className).not.toContain(
      "border-dashed",
    );
  });

  it("resizes from either edge, with no visible grab bar", () => {
    const { onMove, chip } = renderGrid(true);
    const grid = chip.closest(".touch-none") as HTMLElement;
    const edge = (name: string) =>
      chip.querySelector(`[data-resize-edge="${name}"]`) as HTMLElement;
    expect(edge("start").childElementCount).toBe(0);
    expect(edge("end").childElementCount).toBe(0);

    fireEvent.pointerDown(edge("start"), {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(grid, {
      pointerId: 1,
      clientX: 10,
      clientY: 10 - 24,
    });
    fireEvent.pointerUp(grid, { pointerId: 1, clientX: 10, clientY: 10 - 24 });
    expect(onMove.mock.calls[0][1]).toMatchObject({
      start: new Date(2026, 9, 6, 9, 30),
      end: new Date(2026, 9, 6, 11),
    });

    fireEvent.pointerDown(edge("end"), {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 40,
    });
    fireEvent.pointerMove(grid, {
      pointerId: 1,
      clientX: 10,
      clientY: 40 + 24,
    });
    fireEvent.pointerUp(grid, { pointerId: 1, clientX: 10, clientY: 40 + 24 });
    expect(onMove.mock.calls[1][1]).toMatchObject({
      start: new Date(2026, 9, 6, 10),
      end: new Date(2026, 9, 6, 11, 30),
    });
  });

  it("fills an event with its own colour, keeps the calendar's bar, and opens its menu on right-click", () => {
    const coloured = { ...event, details: { ...event.details, colorId: "11" } };
    const renderMenu = vi.fn(() => null);
    render(
      <TimeGrid
        days={days}
        events={[coloured]}
        colorOf={() => "#4986e7"}
        selectedEventId={null}
        editableIds={new Set(["e1"])}
        renderMenu={renderMenu}
        canCreate
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        onTimeZoneChange={() => {}}
        onSelectDay={() => {}}
        onSelectEvent={() => {}}
        onSelectedAnchor={() => {}}
        onCreate={() => {}}
        onMove={() => {}}
      />,
    );
    const chip = screen.getByRole("button", { name: /Planning/ });
    // The bar keeps the calendar's colour; the event's own colour fills it.
    expect(chip.style.borderLeftColor).toBe("rgb(73, 134, 231)");
    // Mixed into the background, not transparent: grid lines stay hidden.
    expect(chip.style.background).toBe(
      "color-mix(in oklab, #e5534b 28%, var(--background))",
    );
    expect(renderMenu).toHaveBeenCalledWith(coloured, expect.any(Function));
  });

  it("ignores presses inside an event's menu, which React bubbles to the grid", () => {
    const onCreate = vi.fn();
    const onPick = vi.fn();
    render(
      <TimeGrid
        days={days}
        events={[event]}
        colorOf={() => "#4986e7"}
        selectedEventId={null}
        editableIds={new Set(["e1"])}
        renderMenu={() => (
          <ContextMenuContent>
            <ContextMenuItem onSelect={onPick}>Pick</ContextMenuItem>
          </ContextMenuContent>
        )}
        canCreate
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        onTimeZoneChange={() => {}}
        onSelectDay={() => {}}
        onSelectEvent={() => {}}
        onSelectedAnchor={() => {}}
        onCreate={onCreate}
        onMove={() => {}}
      />,
    );
    const chip = screen.getByRole("button", { name: /Planning/ });
    const grid = chip.closest(".touch-none") as HTMLElement;
    fireEvent.contextMenu(chip);
    const item = screen.getByRole("menuitem", { name: "Pick" });

    fireEvent.pointerDown(item, {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 13 * 48,
    });
    fireEvent.pointerMove(grid, {
      pointerId: 1,
      clientX: 10,
      clientY: 15 * 48,
    });
    fireEvent.pointerUp(grid, { pointerId: 1, clientX: 10, clientY: 15 * 48 });
    fireEvent.doubleClick(item);
    expect(onCreate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("menuitem", { name: "Pick" }));
    expect(onPick).toHaveBeenCalled();
  });

  it("keeps events opaque, past ones muted, and the selected one free of hover", () => {
    const past = {
      ...event,
      id: "old",
      title: "Old",
      start: new Date(2020, 0, 1, 9),
      end: new Date(2020, 0, 1, 10),
    };
    render(
      <TimeGrid
        days={[new Date(2020, 0, 1), ...days.slice(1)]}
        events={[past, event]}
        colorOf={() => "#4986e7"}
        selectedEventId="e1"
        editableIds={new Set()}
        canCreate
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        onTimeZoneChange={() => {}}
        onSelectDay={() => {}}
        onSelectEvent={() => {}}
        onSelectedAnchor={() => {}}
        onCreate={() => {}}
        onMove={() => {}}
      />,
    );
    const old = screen.getByRole("button", { name: /Old/ });
    expect(old.className).not.toMatch(/opacity/);
    expect(old.style.background).toBe(
      "color-mix(in oklab, #4986e7 13%, var(--background))",
    );
    expect(old.className).toContain("hover:brightness-125");
    const selected = screen.getByRole("button", { name: /Planning/ });
    expect(selected.className).not.toContain("hover:brightness");
  });

  it("shows a day on double-click of its header, not a single click", () => {
    const onSelectDay = vi.fn();
    render(
      <TimeGrid
        days={days}
        events={[]}
        colorOf={() => "#4986e7"}
        selectedEventId={null}
        editableIds={new Set()}
        canCreate
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        onTimeZoneChange={() => {}}
        onSelectDay={onSelectDay}
        onSelectEvent={() => {}}
        onSelectedAnchor={() => {}}
        onCreate={() => {}}
        onMove={() => {}}
      />,
    );
    const header = screen.getByRole("button", { name: /Tue\s*6/ });
    fireEvent.click(header);
    expect(onSelectDay).not.toHaveBeenCalled();
    fireEvent.doubleClick(header);
    expect(onSelectDay).toHaveBeenCalledWith(days[1]);
  });
});
