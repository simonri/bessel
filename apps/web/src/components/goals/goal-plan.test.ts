import { describe, expect, it } from "vitest";
import { typicalDayLines } from "./goal-plan";

describe("typicalDayLines", () => {
  it("lists what there is data for, in the day's order", () => {
    expect(
      typicalDayLines({
        weekday: 1,
        weeks: 6,
        days: 5,
        wake: "12:25",
        asleep: "04:10",
        computer_from: "13:15",
        computer_until: "02:50",
        computer_hours: 9.5,
        tasks_completed: 0.4,
        gym_share: 0.33,
        steps: null,
      }),
    ).toEqual([
      "Up at 12:25",
      "At the computer 13:15-02:50, 9.5 h",
      "0.4 tasks done",
      "Gym 33% of them",
      "Asleep at 04:10",
    ]);
  });
});
