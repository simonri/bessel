import { describe, expect, it } from "vitest";
import {
  applyTemplate,
  dailyNoteRel,
  dailyNoteTemplateRel,
  formatDailyNoteName,
} from "./daily-notes";

// Wednesday, 2026-08-19, 09:05:07
const DATE = new Date(2026, 7, 19, 9, 5, 7);
// Sunday, 2026-01-04, 23:45:00 — exercises PM/leading-zero edge cases.
const PM_DATE = new Date(2026, 0, 4, 23, 45, 0);

describe("formatDailyNoteName", () => {
  it("formats YYYY-MM-DD", () => {
    expect(formatDailyNoteName("YYYY-MM-DD", DATE)).toBe("2026-08-19");
  });

  it("formats a path with folder segments", () => {
    expect(formatDailyNoteName("YYYY/MM/YYYY-MM-DD", DATE)).toBe(
      "2026/08/2026-08-19",
    );
  });

  it("formats full month/day names and an ordinal day", () => {
    expect(formatDailyNoteName("dddd, MMMM Do YYYY", DATE)).toBe(
      "Wednesday, August 19th 2026",
    );
  });

  it("formats short month/day names", () => {
    expect(formatDailyNoteName("ddd MMM D YY", DATE)).toBe("Wed Aug 19 26");
  });

  it("formats time as HH:mm", () => {
    expect(formatDailyNoteName("HH:mm", DATE)).toBe("09:05");
  });

  it("formats 12-hour time with AM/PM", () => {
    expect(formatDailyNoteName("h:mm a", PM_DATE)).toBe("11:45 pm");
    expect(formatDailyNoteName("hh:mm A", DATE)).toBe("09:05 AM");
  });

  it("formats seconds", () => {
    expect(formatDailyNoteName("HH:mm:ss", DATE)).toBe("09:05:07");
  });

  it("passes unsupported tokens through untouched", () => {
    expect(formatDailyNoteName("[Week] w, YYYY", DATE)).toBe("Week w, 2026");
  });

  it("supports escaped literal text", () => {
    expect(formatDailyNoteName("[Daily] YYYY-MM-DD", DATE)).toBe(
      "Daily 2026-08-19",
    );
  });

  it("handles ordinal suffixes correctly around 11-13", () => {
    expect(formatDailyNoteName("Do", new Date(2026, 0, 11))).toBe("11th");
    expect(formatDailyNoteName("Do", new Date(2026, 0, 12))).toBe("12th");
    expect(formatDailyNoteName("Do", new Date(2026, 0, 13))).toBe("13th");
    expect(formatDailyNoteName("Do", new Date(2026, 0, 1))).toBe("1st");
    expect(formatDailyNoteName("Do", new Date(2026, 0, 2))).toBe("2nd");
    expect(formatDailyNoteName("Do", new Date(2026, 0, 3))).toBe("3rd");
    expect(formatDailyNoteName("Do", new Date(2026, 0, 21))).toBe("21st");
  });
});

describe("dailyNoteRel", () => {
  it("builds the rel inside a folder", () => {
    expect(
      dailyNoteRel(
        { folder: "Journal", format: "YYYY-MM-DD", template: null },
        DATE,
      ),
    ).toBe("Journal/2026-08-19.md");
  });

  it("builds the rel at the vault root when folder is empty", () => {
    expect(
      dailyNoteRel({ folder: "", format: "YYYY-MM-DD", template: null }, DATE),
    ).toBe("2026-08-19.md");
  });

  it("defaults to YYYY-MM-DD when format is empty", () => {
    expect(dailyNoteRel({ folder: "", format: "", template: null }, DATE)).toBe(
      "2026-08-19.md",
    );
  });

  it("supports a nested date-based folder format", () => {
    expect(
      dailyNoteRel(
        { folder: "Journal", format: "YYYY/MM/YYYY-MM-DD", template: null },
        DATE,
      ),
    ).toBe("Journal/2026/08/2026-08-19.md");
  });

  it("strips leading/trailing slashes from the folder", () => {
    expect(
      dailyNoteRel(
        { folder: "/Journal/", format: "YYYY-MM-DD", template: null },
        DATE,
      ),
    ).toBe("Journal/2026-08-19.md");
  });
});

describe("dailyNoteTemplateRel", () => {
  it("returns null when there is no template", () => {
    expect(
      dailyNoteTemplateRel({
        folder: "",
        format: "YYYY-MM-DD",
        template: null,
      }),
    ).toBeNull();
  });

  it("adds .md when the template is stored without it", () => {
    expect(
      dailyNoteTemplateRel({
        folder: "",
        format: "YYYY-MM-DD",
        template: "Templates/Journal",
      }),
    ).toBe("Templates/Journal.md");
  });

  it("leaves .md alone when already present", () => {
    expect(
      dailyNoteTemplateRel({
        folder: "",
        format: "YYYY-MM-DD",
        template: "Templates/Journal.md",
      }),
    ).toBe("Templates/Journal.md");
  });

  it("strips leading/trailing slashes", () => {
    expect(
      dailyNoteTemplateRel({
        folder: "",
        format: "YYYY-MM-DD",
        template: "/Templates/Journal/",
      }),
    ).toBe("Templates/Journal.md");
  });
});

describe("applyTemplate", () => {
  it("expands {{date}} with the default format", () => {
    expect(
      applyTemplate("# {{date}}", { title: "2026-08-19", date: DATE }),
    ).toBe("# 2026-08-19");
  });

  it("expands {{date:FORMAT}}", () => {
    expect(applyTemplate("{{date:DD.MM}}", { title: "x", date: DATE })).toBe(
      "19.08",
    );
  });

  it("expands {{time}} with the default format", () => {
    expect(applyTemplate("{{time}}", { title: "x", date: DATE })).toBe("09:05");
  });

  it("expands {{time:FORMAT}}", () => {
    expect(applyTemplate("{{time:HH:mm:ss}}", { title: "x", date: DATE })).toBe(
      "09:05:07",
    );
  });

  it("expands {{title}}", () => {
    expect(
      applyTemplate("# {{title}}\n\nBody", { title: "2026-08-19", date: DATE }),
    ).toBe("# 2026-08-19\n\nBody");
  });

  it("expands all variables together", () => {
    const result = applyTemplate("{{title}} — {{date}} @ {{time}}", {
      title: "Note",
      date: DATE,
    });
    expect(result).toBe("Note — 2026-08-19 @ 09:05");
  });
});
