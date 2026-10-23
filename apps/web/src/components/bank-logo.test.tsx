// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BankLogo, brandIcon } from "./bank-logo";

afterEach(cleanup);

function shown(name: string, logo?: string | null) {
  const { container } = render(<BankLogo name={name} logo={logo} />);
  const tile = container.firstElementChild as HTMLElement;
  return { tile, img: tile.querySelector("img") };
}

describe("BankLogo", () => {
  it("uses a known brand's own icon, filling the tile, over its listed wordmark", () => {
    const { tile, img } = shown(
      "Klarna pay later",
      "https://enablebanking.com/brands/SE/Klarna/",
    );

    expect(img?.getAttribute("src")).toBe("/brands/klarna.png");
    expect(img?.className).toContain("object-cover");
    expect(tile.className).not.toContain("bg-white");
  });

  it("puts any other bank's listed logo on a white tile", () => {
    const { tile, img } = shown(
      "Nordea",
      "https://enablebanking.com/brands/SE/Nordea/",
    );

    expect(img?.getAttribute("src")).toBe(
      "https://enablebanking.com/brands/SE/Nordea/",
    );
    expect(img?.className).toContain("object-contain");
    expect(tile.className).toContain("bg-white");
  });

  it("falls back to the listed logo, then to initials, when images don't load", () => {
    const { tile, img } = shown(
      "Skandia",
      "https://enablebanking.com/brands/SE/Skandia/",
    );
    fireEvent.error(img as HTMLImageElement);
    const listed = tile.querySelector("img");
    expect(listed?.getAttribute("src")).toBe(
      "https://enablebanking.com/brands/SE/Skandia/",
    );

    fireEvent.error(listed as HTMLImageElement);
    expect(tile.ownerDocument.body.textContent).toBe("SK");
  });

  it("knows the brands by their first word, whatever the case", () => {
    expect(brandIcon("Marginalen Bank")).toBe("/brands/marginalen.png");
    expect(brandIcon("AVANZA")).toBe("/brands/avanza.png");
    expect(brandIcon("Montrose")).toBe("/brands/montrose.png");
    expect(brandIcon("Nordea")).toBeUndefined();
  });
});
