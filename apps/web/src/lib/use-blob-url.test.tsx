// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBlobUrl } from "./use-blob-url";

let made = 0;

beforeEach(() => {
  made = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++made}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("useBlobUrl", () => {
  it("shows the loaded file and lets the old one go when the key changes or the component does", async () => {
    const { result, rerender, unmount } = renderHook(
      ({ key }) => useBlobUrl(key, async () => new Blob([key])),
      { initialProps: { key: "a" } },
    );
    await waitFor(() =>
      expect(result.current).toEqual({ url: "blob:1", failed: false }),
    );

    rerender({ key: "b" });
    await waitFor(() => expect(result.current.url).toBe("blob:2"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenLastCalledWith("blob:2");
  });

  it("ignores a load that finishes after the key moved on", async () => {
    let finish: (blob: Blob) => void = () => {};
    const slow = new Promise<Blob>((resolve) => {
      finish = resolve;
    });
    const { result, rerender } = renderHook(
      ({ key }) =>
        useBlobUrl(key, () =>
          key === "slow" ? slow : Promise.resolve(new Blob(["fast"])),
        ),
      { initialProps: { key: "slow" } },
    );

    rerender({ key: "fast" });
    await waitFor(() => expect(result.current.url).toBe("blob:1"));
    await act(async () => finish(new Blob(["late"])));

    expect(result.current.url).toBe("blob:1");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("says it failed when the load fails or brings no file", async () => {
    const rejected = renderHook(() =>
      useBlobUrl("a", () => Promise.reject(new Error("offline"))),
    );
    const notAFile = renderHook(() =>
      useBlobUrl("b", async () => ({ detail: "The file is missing." })),
    );

    await waitFor(() =>
      expect(rejected.result.current).toEqual({ url: null, failed: true }),
    );
    await waitFor(() =>
      expect(notAFile.result.current).toEqual({ url: null, failed: true }),
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("loads nothing without a key", () => {
    const load = vi.fn(async () => new Blob(["x"]));

    const { result } = renderHook(() => useBlobUrl(null, load));

    expect(load).not.toHaveBeenCalled();
    expect(result.current).toEqual({ url: null, failed: false });
  });
});
