// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NewProjectDialog } from "./new-project-dialog";

// Hoisted: isDesktop reads window.electron at import.
const electron = vi.hoisted(() => {
  const api = {
    platform: "linux",
    selectFolder: vi.fn(),
    sshListDir: vi.fn(),
    ssh: {
      hosts: vi.fn(async () => ({
        hosts: ["vps", "gpu1"],
        configExists: true,
      })),
      openConfig: vi.fn(),
      mkdir: vi.fn(),
    },
  };
  Object.defineProperty(window, "electron", { value: api, configurable: true });
  return api;
});

const mutate = vi.fn();
vi.mock("@/hooks/use-project-mutations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useProjectMutations: () => ({ createProject: { mutate, isPending: false } }),
}));
vi.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({ data: [{ id: "p1", ssh_host: "gpu1" }] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});
beforeEach(() => {
  vi.clearAllMocks();
  electron.sshListDir.mockReset();
});
afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const mount = () => render(<NewProjectDialog open onOpenChange={() => {}} />);

describe("NewProjectDialog", () => {
  it("adds a local folder named after it", async () => {
    electron.selectFolder.mockResolvedValue("/home/me/code/metron");
    mount();
    fireEvent.click(screen.getByRole("button", { name: /On this computer/ }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].body).toEqual({
      name: "metron",
      path: "/home/me/code/metron",
      ssh_host: null,
    });
  });

  it("lists recent servers before configured ones", async () => {
    mount();
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("button", { name: /^(gpu1|vps)/ })
          .map((r) => r.textContent),
      ).toEqual(["gpu1Recent", "vps"]),
    );
  });

  it("connects, browses and opens a remote folder", async () => {
    electron.sshListDir
      .mockResolvedValueOnce({ cwd: "/root", dirs: [".cache", "app"] })
      .mockResolvedValueOnce({ cwd: "/root/app", dirs: [] });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "vps" }));
    expect(electron.sshListDir).toHaveBeenCalledWith("vps", "~");

    // Hidden folders stay out of the way until asked for.
    await screen.findByRole("heading", { name: /Select folder/ });
    expect(screen.queryByText(".cache")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "app" }));
    await waitFor(() =>
      expect(electron.sshListDir).toHaveBeenLastCalledWith("vps", "/root/app"),
    );
    await screen.findByText("No folders here");

    fireEvent.click(screen.getByRole("button", { name: /^Open/ }));
    expect(mutate.mock.calls[0][0].body).toEqual({
      name: "app",
      path: "/root/app",
      ssh_host: "vps",
    });
  });

  it("explains a failed connection", async () => {
    electron.sshListDir.mockRejectedValue(
      new Error("Command failed\nroot@vps: Permission denied (publickey)."),
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "vps" }));
    expect(await screen.findByText(/didn't accept your SSH key/)).toBeTruthy();
  });

  it("ignores a connection that finishes after cancelling", async () => {
    const reply = deferred<{ cwd: string; dirs: string[] }>();
    electron.sshListDir.mockReturnValue(reply.promise);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "vps" }));
    fireEvent.click(await screen.findByRole("button", { name: /Cancel/ }));
    await act(async () => reply.resolve({ cwd: "/root", dirs: [] }));

    expect(screen.queryByRole("heading", { name: /Select folder/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "New project" })).toBeTruthy();
  });
});
