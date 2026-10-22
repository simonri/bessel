import { describe, expect, it } from "vitest";
import { bearerToken, isBankIdLink } from "./klarna-core.js";

describe("bearerToken", () => {
  it("takes the token from either header spelling", () => {
    expect(bearerToken({ Authorization: "Bearer abc" })).toBe("Bearer abc");
    expect(bearerToken({ authorization: "Bearer def" })).toBe("Bearer def");
  });

  it("ignores requests without a user's token", () => {
    expect(bearerToken({})).toBeNull();
    expect(bearerToken({ Authorization: "Basic abc" })).toBeNull();
    expect(bearerToken({ Authorization: "Bearer " })).toBeNull();
  });
});

describe("isBankIdLink", () => {
  it("recognises BankID's scheme only", () => {
    expect(isBankIdLink("bankid:///?autostarttoken=x")).toBe(true);
    expect(isBankIdLink("BankID:///?autostarttoken=x")).toBe(true);
    expect(isBankIdLink("https://www.bankid.com")).toBe(false);
  });
});
