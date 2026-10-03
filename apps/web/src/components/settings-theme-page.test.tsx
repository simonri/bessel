// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsProvider, THEME_KEYS } from "@/hooks/use-settings";
import { THEME_OPTIONS, ThemePage } from "./settings-theme-page";

const GLOBALS_CSS = readFileSync(
  resolve(__dirname, "../../../../packages/ui/src/styles/globals.css"),
  "utf8",
);

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

function renderPage() {
  render(
    <SettingsProvider>
      <ThemePage />
    </SettingsProvider>,
  );
}

describe("accent themes", () => {
  it("offers every theme, with swatches matching the CSS", () => {
    expect(THEME_OPTIONS.map((t) => t.key).sort()).toEqual(
      [...THEME_KEYS].sort(),
    );
    for (const { key, hue, chroma } of THEME_OPTIONS) {
      const block = GLOBALS_CSS.match(
        new RegExp(`\\[data-theme="${key}"\\] \\{([^}]*)\\}`),
      )?.[1];
      expect(block, key).toBeDefined();
      expect(block).toContain(`--accent-hue: ${hue};`);
      expect(block).toContain(`--accent-chroma: ${chroma};`);
    }
  });

  it("applies the chosen theme and remembers it", () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Lilac" }));

    expect(document.documentElement.dataset.theme).toBe("lilac");
    expect(
      screen.getByRole("radio", { name: "Lilac" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      JSON.parse(window.localStorage.getItem("bessel:settings")!).theme,
    ).toBe("lilac");
  });

  it("falls back to Peach when the saved theme no longer exists", () => {
    window.localStorage.setItem(
      "bessel:settings",
      JSON.stringify({ theme: "neon" }),
    );
    renderPage();

    expect(document.documentElement.dataset.theme).toBe("orange");
    expect(
      screen.getByRole("radio", { name: "Peach" }).getAttribute("aria-checked"),
    ).toBe("true");
  });
});
