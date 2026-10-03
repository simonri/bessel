import { describe, expect, it } from "vitest";
import { placeBeside } from "./popover-placement";

const viewport = { width: 1400, height: 950 };
const size = { width: 360, height: 400 };
const box = (top: number, bottom: number, left = 600, right = 750) => ({
  top,
  bottom,
  left,
  right,
});

describe("placeBeside", () => {
  it("centres on the event, to its right", () => {
    expect(placeBeside(box(400, 450), size, viewport)).toEqual({
      side: "right",
      alignOffset: 425 - 200 - 400,
    });
  });

  it("stays inside the viewport near the top and bottom", () => {
    expect(placeBeside(box(20, 60), size, viewport).alignOffset).toBe(12 - 20);
    expect(placeBeside(box(900, 940), size, viewport).alignOffset).toBe(
      950 - 12 - 400 - 900,
    );
  });

  it("centres on the visible part of a tall event", () => {
    // Visible from 0 to 600: middle at 300.
    expect(placeBeside(box(-400, 600), size, viewport).alignOffset).toBe(
      300 - 200 + 400,
    );
  });

  it("flips left when there's no room on the right", () => {
    expect(placeBeside(box(400, 450, 1100, 1250), size, viewport).side).toBe(
      "left",
    );
  });

  it("stays right when neither side fits", () => {
    expect(placeBeside(box(400, 450, 100, 1250), size, viewport).side).toBe(
      "right",
    );
  });
});
