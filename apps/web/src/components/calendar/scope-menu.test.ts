import { describe, expect, it } from "vitest";
import { allowedScopes, moveNeedsPrompt } from "./scope-menu";

describe("allowedScopes", () => {
  it("offers every scope for ordinary edits", () => {
    expect(allowedScopes({})).toEqual(["this", "following", "all"]);
  });

  it("can't change the repeat rule for one occurrence", () => {
    expect(allowedScopes({ changesRule: true })).toEqual(["following", "all"]);
  });

  it("moves whole series between calendars only", () => {
    expect(allowedScopes({ movesCalendar: true, changesRule: true })).toEqual([
      "all",
    ]);
  });
});

describe("moveNeedsPrompt", () => {
  it("asks for repeating events or when guests could be emailed", () => {
    expect(moveNeedsPrompt({ recurring: false, notifiesGuests: false })).toBe(
      false,
    );
    expect(moveNeedsPrompt({ recurring: true, notifiesGuests: false })).toBe(
      true,
    );
    expect(moveNeedsPrompt({ recurring: false, notifiesGuests: true })).toBe(
      true,
    );
  });
});
