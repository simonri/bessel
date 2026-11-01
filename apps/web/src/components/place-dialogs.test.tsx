// @vitest-environment jsdom
import type { PlaceSchema } from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddPlaceDialog } from "./add-place-dialog";
import { EditPlaceDialog } from "./edit-place-dialog";

function mount(ui: ReactNode) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {ui}
    </QueryClientProvider>,
  );
}

const visitedAt = (id: string) =>
  (document.getElementById(id) as HTMLInputElement).value;

beforeEach(() => {
  vi.stubEnv("TZ", "Europe/Stockholm");
  vi.useFakeTimers({ toFake: ["Date"] });
  // 00:30 on 29 October in Stockholm, still the 28th in UTC.
  vi.setSystemTime(new Date("2026-10-28T23:30:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("marking a place visited", () => {
  it("dates a new place's visit today, after local midnight", () => {
    mount(<AddPlaceDialog />);
    fireEvent.click(screen.getByText("Add place"));
    fireEvent.click(screen.getByText("Add manually instead"));
    fireEvent.click(screen.getByText("Visited"));
    expect(visitedAt("place-visited-at")).toBe("2026-10-29");
  });

  it("dates an existing place's visit today, after local midnight", () => {
    const place = {
      id: "p1",
      name: "Test cafe",
      status: "want_to_go",
      visited_at: null,
      tags: [],
    } as unknown as PlaceSchema;
    mount(<EditPlaceDialog place={place} />);
    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.click(screen.getByText("Visited"));
    expect(visitedAt("edit-place-visited-at")).toBe("2026-10-29");
  });
});
