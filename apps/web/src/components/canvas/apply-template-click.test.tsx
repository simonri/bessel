// @vitest-environment jsdom
import { useState } from "react";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Popover, PopoverContent, PopoverTrigger } from "@bessel/ui/components/popover";
import { WindowManager, useWindowManager, type WindowSpec } from "./window-manager";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(),
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() { return data.size; },
  };
}
Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

// Mirrors NewWorkspaceMenu's exact shape: a Popover whose "+" trigger opens a
// list of one template; clicking it applies the template to a new workspace
// and closes the popover in the same handler.
function NewWorkspaceMenuHarness({ specs }: { specs: WindowSpec[] }) {
  const { applyTemplate } = useWindowManager();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button onClick={() => setOpen(true)}>plus</button>
      </PopoverTrigger>
      <PopoverContent>
        <button
          onClick={() => {
            applyTemplate(specs, "new");
            setOpen(false);
          }}
        >
          my-template
        </button>
      </PopoverContent>
    </Popover>
  );
}

describe("applying a template via the real Popover click pattern", () => {
  it("creates exactly one workspace and one window for a single click", async () => {
    const specs: WindowSpec[] = [{ module: "terminal" }];
    const { result } = (function capture() {
      let captured: ReturnType<typeof useWindowManager> | undefined;
      function Capture() {
        captured = useWindowManager();
        return null;
      }
      render(
        <WindowManager>
          <Capture />
          <NewWorkspaceMenuHarness specs={specs} />
        </WindowManager>,
      );
      return { result: () => captured! };
    })();

    const workspacesBefore = result().workspaces.length;

    fireEvent.pointerDown(screen.getByText("plus"), { button: 0, pointerId: 1 });
    fireEvent.pointerUp(screen.getByText("plus"), { button: 0, pointerId: 1 });
    fireEvent.click(screen.getByText("plus"));

    const applyButton = await screen.findByText("my-template");
    fireEvent.pointerDown(applyButton, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(applyButton, { button: 0, pointerId: 1 });
    fireEvent.click(applyButton);

    expect(result().workspaces.length).toBe(workspacesBefore + 1);
    expect(result().allWindows.filter((w) => w.module === "terminal")).toHaveLength(1);
  });
});
