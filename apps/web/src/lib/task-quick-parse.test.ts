import { describe, expect, it } from "vitest";
import { dueLabel, parseQuickTask } from "./task-quick-parse";

// Wednesday 7 Oct 2026, mid-afternoon.
const NOW = new Date(2026, 9, 7, 15, 30);
const PROJECTS = ["Uni", "Travel", "Bessel Dev", "Bessel Web"];
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

const parse = (input: string) => parseQuickTask(input, PROJECTS, NOW);

describe("parseQuickTask", () => {
  it("leaves a plain title alone", () => {
    expect(parse("  Call   grandma ")).toEqual({
      title: "Call grandma",
      dueDate: null,
      project: null,
      priority: 0,
      tokens: [],
    });
  });

  it.each([
    ["today", day(2026, 10, 7), "Today"],
    ["tod", day(2026, 10, 7), "Today"],
    ["tonight", day(2026, 10, 7), "Today"],
    ["Tomorrow", day(2026, 10, 8), "Tomorrow"],
    ["tmr", day(2026, 10, 8), "Tomorrow"],
    ["tmrw", day(2026, 10, 8), "Tomorrow"],
    ["fri", day(2026, 10, 9), "Fri"],
    ["Friday", day(2026, 10, 9), "Fri"],
    ["mon", day(2026, 10, 12), "Mon"],
    // Same weekday as today means next week.
    ["wed", day(2026, 10, 14), "Oct 14"],
    ["next week", day(2026, 10, 12), "Mon"],
    ["in 3 days", day(2026, 10, 10), "Sat"],
    ["in 2 weeks", day(2026, 10, 21), "Oct 21"],
    ["5 nov", day(2026, 11, 5), "Nov 5"],
    ["nov 5", day(2026, 11, 5), "Nov 5"],
    ["5 november", day(2026, 11, 5), "Nov 5"],
    ["20/10", day(2026, 10, 20), "Oct 20"],
    // Already past this year: next year.
    ["5 oct", day(2027, 10, 5), "Oct 5"],
    ["1/3", day(2027, 3, 1), "Mar 1"],
  ])("reads %s as a due date", (phrase, date, label) => {
    const parsed = parse(`Essay draft ${phrase}`);
    expect(parsed.title).toBe("Essay draft");
    expect(parsed.dueDate).toEqual(date);
    expect(parsed.tokens).toEqual([{ kind: "due", text: phrase, label }]);
  });

  it("finds the date anywhere in the line", () => {
    const parsed = parse("tomorrow buy flowers for Ella");
    expect(parsed.title).toBe("buy flowers for Ella");
    expect(parsed.dueDate).toEqual(day(2026, 10, 8));
  });

  it("only uses the first date", () => {
    const parsed = parse("move fri to mon");
    expect(parsed.dueDate).toEqual(day(2026, 10, 9));
    expect(parsed.title).toBe("move to mon");
  });

  it("ignores numbers and words that aren't dates", () => {
    for (const text of [
      "buy 5 apples",
      "I may call",
      "in 3 hours",
      "31/2 thing",
      "monster hunt",
    ]) {
      const parsed = parse(text);
      expect(parsed.dueDate).toBeNull();
      expect(parsed.title).toBe(text);
    }
  });

  it("matches projects case-insensitively, by unique prefix too", () => {
    expect(parse("Read chapter #uni")).toMatchObject({
      title: "Read chapter",
      project: "Uni",
      tokens: [{ kind: "project", text: "#uni", label: "Uni" }],
    });
    expect(parse("Pack #trav").project).toBe("Travel");
  });

  it("keeps unknown or ambiguous tags in the title", () => {
    expect(parse("Fix bug #bessel")).toMatchObject({
      title: "Fix bug #bessel",
      project: null,
    });
    expect(parse("Selfie #ootd")).toMatchObject({
      title: "Selfie #ootd",
      project: null,
    });
  });

  it("reads ! and !! as High, !!! as Urgent", () => {
    expect(parse("Pay rent !")).toMatchObject({
      title: "Pay rent",
      priority: 3,
    });
    expect(parse("! Pay rent")).toMatchObject({
      title: "Pay rent",
      priority: 3,
    });
    expect(parse("Pay rent !!")).toMatchObject({
      title: "Pay rent",
      priority: 3,
    });
    expect(parse("Pay rent !!!")).toMatchObject({
      title: "Pay rent",
      priority: 4,
      tokens: [{ kind: "priority", text: "!!!", label: "Urgent" }],
    });
    expect(parse("Pay rent!!")).toMatchObject({
      title: "Pay rent",
      priority: 3,
    });
  });

  it("treats a single trailing ! as punctuation", () => {
    expect(parse("Hooray!")).toMatchObject({ title: "Hooray!", priority: 0 });
  });

  it("combines everything", () => {
    const parsed = parse("Finish psych essay fri #uni !!");
    expect(parsed).toMatchObject({
      title: "Finish psych essay",
      dueDate: day(2026, 10, 9),
      project: "Uni",
      priority: 3,
    });
    expect(parsed.tokens.map((t) => t.kind)).toEqual([
      "due",
      "project",
      "priority",
    ]);
  });

  it("never returns an empty title", () => {
    expect(parse("tomorrow #uni").title).toBe("tomorrow #uni");
  });

  it("takes a weekday as a date even mid-sentence (documented trade-off)", () => {
    const parsed = parse("Monday meeting notes");
    expect(parsed.title).toBe("meeting notes");
    expect(parsed.dueDate).toEqual(day(2026, 10, 12));
  });
});

describe("dueLabel", () => {
  it("shows near days by name and later ones by date", () => {
    expect(dueLabel(day(2026, 10, 7), NOW)).toBe("Today");
    expect(dueLabel(day(2026, 10, 8), NOW)).toBe("Tomorrow");
    expect(dueLabel(day(2026, 10, 13), NOW)).toBe("Tue");
    expect(dueLabel(day(2026, 10, 14), NOW)).toBe("Oct 14");
    expect(dueLabel(day(2026, 10, 6), NOW)).toBe("Oct 6");
  });
});
