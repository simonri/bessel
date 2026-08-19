// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vaultAssetUrl } from "./lib/wikilinks";
import { MarkdownImage } from "./markdown-image";

const copyImage = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  copyImage.mockClear();
  window.electron = {
    vault: { copyImage },
  } as unknown as Window["electron"];
});

afterEach(() => {
  cleanup();
  window.electron = undefined;
});

describe("MarkdownImage", () => {
  it("selects on click and copies the selected image with Ctrl+C", async () => {
    render(
      <MarkdownImage
        src={vaultAssetUrl("/vault", "Images/photo.png")}
        alt="Photo"
      />,
    );

    const image = screen.getByRole("img", { name: "Photo" });
    const button = image.closest("button");
    expect(button).not.toBeNull();

    fireEvent.pointerDown(image);
    expect(button?.dataset.selected).toBe("true");

    fireEvent.keyDown(button as HTMLButtonElement, {
      key: "c",
      ctrlKey: true,
    });

    await waitFor(() =>
      expect(copyImage).toHaveBeenCalledWith("/vault", "Images/photo.png"),
    );
  });

  it("clears the selection when clicking elsewhere", () => {
    render(
      <MarkdownImage src={vaultAssetUrl("/vault", "photo.png")} alt="Photo" />,
    );

    const button = screen.getByRole("button", { name: "Photo" });
    fireEvent.pointerDown(button);
    expect(button.dataset.selected).toBe("true");

    fireEvent.pointerDown(document.body);
    expect(button.dataset.selected).toBeUndefined();
  });

  it("offers Copy image from the context menu", async () => {
    render(
      <MarkdownImage src={vaultAssetUrl("/vault", "photo.png")} alt="Photo" />,
    );

    fireEvent.contextMenu(screen.getByRole("img", { name: "Photo" }));
    fireEvent.click(await screen.findByText("Copy image"));

    await waitFor(() =>
      expect(copyImage).toHaveBeenCalledWith("/vault", "photo.png"),
    );
  });
});
