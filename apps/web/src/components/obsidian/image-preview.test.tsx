// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImagePreview } from "./image-preview";

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

describe("ImagePreview", () => {
  it("renders a vault image in the app", () => {
    render(<ImagePreview root="/vault with spaces" rel="Images/pic 1.png" />);

    const image = screen.getByRole("img", { name: "pic 1.png" });
    expect(image.className).toContain("h-full");
    expect(image.className).toContain("w-full");
    expect(image.className).toContain("object-contain");
    expect(image.getAttribute("src")).toBe(
      `vault://asset/?root=${encodeURIComponent("/vault with spaces")}&path=${encodeURIComponent("Images/pic 1.png")}`,
    );
  });

  it("shows an in-app error when the image cannot load", () => {
    render(<ImagePreview root="/vault" rel="broken.png" />);

    fireEvent.error(screen.getByRole("img", { name: "broken.png" }));

    expect(screen.getByText("Image unavailable")).toBeTruthy();
    expect(screen.getByText("broken.png couldn't be previewed.")).toBeTruthy();
  });

  it("offers Copy image only through the context menu", async () => {
    render(<ImagePreview root="/vault" rel="photo.png" />);
    const image = screen.getByRole("img", { name: "photo.png" });

    expect(image.closest("button")).toBeNull();
    fireEvent.contextMenu(image);
    fireEvent.click(await screen.findByText("Copy image"));

    await waitFor(() =>
      expect(copyImage).toHaveBeenCalledWith("/vault", "photo.png"),
    );
  });
});
