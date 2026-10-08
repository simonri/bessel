import type { TaskSchema } from "@bessel/client";
import { describe, expect, it } from "vitest";
import type { TimedCalendarEvent } from "@/components/calendar/calendar-types";
import {
  countdown,
  nextEvent,
  screenSentence,
  sleepSentence,
  todayTasks,
} from "./today-summary";

const NOW = new Date(2026, 9, 8, 14, 0);
const at = (h: number, m = 0) => new Date(2026, 9, 8, h, m);

function event(
  id: string,
  start: Date,
  end: Date,
  myResponse: TimedCalendarEvent["details"]["myResponse"] = null,
): TimedCalendarEvent {
  return {
    id,
    calendarId: "c",
    title: id,
    allDay: false,
    start,
    end,
    details: { myResponse } as TimedCalendarEvent["details"],
  };
}

describe("nextEvent", () => {
  it("prefers what's on now, skipping finished and declined events", () => {
    const next = nextEvent(
      [
        event("later", at(16), at(17)),
        event("over", at(9), at(10)),
        event("declined", at(14, 30), at(15), "declined"),
        event("now", at(13, 30), at(14, 30)),
      ],
      NOW,
    );
    expect(next?.event.id).toBe("now");
    expect(next?.ongoing).toBe(true);
  });

  it("is null when nothing is left", () => {
    expect(nextEvent([event("over", at(9), at(10))], NOW)).toBeNull();
  });
});

describe("countdown", () => {
  it.each([
    [at(14, 0), "now"],
    [at(14, 5), "in 5 min"],
    [at(16, 10), "in 2 h 10 min"],
    [at(17, 0), "in 3 h"],
    [new Date(2026, 9, 11, 14), "in 3 days"],
  ])("counts down to %s as %s", (to, label) => {
    expect(countdown(NOW, to)).toBe(label);
  });
});

describe("todayTasks", () => {
  const task = (title: string, extra: Partial<TaskSchema>) =>
    ({ id: title, title, status: "todo", ...extra }) as TaskSchema;

  it("lists what's in play, then up to three due, oldest first", () => {
    const result = todayTasks(
      [
        task("doing", { status: "in_progress" }),
        task("review", { status: "in_review" }),
        task("today 1", { due_date: at(9) }),
        task("today 2", { due_date: at(9) }),
        task("late", { due_date: new Date(2026, 9, 6) }),
        task("today 3", { due_date: at(9) }),
        task("next week", { due_date: new Date(2026, 9, 14) }),
      ],
      NOW,
    );
    expect(result.doing.map((t) => t.title)).toEqual(["doing"]);
    expect(result.inReview.map((t) => t.title)).toEqual(["review"]);
    expect(result.due.map((t) => t.title)).toEqual([
      "late",
      "today 1",
      "today 2",
    ]);
    expect(result.moreDue).toBe(1);
  });
});

describe("sentences", () => {
  it("describes last night", () => {
    expect(
      sleepSentence({
        asleep_secs: 7 * 3600 + 40 * 60,
        sleep_onset: "2026-10-08T01:10:00+02:00",
        wake_time: "2026-10-08T09:15:00+02:00",
      }),
    ).toBe("You slept 7h 40m, from 01:10 to 09:15.");
    expect(sleepSentence(null)).toBe("No sleep recorded last night.");
  });

  it("describes screen time so far", () => {
    expect(
      screenSentence({
        total_active_secs: 4 * 3600 + 12 * 60,
        apps: [{ app_class: "chromium" }],
      }),
    ).toBe("4h 12m at the computer so far, most of it in chromium.");
    expect(screenSentence(null)).toBe("No screen time yet today.");
  });
});
