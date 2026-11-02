import type { GoalScore } from "@bessel/client";
import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  progressLine,
  stepLine,
  toGoalCreate,
} from "./goal-utils";

function score(overrides: Partial<GoalScore> = {}): GoalScore {
  return {
    goal: {
      id: "g",
      created_at: "2026-11-02T00:00:00Z",
      modified_at: null,
      title: "Gym",
      metric: "gym_sessions",
      params: {},
      target: 3,
      comparison: "at_least",
      period: "week",
      deadline: null,
      sensitivity: "normal",
      why: null,
      position: 0,
    },
    unit: "sessions",
    current: { start: "2026-11-02", end: "2026-11-08", value: 1, met: false },
    history: [],
    streak: 0,
    step: null,
    step_met: null,
    measured: true,
    ...overrides,
  } as GoalScore;
}

describe("progressLine", () => {
  it("says where this period stands against the target", () => {
    expect(progressLine(score())).toBe("1 of 3 sessions this week");
  });

  it("reads a limit as a limit", () => {
    const limit = score({
      goal: { ...score().goal, comparison: "at_most", period: "month" },
      unit: "",
    });
    expect(progressLine(limit)).toBe("1 of at most 3 this month");
  });

  it("shows a level in its currency", () => {
    const money = score({
      goal: {
        ...score().goal,
        metric: "net_worth",
        target: 7_000_000,
        period: "none",
      },
      unit: "SEK",
      current: { ...score().current, value: 3_000_000 },
    });
    expect(progressLine(money)).toBe("SEK 3,000,000 of SEK 7,000,000");
  });
});

describe("stepLine", () => {
  it("names the next rung only while there is one", () => {
    expect(stepLine(score())).toBeNull();
    expect(stepLine(score({ step: 2 }))).toBe(
      "Next step: 2 sessions this week",
    );
  });
});

describe("toGoalCreate", () => {
  it("builds the body each metric needs", () => {
    expect(
      toGoalCreate({
        ...EMPTY_DRAFT,
        title: "Asleep by 00:30",
        metric: "sleep_before",
        target: "5",
      }),
    ).toMatchObject({
      metric: "sleep_before",
      params: { time: "00:30" },
      target: 5,
      period: "week",
    });
    expect(
      toGoalCreate({
        ...EMPTY_DRAFT,
        title: "See people",
        metric: "people_met",
        target: "1",
        excludeTags: "family, work ,",
      }),
    ).toMatchObject({ params: { exclude_tags: ["family", "work"] } });
    expect(
      toGoalCreate({
        ...EMPTY_DRAFT,
        title: "Company",
        metric: "net_worth",
        target: "7000000",
        currency: "sek",
        owner: "company",
      }),
    ).toMatchObject({
      period: "none",
      params: { currency: "SEK", owner: "company" },
    });
    // A weight is a level too, with no currency.
    expect(
      toGoalCreate({
        ...EMPTY_DRAFT,
        title: "Weight",
        metric: "body_weight",
        target: "77",
        atMost: true,
      }),
    ).toMatchObject({ period: "none", comparison: "at_most", params: {} });
  });

  it("says what's missing instead of sending it", () => {
    expect(toGoalCreate({ ...EMPTY_DRAFT, title: " " })).toBe(
      "Give it a name.",
    );
    expect(
      toGoalCreate({
        ...EMPTY_DRAFT,
        title: "x",
        metric: "wake_before",
        time: "8",
      }),
    ).toBe("The time is HH:MM.");
  });
});
