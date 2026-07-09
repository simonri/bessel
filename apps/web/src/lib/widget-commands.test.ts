import { describe, expect, it } from "vitest";
import { decodeCommands, encodeCommands } from "./widget-commands";

describe("encodeCommands / decodeCommands", () => {
  it("round-trips a list of commands", () => {
    const commands = ["npm install", "npm run dev"];
    expect(decodeCommands(encodeCommands(commands))).toEqual(commands);
  });

  it("drops blank lines and trims whitespace", () => {
    expect(encodeCommands(["  npm install  ", "", "  ", "npm run dev"])).toBe(
      JSON.stringify(["npm install", "npm run dev"]),
    );
  });

  it("encodes to undefined when there are no real commands", () => {
    expect(encodeCommands([])).toBeUndefined();
    expect(encodeCommands(["", "   "])).toBeUndefined();
  });

  it("decodes missing/invalid input as an empty list", () => {
    expect(decodeCommands(undefined)).toEqual([]);
    expect(decodeCommands("not json")).toEqual([]);
    expect(decodeCommands(JSON.stringify({ not: "an array" }))).toEqual([]);
    expect(decodeCommands(JSON.stringify(["ok", 42, null]))).toEqual(["ok"]);
  });
});
