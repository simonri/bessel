import { describe, expect, it } from "vitest";
import { tasksSentence } from "./tasks-page";

const none = { doing: 0, overdue: 0, dueToday: 0, doneToday: 0 };

describe("tasksSentence", () => {
  it("says what's ahead, then what's done", () => {
    expect(
      tasksSentence({ doing: 1, overdue: 1, dueToday: 2, doneToday: 3 }),
    ).toBe("1 in progress, 2 due today, 1 overdue - 3 tasks done today.");
  });

  it("is kind when today is clear", () => {
    expect(tasksSentence({ ...none, doneToday: 1 })).toBe(
      "Nothing left for today - 1 task done today.",
    );
    expect(tasksSentence(none)).toBe("Nothing due today.");
  });
});
