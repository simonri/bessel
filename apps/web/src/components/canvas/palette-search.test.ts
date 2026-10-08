// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  hitsFromNotes,
  hitsFromSearch,
  loadRecents,
  rememberRecent,
} from "./palette-search";

describe("hitsFromSearch", () => {
  it("turns each kind into a row, events with when they are", () => {
    const hits = hitsFromSearch({
      tasks: [{ id: "t1", title: "Book dentist", status: "in_review" }],
      events: [
        {
          id: "e1",
          title: "Dentist",
          all_day: false,
          start_at: new Date(2026, 9, 9, 14, 30),
          start_date: null,
        },
        {
          id: "e2",
          title: "Holiday",
          all_day: true,
          start_at: null,
          start_date: new Date(Date.UTC(2026, 11, 24)),
        },
      ],
      recipes: [{ id: "r1", title: "Granola" }],
      places: [{ id: "p1", name: "Smile clinic", address: null }],
    });
    expect(hits.map((h) => [h.kind, h.label, h.sublabel])).toEqual([
      ["task", "Book dentist", "In review"],
      ["event", "Dentist", "Fri 9 Oct 2026, 14:30"],
      ["event", "Holiday", "Thu 24 Dec 2026"],
      ["recipe", "Granola", undefined],
      ["place", "Smile clinic", undefined],
    ]);
    expect(hits[2].at).toBe("2026-12-24T12:00:00");
  });
});

describe("hitsFromNotes", () => {
  it("shows each note once, at its first matching line", () => {
    const hits = hitsFromNotes([
      { rel: "Journal/2026-10-08.md", line: 3, text: "  dentist at 2 " },
      { rel: "Journal/2026-10-08.md", line: 9, text: "dentist again" },
      { rel: "Health.md", line: 0, text: "dentist list" },
    ]);
    expect(hits.map((h) => [h.label, h.sublabel, h.at])).toEqual([
      ["2026-10-08", "dentist at 2", "3"],
      ["Health", "dentist list", "0"],
    ]);
  });
});

describe("recents", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps the newest first, without duplicates, up to six", () => {
    for (let i = 0; i < 8; i++)
      rememberRecent({ type: "command", id: `c${i}` });
    rememberRecent({ type: "command", id: "c5" });
    const ids = loadRecents().map((e) =>
      e.type === "command" ? e.id : e.hit.id,
    );
    expect(ids).toEqual(["c5", "c7", "c6", "c4", "c3", "c2"]);
  });
});
