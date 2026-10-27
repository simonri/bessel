import { describe, expect, it } from "vitest";
import { centreSquare } from "./contact-photo";

describe("centreSquare", () => {
  it("crops a wide image to its middle", () => {
    expect(centreSquare(1200, 800)).toEqual({ x: 200, y: 0, side: 800 });
  });

  it("crops a tall image to its middle", () => {
    expect(centreSquare(600, 1000)).toEqual({ x: 0, y: 200, side: 600 });
  });

  it("leaves a square as it is", () => {
    expect(centreSquare(512, 512)).toEqual({ x: 0, y: 0, side: 512 });
  });
});
