// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vaultAssetUrl } from "../lib/wikilinks";
import { ImageWidget } from "./live-preview";

const copyImage = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  copyImage.mockClear();
  window.electron = {
    vault: { copyImage },
  } as unknown as Window["electron"];
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  window.electron = undefined;
});

describe("live preview image widget", () => {
  it("renders the same selectable, copyable Markdown image control", async () => {
    const widget = new ImageWidget(vaultAssetUrl("/vault", "photo.png"));
    const dom = widget.toDOM();
    document.body.appendChild(dom);

    const image = await screen.findByRole("img", { name: "Embedded image" });
    const button = image.closest("button");
    expect(button).not.toBeNull();

    fireEvent.pointerDown(image);
    fireEvent.keyDown(button as HTMLButtonElement, {
      key: "c",
      metaKey: true,
    });

    await waitFor(() =>
      expect(copyImage).toHaveBeenCalledWith("/vault", "photo.png"),
    );

    act(() => widget.destroy(dom));
  });
});
