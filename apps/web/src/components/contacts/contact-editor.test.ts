import type { ContactSchema } from "@bessel/client";
import { describe, expect, it } from "vitest";
import { changesFrom, draftFrom } from "./contact-editor";

const anna = {
  id: "c1",
  display_name: "Anna Berg",
  given_name: "Anna",
  family_name: "Berg",
  nickname: null,
  organization: "Acme",
  job_title: null,
  birthday: { month: 3, day: 14, year: null },
  notes: null,
  phones: [
    { label: "Mobile", value: "+46701234567", display: "070-123 45 67" },
    { label: "Work", value: "08123456", display: "08-12 34 56" },
  ],
  emails: [],
  addresses: [],
  urls: [],
} as unknown as ContactSchema;

describe("draftFrom", () => {
  it("edits the structured name, or the display name when that's all there is", () => {
    expect(draftFrom(anna)).toMatchObject({
      given_name: "Anna",
      family_name: "Berg",
    });
    const bare = {
      ...anna,
      given_name: null,
      family_name: null,
    } as ContactSchema;
    expect(draftFrom(bare)).toMatchObject({
      given_name: "Anna Berg",
      family_name: "",
    });
  });

  it("keeps a prefix, middle name and suffix in their own fields", () => {
    const johan = {
      ...anna,
      display_name: "Frösåker Johan Fryckne",
      name_prefix: "Frösåker",
      given_name: null,
      middle_name: "Erik",
      family_name: null,
      name_suffix: "Jr.",
    } as ContactSchema;

    expect(draftFrom(johan)).toMatchObject({
      name_prefix: "Frösåker",
      given_name: "",
      middle_name: "Erik",
      family_name: "",
      name_suffix: "Jr.",
    });
  });

  it("shows numbers spaced, as they're displayed", () => {
    expect(draftFrom(anna).phones).toEqual([
      { label: "Mobile", value: "070-123 45 67" },
      { label: "Work", value: "08-12 34 56" },
    ]);
  });
});

describe("changesFrom", () => {
  it("sends nothing when nothing changed", () => {
    expect(changesFrom(draftFrom(anna), draftFrom(anna))).toEqual({});
  });

  it("sends a changed prefix, middle name or suffix", () => {
    const before = draftFrom(anna);

    expect(
      changesFrom(before, {
        ...before,
        name_prefix: "Dr.",
        middle_name: " Maria ",
        name_suffix: "",
      }),
    ).toEqual({ name_prefix: "Dr.", middle_name: "Maria" });
  });

  it("sends only the fields that changed, clearing with null and trimming", () => {
    const before = draftFrom(anna);
    const after = {
      ...before,
      family_name: " Lind ",
      organization: "",
      nickname: "Nana",
    };

    expect(changesFrom(before, after)).toEqual({
      family_name: "Lind",
      organization: null,
      nickname: "Nana",
    });
  });

  it("sends a changed list whole, without empty rows", () => {
    const before = draftFrom(anna);
    const after = {
      ...before,
      phones: [
        { label: "Mobile", value: "+46 70 999 99 99" },
        ...before.phones.slice(1),
        { label: "Home", value: "  " },
      ],
    };

    expect(changesFrom(before, after)).toEqual({
      phones: [
        { label: "Mobile", value: "+46 70 999 99 99" },
        { label: "Work", value: "08-12 34 56" },
      ],
    });
  });

  it("reads the birthday from day, month and an optional year, and refuses one that isn't a date", () => {
    const before = draftFrom(anna);

    expect(changesFrom(before, { ...before, birthday_year: "1990" })).toEqual({
      birthday: { day: 14, month: 3, year: 1990 },
    });
    expect(
      changesFrom(before, { ...before, birthday_day: "", birthday_month: "" }),
    ).toEqual({ birthday: null });
    expect(changesFrom(before, { ...before, birthday_month: "13" })).toMatch(
      /isn't a date/,
    );
  });

  it("sends everything filled in for a new contact", () => {
    const after = {
      ...draftFrom(null),
      given_name: "Cia",
      emails: [{ label: "Home", value: "cia@x.se" }],
    };

    expect(changesFrom(draftFrom(null), after)).toEqual({
      given_name: "Cia",
      emails: [{ label: "Home", value: "cia@x.se" }],
    });
  });
});
