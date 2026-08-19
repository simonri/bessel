// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasWindow } from "./canvas-window";
import {
  useWindowManager,
  type WindowEntry,
  WindowManager,
} from "./window-manager";

vi.mock("./module-registry", async () => {
  const { lazy } = await vi.importActual<typeof import("react")>("react");
  return {
    MODULE_REGISTRY: {
      tasks: {
        title: "Tasks",
        icon: () => null,
        component: lazy(async () => ({
          default: () => <div>Widget content</div>,
        })),
        defaultSize: { w: 4, h: 4 },
        minSize: { w: 4, h: 4 },
      },
    },
    moduleSupportsProject: () => false,
  };
});

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
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

function Harness() {
  const { windows } = useWindowManager();
  return windows[0] ? <CanvasWindow entry={windows[0]} /> : null;
}

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  const entry: Omit<WindowEntry, "id" | "workspaceId"> = {
    module: "tasks",
    x: 0,
    y: 0,
    w: 4,
    h: 4,
  };
  window.localStorage.setItem(
    "bessel:workspaces",
    JSON.stringify({
      workspaces: [{ id: "session", windows: [entry] }],
      activeWorkspaceId: "session",
    }),
  );
});

describe("CanvasWindow title bar", () => {
  it("closes the widget on a middle-button press", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <WindowManager>
          <Harness />
        </WindowManager>
      </QueryClientProvider>,
    );

    const title = screen.getByText("Tasks");
    expect(title.className).toContain("select-none");
    fireEvent.mouseDown(title.closest(".canvas-window-titlebar")!, {
      button: 1,
    });
    expect(screen.queryByText("Tasks")).toBeNull();
  });
});
