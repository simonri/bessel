// @vitest-environment jsdom
import type { RecipeBody } from "@bessel/client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanRecipeBody,
  emptyRecipeBody,
  RecipeEditor,
} from "./recipe-editor";

afterEach(cleanup);

let latest: RecipeBody = emptyRecipeBody();

function Harness({ initial }: { initial: RecipeBody }) {
  const [body, setBody] = useState(initial);
  latest = body;
  return (
    <RecipeEditor
      value={body}
      onChange={(next) => {
        latest = next;
        setBody(next);
      }}
    />
  );
}

const withItems = (...names: string[]): RecipeBody => ({
  ...emptyRecipeBody(),
  ingredient_groups: [
    {
      title: null,
      items: names.map((name) => ({
        amount: null,
        unit: null,
        name,
        note: null,
      })),
    },
  ],
});

const names = () =>
  (latest.ingredient_groups ?? [])[0]?.items?.map((i) => i.name) ?? [];

describe("RecipeEditor ingredients", () => {
  it("adds a row on Enter and moves focus into it", () => {
    render(<Harness initial={withItems("havregryn")} />);
    fireEvent.keyDown(screen.getByLabelText("Ingredient 1"), { key: "Enter" });

    expect(names()).toEqual(["havregryn", ""]);
    expect(document.activeElement).toBe(screen.getByLabelText("Ingredient 2"));
  });

  it("removes an empty row on Backspace and focuses the one before", () => {
    render(<Harness initial={withItems("havregryn", "")} />);
    fireEvent.keyDown(screen.getByLabelText("Ingredient 2"), {
      key: "Backspace",
    });

    expect(names()).toEqual(["havregryn"]);
    expect(document.activeElement).toBe(screen.getByLabelText("Ingredient 1"));
  });

  it("splits a pasted list into rows, replacing the empty row it was pasted in", () => {
    render(<Harness initial={withItems("")} />);
    fireEvent.paste(screen.getByLabelText("Ingredient 1"), {
      clipboardData: {
        getData: () => "- 5 dl havregryn\n- 2 msk honung (eller lönnsirap)",
      },
    });

    expect(latest.ingredient_groups?.[0].items).toEqual([
      { amount: 5, unit: "dl", name: "havregryn", note: null },
      { amount: 2, unit: "msk", name: "honung", note: "eller lönnsirap" },
    ]);
  });

  it("adds a pasted list from the Paste a list box", () => {
    render(<Harness initial={withItems("")} />);
    fireEvent.click(screen.getByRole("button", { name: /Paste a list/ }));
    fireEvent.change(screen.getByLabelText("Paste ingredients, one per line"), {
      target: { value: "1 krm salt\n\n1 st äggvita" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add ingredients" }));

    expect(names()).toEqual(["salt", "äggvita"]);
  });

  it("reorders and removes rows", () => {
    render(<Harness initial={withItems("a", "b", "c")} />);
    fireEvent.click(screen.getByRole("button", { name: "Move a down" }));
    expect(names()).toEqual(["b", "a", "c"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove c" }));
    expect(names()).toEqual(["b", "a"]);
  });

  it("parses amounts like 1½ and 0,5 on blur and shows them formatted", () => {
    render(<Harness initial={withItems("mandlar")} />);
    const amount = screen.getByLabelText("Amount for mandlar");
    fireEvent.focus(amount);
    fireEvent.change(amount, { target: { value: "0,5" } });
    fireEvent.blur(amount);

    expect(latest.ingredient_groups?.[0].items?.[0].amount).toBe(0.5);
    expect((amount as HTMLInputElement).value).toBe("½");
  });

  it("adds a group", () => {
    render(<Harness initial={withItems("a")} />);
    fireEvent.click(screen.getByRole("button", { name: "Add group" }));
    expect(latest.ingredient_groups).toHaveLength(2);
  });
});

describe("RecipeEditor steps", () => {
  it("adds, edits, reorders and gives a step a tip", () => {
    render(<Harness initial={{ ...emptyRecipeBody(), steps: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));

    fireEvent.change(screen.getByLabelText("Step 1 title"), {
      target: { value: "Rosta" },
    });
    fireEvent.change(screen.getByLabelText("Step 1 time"), {
      target: { value: "25 min" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move step 1 down" }));

    expect(latest.steps?.map((s) => s.title)).toEqual([null, "Rosta"]);
    expect(latest.steps?.[1].time_label).toBe("25 min");

    fireEvent.click(screen.getAllByRole("button", { name: "Add tip" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Warning" }));
    expect(latest.steps?.[1].callouts).toEqual([
      { kind: "warning", label: null, text: "" },
    ]);
  });
});

describe("cleanRecipeBody", () => {
  it("drops what was only there for typing into, and trims", () => {
    const body: RecipeBody = {
      intro: "  ",
      yield_text: " 3 burgare ",
      total_minutes: 0,
      active_minutes: 10,
      ingredient_groups: [
        {
          title: " Puckarna ",
          items: [
            { amount: 500, unit: " g ", name: " nötfärs ", note: "" },
            { amount: null, unit: null, name: "  ", note: null },
          ],
        },
        {
          title: "Empty",
          items: [{ amount: 1, unit: "dl", name: "", note: null }],
        },
      ],
      steps: [
        {
          title: " Stek ",
          text: " Het panna. ",
          time_label: "",
          callouts: [
            { kind: "tip", label: "", text: "  " },
            { kind: "warning", label: " Obs ", text: " Inte teflon. " },
          ],
        },
        {
          title: "",
          text: "  ",
          time_label: "5 min",
          callouts: [],
        },
      ],
      sections: [
        { title: "", text: "" },
        { title: "", text: "Servera direkt." },
      ],
    };

    expect(cleanRecipeBody(body)).toEqual({
      intro: null,
      yield_text: "3 burgare",
      total_minutes: null,
      active_minutes: 10,
      ingredient_groups: [
        {
          title: "Puckarna",
          items: [{ amount: 500, unit: "g", name: "nötfärs", note: null }],
        },
      ],
      steps: [
        {
          title: "Stek",
          text: "Het panna.",
          time_label: null,
          callouts: [{ kind: "warning", label: "Obs", text: "Inte teflon." }],
        },
      ],
      sections: [{ title: "Notes", text: "Servera direkt." }],
    });
  });

  it("leaves a starter body with nothing to save", () => {
    expect(cleanRecipeBody(emptyRecipeBody())).toMatchObject({
      ingredient_groups: [],
      steps: [],
      sections: [],
    });
  });
});
