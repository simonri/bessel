import { describe, expect, it } from "vitest";
import { tasksSentence } from "./tasks-page";

const none = { doing: 0, inReview: 0, overdue: 0, dueToday: 0 };

describe("tasksSentence", () => {
  it("says what's ahead", () => {
    expect(
      tasksSentence({ doing: 1, inReview: 2, overdue: 1, dueToday: 2 }),
    ).toBe("1 in progress, 2 to review, 2 due today, 1 from earlier.");
  });

  it("says so when nothing is due", () => {
    expect(tasksSentence(none)).toBe("Nothing due today.");
  });
});
