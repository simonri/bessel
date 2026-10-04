import { describe, expect, it } from "vitest";
import { explainSshError, rawSshError } from "./ssh-errors";

const ipcError = (stderr: string) =>
  new Error(
    `Error invoking remote method 'ssh:list-dir': Error: Command failed: ssh -o BatchMode=yes vps cd ~\n${stderr}`,
  );

describe("explainSshError", () => {
  it.each([
    [
      "ssh: Could not resolve hostname vpz: Name or service not known",
      "Couldn't find a server called “vps”",
    ],
    ["root@vps: Permission denied (publickey).", "didn't accept your SSH key"],
    [
      "ssh: connect to host vps port 22: Connection refused",
      "refused the connection",
    ],
    ["ssh: connect to host vps port 22: Connection timed out", "didn't answer"],
    [
      "@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @",
      "identity has changed",
    ],
  ])("explains %s", (stderr, expected) => {
    expect(explainSshError(ipcError(stderr), "vps")).toContain(expected);
  });

  it("falls back to a generic message", () => {
    expect(explainSshError(ipcError("something odd"), "vps")).toBe(
      "Couldn't connect to vps.",
    );
  });
});

describe("rawSshError", () => {
  it("drops Electron's IPC prefix", () => {
    expect(rawSshError(ipcError("boom"))).toMatch(/^Command failed: ssh/);
  });
});
