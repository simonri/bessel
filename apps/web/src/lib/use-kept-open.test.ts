// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useKeptOpen } from "./use-kept-open";

const a = { id: "a", name: "ICA" };
const renamed = { id: "a", name: "Hemköp" };
const b = { id: "b", name: "Spotify" };

describe("useKeptOpen", () => {
  it("keeps the open item, as last listed, when it leaves the list", () => {
    const { result, rerender } = renderHook(
      ({ items, openId }) => useKeptOpen(items, openId),
      { initialProps: { items: [a, b], openId: "a" as string | null } },
    );
    expect(result.current).toBe(a);

    rerender({ items: [renamed, b], openId: "a" });
    rerender({ items: [b], openId: "a" });

    expect(result.current).toBe(renamed);
  });

  it("lets it go when another item, or none, is opened", () => {
    const { result, rerender } = renderHook(
      ({ items, openId }) => useKeptOpen(items, openId),
      { initialProps: { items: [a, b], openId: "a" as string | null } },
    );

    rerender({ items: [b], openId: null });
    expect(result.current).toBeNull();
    rerender({ items: [b], openId: "c" });
    expect(result.current).toBeNull();
    rerender({ items: [b], openId: "b" });
    expect(result.current).toBe(b);
  });
});
