import { describe, expect, it } from "vitest";
import { formatAxisKr, formatKr } from "./money";

// sv-SE groups thousands with a no-break space and writes minus as U+2212.
const plain = (text: string) => text.replace(/\s/g, " ").replace("−", "-");

describe("formatKr", () => {
  it("rounds to whole kronor and says kr", () => {
    expect(plain(formatKr(123456))).toBe("1 235 kr");
    expect(plain(formatKr(-10900))).toBe("-109 kr");
  });

  it("keeps the code for other currencies", () => {
    expect(plain(formatKr(250000, "EUR"))).toBe("2 500 EUR");
  });

  it("shortens a million or more only when compact", () => {
    expect(plain(formatKr(297_000_000, "SEK", { compact: true }))).toBe(
      "2,97 mn kr",
    );
    expect(plain(formatKr(99_999_900, "SEK", { compact: true }))).toBe(
      "999 999 kr",
    );
    expect(plain(formatKr(297_000_000))).toBe("2 970 000 kr");
  });

  it("puts a plus on gains when asked", () => {
    expect(plain(formatKr(5000, "SEK", { sign: true }))).toBe("+50 kr");
    expect(plain(formatKr(-5000, "SEK", { sign: true }))).toBe("-50 kr");
    expect(plain(formatKr(5000))).toBe("50 kr");
  });
});

describe("formatAxisKr", () => {
  it("uses k for thousands and mn for millions", () => {
    expect(plain(formatAxisKr(95000))).toBe("950");
    expect(formatAxisKr(34_000_000)).toBe("340k");
    expect(plain(formatAxisKr(120_000_000))).toBe("1,2 mn");
  });
});
