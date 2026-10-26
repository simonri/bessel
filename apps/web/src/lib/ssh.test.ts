import { describe, expect, it } from "vitest";
import { sshQuote, sshTerminalArgs } from "./ssh";

describe("sshTerminalArgs", () => {
  it("ends ssh's options before the host", () => {
    const args = sshTerminalArgs("-oProxyCommand=touch /tmp/x", "true");
    expect(args.indexOf("--")).toBeLessThan(
      args.indexOf("-oProxyCommand=touch /tmp/x"),
    );
    expect(args).toEqual(["-t", "--", "-oProxyCommand=touch /tmp/x", "true"]);
  });
});

describe("sshQuote", () => {
  it("keeps a path with quotes as one shell word", () => {
    expect(sshQuote("it's here")).toBe("'it'\\''s here'");
  });
});
