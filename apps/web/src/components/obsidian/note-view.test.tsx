// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vaultKeys } from "./hooks/use-vault";
import type { NoteMode } from "./lib/vault-state";
import { NoteView, type NoteViewProps } from "./note-view";
import type { VaultReadResult } from "./vault-types";

// NoteEditor/NoteReader are owned by other agents and are being replaced
// concurrently — mock them to a minimal stand-in that still honors the
// contract (value/onChange/onSave, forwardRef handle) so NoteView's own
// autosave/conflict logic is exercised in isolation.
vi.mock("./note-editor", () => ({
  NoteEditor: forwardRef(function MockEditor(
    {
      value,
      onChange,
      onSave,
    }: { value: string; onChange: (v: string) => void; onSave?: () => void },
    ref: React.Ref<{ focus: () => void; scrollToLine: () => void }>,
  ) {
    useImperativeHandle(ref, () => ({
      focus: () => {},
      scrollToLine: () => {},
    }));
    return (
      <textarea
        data-testid="mock-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "s") onSave?.();
        }}
      />
    );
  }),
}));

vi.mock("./note-reader", () => ({
  NoteReader: ({ content }: { content: string }) => (
    <div data-testid="mock-reader">{content}</div>
  ),
}));

const ROOT = "/vault";
const REL = "Note.md";

type VaultApi = NonNullable<Window["electron"]>["vault"];

function mockVault(overrides: Partial<VaultApi> = {}) {
  return {
    read: vi.fn().mockResolvedValue({
      content: "hello",
      mtimeMs: 100,
    } satisfies VaultReadResult),
    write: vi.fn().mockResolvedValue({ mtimeMs: 200 }),
    writeBinary: vi.fn(),
    ...overrides,
  } as unknown as VaultApi;
}

function baseProps(overrides: Partial<NoteViewProps> = {}): NoteViewProps {
  return {
    root: ROOT,
    rel: REL,
    mode: "edit" as NoteMode,
    files: [REL],
    index: undefined,
    attachmentFolder: "",
    onOpenLink: vi.fn(),
    onRename: vi.fn(),
    onModeChange: vi.fn(),
    ...overrides,
  };
}

function renderNoteView(propsOverrides: Partial<NoteViewProps> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const props = baseProps(propsOverrides);
  const result = render(
    <QueryClientProvider client={client}>
      <NoteView {...props} />
    </QueryClientProvider>,
  );
  return { ...result, client, props };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  window.electron = { vault: mockVault() } as unknown as Window["electron"];
});

describe("NoteView", () => {
  it("offers only Edit and Reading modes", async () => {
    renderNoteView();
    await screen.findByDisplayValue("hello");

    expect(screen.getByRole("radio", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Reading" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Source" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Live" })).toBeNull();
  });

  it("loads the note content", async () => {
    renderNoteView();
    await screen.findByDisplayValue("hello");
  });

  it("autosaves 400ms after the last change", async () => {
    const vault = mockVault();
    window.electron = { vault } as unknown as Window["electron"];
    renderNoteView();
    await screen.findByDisplayValue("hello");

    vi.useFakeTimers();
    fireEvent.change(screen.getByTestId("mock-editor"), {
      target: { value: "hello world" },
    });
    expect(vault.write).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(vault.write).toHaveBeenCalledTimes(1);
    expect(vault.write).toHaveBeenCalledWith(ROOT, REL, "hello world", 100);
  });

  it("shows a conflict bar when a save hits VAULT_CONFLICT", async () => {
    const vault = mockVault({
      write: vi
        .fn()
        .mockRejectedValue(new Error("VAULT_CONFLICT: mtime moved")),
    });
    window.electron = { vault } as unknown as Window["electron"];
    renderNoteView();
    await screen.findByDisplayValue("hello");

    vi.useFakeTimers();
    fireEvent.change(screen.getByTestId("mock-editor"), {
      target: { value: "hello world" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText("This note changed on disk")).toBeTruthy();
  });

  it("silently adopts an external change when the buffer is clean", async () => {
    const { client } = renderNoteView();
    await screen.findByDisplayValue("hello");

    act(() => {
      client.setQueryData(vaultKeys.note(ROOT, REL), {
        content: "changed on disk",
        mtimeMs: 200,
      } satisfies VaultReadResult);
    });

    await screen.findByDisplayValue("changed on disk");
    expect(screen.queryByText("This note changed on disk")).toBeNull();
  });

  it("still saves the outgoing note's edits when switching notes mid-save", async () => {
    const OTHER = "Other.md";
    let releaseFirstWrite!: (value: { mtimeMs: number }) => void;
    const write = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (releaseFirstWrite = resolve)),
      )
      .mockResolvedValue({ mtimeMs: 300 });
    const vault = mockVault({
      read: vi.fn((_root: string, rel: string) =>
        Promise.resolve({
          content: rel === OTHER ? "other" : "hello",
          mtimeMs: 100,
        }),
      ),
      write,
    } as Partial<VaultApi>);
    window.electron = { vault } as unknown as Window["electron"];
    const { rerender, client, props } = renderNoteView();
    await screen.findByDisplayValue("hello");

    vi.useFakeTimers();
    fireEvent.change(screen.getByTestId("mock-editor"), {
      target: { value: "hello 1" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(write).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId("mock-editor"), {
      target: { value: "hello 12" },
    });
    rerender(
      <QueryClientProvider client={client}>
        <NoteView {...props} rel={OTHER} />
      </QueryClientProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    await act(async () => {
      releaseFirstWrite({ mtimeMs: 200 });
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(ROOT, REL, "hello 12", 200);
  });

  it("writes unsaved edits synchronously when the page unloads", async () => {
    const vault = mockVault();
    window.electron = { vault } as unknown as Window["electron"];
    renderNoteView();
    await screen.findByDisplayValue("hello");

    fireEvent.change(screen.getByTestId("mock-editor"), {
      target: { value: "hello there" },
    });
    window.dispatchEvent(new Event("pagehide"));

    expect(vault.write).toHaveBeenCalledTimes(1);
    expect(vault.write).toHaveBeenCalledWith(ROOT, REL, "hello there", 100);
  });
});
