// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeSessionView } from "./claude-sessions-types";
import { SessionName } from "./session-name";

const rename = vi.hoisted(() => vi.fn());
vi.mock("./claude-sessions-store", () => ({
  claudeSessionsApi: () => ({ rename }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const SESSION = { key: "k1", name: "metron" } as ClaudeSessionView;

function Harness({ onRenamed }: { onRenamed?: () => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <SessionName
      session={SESSION}
      editing={editing}
      onEditingChange={setEditing}
      onRenamed={onRenamed}
    />
  );
}

beforeEach(() => {
  rename.mockReset();
  rename.mockResolvedValue({ ...SESSION, name: "Fix login 2" });
});
afterEach(cleanup);

describe("SessionName", () => {
  it("renames on Enter after a double-click", async () => {
    const onRenamed = vi.fn();
    render(<Harness onRenamed={onRenamed} />);
    fireEvent.doubleClick(screen.getByText("metron"));
    const input = screen.getByRole("textbox", { name: "Session name" });
    fireEvent.change(input, { target: { value: "  Fix login " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(rename).toHaveBeenCalledWith("k1", "Fix login");
    await vi.waitFor(() =>
      expect(onRenamed).toHaveBeenCalledWith("Fix login 2", "metron"),
    );
  });

  it("discards the draft on Escape", () => {
    render(<Harness />);
    fireEvent.doubleClick(screen.getByText("metron"));
    const input = screen.getByRole("textbox", { name: "Session name" });
    fireEvent.change(input, { target: { value: "Something else" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);

    expect(rename).not.toHaveBeenCalled();
    expect(screen.getByText("metron")).toBeTruthy();
  });

  it("ignores an empty or unchanged name", () => {
    render(<Harness />);
    fireEvent.doubleClick(screen.getByText("metron"));
    fireEvent.blur(screen.getByRole("textbox", { name: "Session name" }));
    expect(rename).not.toHaveBeenCalled();
  });
});
