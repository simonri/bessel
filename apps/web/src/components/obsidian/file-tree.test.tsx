// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTree, type FileTreeProps } from "./file-tree";
import type { VaultEntry } from "./vault-types";

afterEach(cleanup);

beforeEach(() => {
  // TanStack Virtual reads the scroll element's layout box. jsdom has no
  // layout engine, so give the tree a representative viewport.
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { configurable: true, get: () => 480 },
    offsetWidth: { configurable: true, get: () => 240 },
  });
});

function entry(rel: string, kind: VaultEntry["kind"]): VaultEntry {
  return { rel, kind, mtimeMs: 0, size: 1 };
}

function renderTree(entries: VaultEntry[]) {
  const onOpen = vi.fn();
  const onReveal = vi.fn();
  const props: FileTreeProps = {
    root: "/vault",
    entries,
    activeRel: null,
    expandedDirs: [],
    onToggleDir: vi.fn(),
    onOpen,
    onCreateNote: vi.fn(),
    onCreateFolder: vi.fn(),
    onRename: vi.fn(),
    onTrash: vi.fn(),
    onReveal,
    onPinToCanvas: vi.fn(),
  };
  render(<FileTree {...props} />);
  return { onOpen, onReveal };
}

describe("FileTree file opening", () => {
  it.each([
    ["Note.md", "md"],
    ["photo.png", "image"],
    ["data.bin", "other"],
  ] as const)("routes %s through the in-app opener", (rel, kind) => {
    const { onOpen, onReveal } = renderTree([entry(rel, kind)]);

    fireEvent.click(
      screen.getByRole("button", { name: rel.replace(/\.md$/, "") }),
    );

    expect(onOpen).toHaveBeenCalledWith(rel, { newTab: false });
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("mounts only the viewport window for a large vault", () => {
    const entries = Array.from({ length: 1_000 }, (_, index) =>
      entry(`Note ${index}.md`, "md"),
    );

    renderTree(entries);

    const mountedRows = screen
      .getAllByRole("button")
      .filter((button) => button.textContent?.startsWith("Note "));
    expect(mountedRows.length).toBeGreaterThan(0);
    expect(mountedRows.length).toBeLessThan(100);
  });
});
