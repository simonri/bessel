// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { NoteReader } from "./note-reader";

describe("NoteReader — task checkboxes", () => {
  it("toggles a tight list item (checkbox is a direct <li> child)", () => {
    const onToggleTask = vi.fn();
    const { container } = render(
      createElement(NoteReader, {
        content: "- [ ] one\n- [x] two",
        fromRel: "N.md",
        files: [],
        root: "/v",
        onOpenLink: () => {},
        onToggleTask,
      }),
    );
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    fireEvent.click(boxes[0]);
    expect(onToggleTask).toHaveBeenCalledWith(0, true);
  });

  // A blank line between items makes it a "loose" list — mdast-util-to-hast
  // wraps the checkbox in a <p> instead of putting it directly in the <li>.
  it("toggles a loose list item (checkbox is nested inside a <p>)", () => {
    const onToggleTask = vi.fn();
    const { container } = render(
      createElement(NoteReader, {
        content: "- [ ] one\n\n- [x] two\n",
        fromRel: "N.md",
        files: [],
        root: "/v",
        onOpenLink: () => {},
        onToggleTask,
      }),
    );
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect(boxes[1].closest("p")).not.toBeNull();
    fireEvent.click(boxes[1]);
    expect(onToggleTask).toHaveBeenCalledWith(2, false);
  });

  it("does not toggle when onToggleTask is not provided", () => {
    const { container } = render(
      createElement(NoteReader, {
        content: "- [ ] one",
        fromRel: "N.md",
        files: [],
        root: "/v",
        onOpenLink: () => {},
      }),
    );
    const box = container.querySelector('input[type="checkbox"]');
    expect(box).not.toBeNull();
    expect(() => fireEvent.click(box as Element)).not.toThrow();
  });
});

describe("NoteReader — fenced code", () => {
  it("keeps the <pre> wrapper for a fence with no language", () => {
    const { container } = render(
      createElement(NoteReader, {
        content: "```\nplain text\nline two\n```",
        fromRel: "N.md",
        files: [],
        root: "/v",
        onOpenLink: () => {},
      }),
    );
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toBe("plain text\nline two");
  });

  it("keeps the <pre> wrapper for a fence with a language", () => {
    const { container } = render(
      createElement(NoteReader, {
        content: "```ts\nconst x = 1;\n```",
        fromRel: "N.md",
        files: [],
        root: "/v",
        onOpenLink: () => {},
      }),
    );
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toBe("const x = 1;");
  });

  it("renders inline code without a <pre> wrapper", () => {
    const { container } = render(
      createElement(NoteReader, {
        content: "Use `inline()` here.",
        fromRel: "N.md",
        files: [],
        root: "/v",
        onOpenLink: () => {},
      }),
    );
    expect(container.querySelector("pre")).toBeNull();
    const code = container.querySelector("code");
    expect(code?.textContent).toBe("inline()");
  });
});

describe("NoteReader — wikilinks", () => {
  it("calls onOpenLink when a wikilink is clicked", () => {
    const onOpenLink = vi.fn();
    const { getByText } = render(
      createElement(NoteReader, {
        content: "See [[Other Note]] for more.",
        fromRel: "N.md",
        files: ["N.md"],
        root: "/v",
        onOpenLink,
      }),
    );
    fireEvent.click(getByText("Other Note"));
    expect(onOpenLink).toHaveBeenCalledWith("Other Note", { newTab: false });
  });
});

describe("NoteReader — images", () => {
  it("renders Markdown images as selectable controls", () => {
    const { getByRole } = render(
      createElement(NoteReader, {
        content: "![Photo](photo.png)",
        fromRel: "N.md",
        files: [],
        root: "/v",
        onOpenLink: () => {},
      }),
    );

    const image = getByRole("img", { name: "Photo" });
    const button = image.closest("button");
    expect(button).not.toBeNull();
    fireEvent.pointerDown(image);
    expect(button?.dataset.selected).toBe("true");
  });
});
