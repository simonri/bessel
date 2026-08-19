// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImagePreview } from "./image-preview";

afterEach(cleanup);

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
});
