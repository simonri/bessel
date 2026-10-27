// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasDock } from "./canvas-dock";
import { CanvasEmptyState } from "./canvas-empty-state";
import { useWindowManager, WindowManager } from "./window-manager";

// No window.electron: this is the web app in a browser.

vi.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({ data: [], isSuccess: true }),
}));

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, String(value));
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
}
Object.defineProperty(window, "localStorage", {
  value: memoryStorage(),
  configurable: true,
});

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function mount() {
  let captured: ReturnType<typeof useWindowManager> | undefined;
  function Capture() {
    captured = useWindowManager();
    return null;
  }
  render(
    <WindowManager>
      <Capture />
      <CanvasEmptyState />
      <CanvasDock />
    </WindowManager>,
  );
  return () => captured!;
}

describe("the canvas in a browser", () => {
  it("is an empty board that points at adding widgets", () => {
    const manager = mount();
    const card = within(screen.getByRole("region", { name: "Empty session" }));

    expect(card.getByText("Nothing on this board yet")).toBeTruthy();
    expect(card.queryByText(/agent/i)).toBeNull();
    expect(card.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Tasks",
    ]);

    fireEvent.click(card.getByRole("button", { name: "Tasks" }));
    expect(manager().allWindows.map((w) => w.module)).toEqual(["tasks"]);
  });

  it("offers no desktop-only widgets in the dock", () => {
    mount();

    expect(screen.getByTitle("Tasks")).toBeTruthy();
    for (const title of ["Git", "Terminal", "Claude", "Browser"])
      expect(screen.queryByTitle(title)).toBeNull();
  });
});
