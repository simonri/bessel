import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isValidFolderName,
  listConfiguredHosts,
  parseHostAliases,
} from "./ssh-config";

describe("parseHostAliases", () => {
  it("reads aliases, several per line, any case", () => {
    const config = [
      "Host gpu1",
      "  HostName 10.0.0.1",
      "host vps edge-box",
      "HOST my_server # the old one",
    ].join("\n");
    expect(parseHostAliases(config)).toEqual([
      "gpu1",
      "vps",
      "edge-box",
      "my_server",
    ]);
  });

  it("reads `Host=` and quoted aliases, as ssh does", () => {
    const config = [
      "Host=gpu1",
      'Host = "vps" edge-box',
      "HostName=10.0.0.1",
    ].join("\n");
    expect(parseHostAliases(config)).toEqual(["gpu1", "vps", "edge-box"]);
  });

  it("skips patterns and commented-out hosts", () => {
    const config = ["Host *", "Host *.internal !bastion", "# Host secret"].join(
      "\n",
    );
    expect(parseHostAliases(config)).toEqual([]);
  });
});

describe("listConfiguredHosts", () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it("follows Include, globs included, without duplicates", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ssh-config-"));
    fs.mkdirSync(path.join(dir, "config.d"));
    fs.writeFileSync(path.join(dir, "config.d", "a"), "Host orb\n");
    fs.writeFileSync(path.join(dir, "config.d", "b"), "Host vps\n");
    fs.writeFileSync(
      path.join(dir, "config"),
      "Include config.d/*\nHost vps\nHost gpu1\n",
    );
    expect(listConfiguredHosts(path.join(dir, "config"))).toEqual([
      "vps",
      "gpu1",
      "orb",
    ]);
  });

  it("follows `Include=` with a quoted path", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ssh-config-"));
    fs.mkdirSync(path.join(dir, "config.d"));
    fs.writeFileSync(path.join(dir, "config.d", "a"), "Host orb\n");
    fs.writeFileSync(path.join(dir, "config"), 'Include="config.d/*"\n');
    expect(listConfiguredHosts(path.join(dir, "config"))).toEqual(["orb"]);
  });

  it("is empty without a config file", () => {
    expect(listConfiguredHosts("/nonexistent/ssh/config")).toEqual([]);
  });
});

describe("isValidFolderName", () => {
  it("allows plain names only", () => {
    expect(isValidFolderName("my-app")).toBe(true);
    expect(isValidFolderName("a b")).toBe(true);
    for (const bad of ["", ".", "..", "a/b", "../x", "a\0b"])
      expect(isValidFolderName(bad)).toBe(false);
  });
});
