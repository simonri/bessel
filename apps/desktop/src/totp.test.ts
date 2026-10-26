import { describe, expect, it } from "vitest";
import {
  base32Decode,
  hotp,
  InvalidTotpSecretError,
  msUntilNextCode,
  totp,
} from "./totp.js";

// ASCII "12345678901234567890", the RFC 4226 / RFC 6238 SHA-1 test key.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("base32Decode", () => {
  it("decodes the RFC test key", () => {
    expect(base32Decode(RFC_SECRET).toString("ascii")).toBe(
      "12345678901234567890",
    );
  });

  it("accepts lowercase, spaces and padding", () => {
    expect(base32Decode("mzxw 6ytb oi======").toString("ascii")).toBe("foobar");
  });

  it("rejects characters outside the alphabet and empty secrets", () => {
    expect(() => base32Decode("GEZDGNB1")).toThrow(InvalidTotpSecretError);
    expect(() => base32Decode("GEZDGNB8")).toThrow(InvalidTotpSecretError);
    expect(() => base32Decode("  ")).toThrow(InvalidTotpSecretError);
  });
});

describe("hotp", () => {
  it("matches the RFC 4226 appendix D values", () => {
    const key = Buffer.from("12345678901234567890", "ascii");
    const expected = [
      "755224",
      "287082",
      "359152",
      "969429",
      "338314",
      "254676",
      "287922",
      "162583",
      "399871",
      "520489",
    ];
    expect(expected.map((_, counter) => hotp(key, counter))).toEqual(expected);
  });
});

describe("totp", () => {
  it("matches the RFC 6238 SHA-1 values (last six digits)", () => {
    const vectors: [number, string][] = [
      [59, "287082"],
      [1111111109, "081804"],
      [1111111111, "050471"],
      [1234567890, "005924"],
      [2000000000, "279037"],
      [20000000000, "353130"],
    ];
    for (const [seconds, code] of vectors)
      expect(totp(RFC_SECRET, seconds * 1000)).toBe(code);
  });

  it("reads a secret typed in lowercase with spaces", () => {
    expect(totp("gezd gnbv gy3t qojq gezd gnbv gy3t qojq", 59_000)).toBe(
      "287082",
    );
  });
});

describe("msUntilNextCode", () => {
  it("waits for the next 30 s step plus a second", () => {
    expect(msUntilNextCode(59_000)).toBe(2_000);
    expect(msUntilNextCode(60_000)).toBe(31_000);
    expect(msUntilNextCode(75_500)).toBe(15_500);
  });
});
