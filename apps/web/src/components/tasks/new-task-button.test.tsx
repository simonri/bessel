// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listProjectsOptions: () => ({
    queryKey: ["projects"],
    queryFn: async () => [{ id: "p1", name: "Uni" }],
  }),
}));

const { NewTaskButton } = await import("./new-task-button");

function mount(defaultProject?: string | null) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NewTaskButton defaultProject={defaultProject} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("NewTaskButton", () => {
  it("opens the full form only when clicked", () => {
    mount();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "New task" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByPlaceholderText("e.g. Website redesign")).toHaveProperty(
      "value",
      "",
    );
  });

  it("starts the task in the project the list is filtered to", () => {
    mount("Uni");

    fireEvent.click(screen.getByRole("button", { name: "New task" }));

    expect(screen.getByPlaceholderText("e.g. Website redesign")).toHaveProperty(
      "value",
      "Uni",
    );
  });
});
