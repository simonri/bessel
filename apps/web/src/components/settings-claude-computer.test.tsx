// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const projects = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({ data: projects.list }),
}));

const { StartFromPhone, PhoneNotificationsSection } = await import(
  "./settings-claude-computer"
);

const states: Record<string, string> = {};
const remoteControl = {
  status: vi.fn(async (folder: string) => ({
    supported: true,
    state: states[folder] ?? "off",
  })),
  enable: vi.fn(async (folder: string) => {
    states[folder] = "running";
    return { supported: true, state: "running" };
  }),
  disable: vi.fn(async (folder: string) => {
    states[folder] = "off";
    return { supported: true, state: "off" };
  }),
};
const claudeNotifications = {
  get: vi.fn(async () => ({ inputNeeded: false, claudeDecides: true })),
  set: vi.fn(async (patch: object) => ({
    inputNeeded: false,
    claudeDecides: true,
    ...patch,
  })),
};

function mount(node: ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const key of Object.keys(states)) delete states[key];
  for (const fn of [
    ...Object.values(remoteControl),
    ...Object.values(claudeNotifications),
  ])
    fn.mockClear();
  projects.list = [
    { id: "p1", name: "Bessel", path: "/home/me/metron", ssh_host: null },
    { id: "p2", name: "Box", path: "/srv/app", ssh_host: "me@box" },
    { id: "p3", name: "Nowhere", path: null, ssh_host: null },
  ];
  Object.defineProperty(window, "electron", {
    value: { platform: "linux", remoteControl, claudeNotifications },
    configurable: true,
  });
});
afterEach(cleanup);

describe("StartFromPhone", () => {
  it("lists this computer's code folders, not remote ones", async () => {
    mount(<StartFromPhone />);

    expect(await screen.findByText("Bessel")).toBeTruthy();
    expect(screen.getByText("/home/me/metron")).toBeTruthy();
    expect(screen.queryByText("Box")).toBeNull();
    expect(screen.queryByText("Nowhere")).toBeNull();
  });

  it("turns a folder on and off, and says when it's ready", async () => {
    mount(<StartFromPhone />);
    const toggle = await screen.findByRole("switch", {
      name: "Start sessions in Bessel from your phone",
    });
    await waitFor(() =>
      expect((toggle as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(remoteControl.enable).toHaveBeenCalledWith(
        "/home/me/metron",
        "Bessel",
      ),
    );
    expect(await screen.findByText(/Ready - start a session/)).toBeTruthy();
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(remoteControl.disable).toHaveBeenCalledWith("/home/me/metron"),
    );
    await waitFor(() =>
      expect(toggle.getAttribute("aria-checked")).toBe("false"),
    );
  });

  it("can't be turned on in a folder Claude doesn't trust yet, and says what to do", async () => {
    states["/home/me/metron"] = "untrusted";
    mount(<StartFromPhone />);

    expect(
      await screen.findByText(/accept the trust prompt first/),
    ).toBeTruthy();
    const toggle = screen.getByRole("switch") as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
  });

  it("says it needs Linux elsewhere", () => {
    Object.defineProperty(window, "electron", {
      value: { platform: "darwin", remoteControl, claudeNotifications },
      configurable: true,
    });
    mount(<StartFromPhone />);

    expect(screen.getByText(/needs Linux for now/)).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("isn't there outside the desktop app", () => {
    Object.defineProperty(window, "electron", {
      value: undefined,
      configurable: true,
    });
    const { container } = mount(<StartFromPhone />);

    expect(container.innerHTML).toBe("");
  });
});

describe("PhoneNotificationsSection", () => {
  it("shows Claude's push settings and changes just the one switched", async () => {
    mount(<PhoneNotificationsSection />);
    const needed = await screen.findByRole("switch", {
      name: /When a session needs you/,
    });
    const decides = screen.getByRole("switch", {
      name: /When Claude thinks you'd want to know/,
    });
    expect(needed.getAttribute("aria-checked")).toBe("false");
    expect(decides.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(needed);

    await waitFor(() =>
      expect(claudeNotifications.set).toHaveBeenCalledWith({
        inputNeeded: true,
      }),
    );
    await waitFor(() =>
      expect(needed.getAttribute("aria-checked")).toBe("true"),
    );
  });
});
