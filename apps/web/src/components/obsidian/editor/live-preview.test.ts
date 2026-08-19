// @vitest-environment jsdom
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { buildDecorations, type LivePreviewConfig } from "./live-preview";
import { obsidianMarkdown } from "./obsidian-markdown";

const config: LivePreviewConfig = {
  files: ["Note.md"],
  fromRel: "Current.md",
  resolveAsset: () => null,
};

const DOC = "# Title\n\nsome **bold** and [[Note]]\n";

function makeState(selectionPos: number) {
  return EditorState.create({
    doc: DOC,
    selection: { anchor: selectionPos },
    extensions: [
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        extensions: [obsidianMarkdown],
      }),
    ],
  });
}

function decorationAt(
  state: EditorState,
  mode: "source" | "live",
  from: number,
  to: number,
): Decoration | null {
  const set = buildDecorations(state, mode, config);
  let found: Decoration | null = null;
  set.between(from, to, (f, t, value) => {
    if (f === from && t === to) found = value;
  });
  return found;
}

describe("buildDecorations", () => {
  it("hides the heading mark in live mode when the cursor is elsewhere", () => {
    // Cursor on line 3 ("some **bold**..."), line 1 ("# Title") untouched.
    const state = makeState(DOC.indexOf("some"));
    const deco = decorationAt(state, "live", 0, 2);
    expect(deco).not.toBeNull();
    expect(deco?.spec.class).toBeUndefined(); // Decoration.replace({}) — fully elided
  });

  it("reveals the heading mark once the selection touches its line", () => {
    const state = makeState(0);
    const deco = decorationAt(state, "live", 0, 2);
    expect(deco).not.toBeNull();
    expect(deco?.spec.class).toBe("cm-obsidian-mark");
  });

  it("never hides marks in source mode, only mutes them", () => {
    const state = makeState(DOC.indexOf("some"));
    const deco = decorationAt(state, "source", 0, 2);
    expect(deco?.spec.class).toBe("cm-obsidian-mark");
  });

  it("always applies the heading line class, in both modes", () => {
    const live = buildDecorations(
      makeState(DOC.indexOf("some")),
      "live",
      config,
    );
    const source = buildDecorations(
      makeState(DOC.indexOf("some")),
      "source",
      config,
    );
    for (const set of [live, source]) {
      let hasHeadingLine = false;
      set.between(0, 0, (_f, _t, value) => {
        if (value.spec.class === "cm-obsidian-h1") hasHeadingLine = true;
      });
      expect(hasHeadingLine).toBe(true);
    }
  });

  it("always styles the wikilink, and hides its brackets only away from the cursor", () => {
    const linkFrom = DOC.indexOf("[[Note]]");
    const linkTo = linkFrom + "[[Note]]".length;

    // Cursor on line 1 ("# Title") — the wikilink's line (line 3) is untouched.
    const untouched = buildDecorations(makeState(0), "live", config);
    let wikilinkClass: string | undefined;
    untouched.between(linkFrom, linkTo, (f, t, value) => {
      if (f === linkFrom && t === linkTo) wikilinkClass = value.spec.class;
    });
    expect(wikilinkClass).toContain("cm-wikilink");

    let bracketsHidden = false;
    untouched.between(linkFrom, linkFrom + 2, (f, t, value) => {
      if (f === linkFrom && t === linkFrom + 2 && !value.spec.class)
        bracketsHidden = true;
    });
    expect(bracketsHidden).toBe(true);

    const touched = buildDecorations(makeState(linkFrom + 1), "live", config);
    let bracketsHiddenWhileTouched = false;
    touched.between(linkFrom, linkFrom + 2, (f, t, value) => {
      if (f === linkFrom && t === linkFrom + 2 && !value.spec.class)
        bracketsHiddenWhileTouched = true;
    });
    expect(bracketsHiddenWhileTouched).toBe(false);
  });
});
