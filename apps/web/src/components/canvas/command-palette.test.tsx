// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  type WorkspaceTemplate,
  WorkspaceTemplatesProvider,
} from "@/hooks/use-workspace-templates";
import { CommandPalette } from "./command-palette";
import { useWindowManager, WindowManager } from "./window-manager";

vi.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({ data: [], isSuccess: true }),
}));
vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ settings: { obsidianVaultPath: null } }),
}));

const TEMPLATE: WorkspaceTemplate = {
  id: "t1",
  name: "Deploy",
  widgets: [{ id: "w1", module: "terminal", commands: [] }],
};

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    "bessel:workspace-templates",
    JSON.stringify([TEMPLATE]),
  );
});
afterEach(cleanup);

function mount() {
  let manager: ReturnType<typeof useWindowManager> | undefined;
  function Capture() {
    manager = useWindowManager();
    return null;
  }
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WindowManager>
        <WorkspaceTemplatesProvider>
          <Capture />
          <CommandPalette
            open
            onClose={onClose}
            onNavigate={vi.fn()}
            onOpenTask={vi.fn()}
            onShowShortcuts={vi.fn()}
          />
        </WorkspaceTemplatesProvider>
      </WindowManager>
    </QueryClientProvider>,
  );
  return { manager: () => manager!, onClose };
}

describe("CommandPalette", () => {
  it("starts one new session from a template", () => {
    const { manager, onClose } = mount();
    const workspacesBefore = manager().workspaces.length;

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "deploy" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /New session from "Deploy"/ }),
    );

    expect(manager().workspaces).toHaveLength(workspacesBefore + 1);
    expect(
      manager().allWindows.filter((w) => w.module === "terminal"),
    ).toHaveLength(1);
    expect(onClose).toHaveBeenCalled();
  });
});
