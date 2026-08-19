// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickSwitcher } from "./quick-switcher";

// Radix (Dialog) and cmdk both reach for browser APIs jsdom doesn't
// implement; this repo has no shared test-setup file, so polyfill locally.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  globalThis.ResizeObserver ??= MockResizeObserver;
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  window.electron = {
    vault: { search: vi.fn().mockResolvedValue([]) },
  } as unknown as Window["electron"];
});

afterEach(cleanup);

const FILES = ["Note.md", "Recipes/Pasta.md", "Journal/2026-01-01.md"];

function renderSwitcher(
  overrides: Partial<React.ComponentProps<typeof QuickSwitcher>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onSelect = vi.fn();
  const onCreate = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <QuickSwitcher
        root="/vault"
        open
        onOpenChange={onOpenChange}
        files={FILES}
        onSelect={onSelect}
        onCreate={onCreate}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onSelect, onCreate, onOpenChange };
}

describe("QuickSwitcher — files mode", () => {
  it("lists notes ranked by basename and opens the selected one", () => {
    const { onSelect, onOpenChange } = renderSwitcher();

    expect(screen.getByText("Note")).toBeTruthy();
    expect(screen.getByText("Pasta")).toBeTruthy();

    fireEvent.click(screen.getByText("Note"));

    expect(onSelect).toHaveBeenCalledWith("Note.md");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers to create a note when the query has no exact basename match", () => {
    const { onCreate, onOpenChange } = renderSwitcher();

    fireEvent.change(screen.getByPlaceholderText("Jump to note…"), {
      target: { value: "Brand New" },
    });

    fireEvent.click(
      screen.getByRole("option", { name: /Create note.*Brand New/ }),
    );

    expect(onCreate).toHaveBeenCalledWith("Brand New");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not offer to create when the query exactly matches an existing note", () => {
    renderSwitcher();

    fireEvent.change(screen.getByPlaceholderText("Jump to note…"), {
      target: { value: "Note" },
    });

    expect(screen.queryByText(/Create note/)).toBeNull();
  });
});

describe("QuickSwitcher — mode switching", () => {
  it("Tab toggles between files and search mode", () => {
    renderSwitcher();

    const input = screen.getByPlaceholderText("Jump to note…");
    fireEvent.keyDown(input, { key: "Tab" });

    expect(screen.getByPlaceholderText("Search your vault…")).toBeTruthy();
  });

  it("starts in search mode when initialMode is 'search'", () => {
    renderSwitcher({ initialMode: "search" });

    expect(screen.getByPlaceholderText("Search your vault…")).toBeTruthy();
  });
});
