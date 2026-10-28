import { describe, expect, it } from "vitest";
import {
  isTrustedFolder,
  phoneNotificationsFrom,
  unitFileFor,
  unitNameFor,
  withPhoneNotifications,
  withTrustedFolder,
} from "./remote-control-core";

describe("unitNameFor", () => {
  it("names the unit after the folder, kept apart from a same-named folder elsewhere", () => {
    const metron = unitNameFor("/home/simon/dev/metron");
    expect(metron).toMatch(
      /^bessel-remote-control-metron-[0-9a-f]{8}\.service$/,
    );
    expect(unitNameFor("/home/simon/dev/metron")).toBe(metron);
    expect(unitNameFor("/srv/metron")).not.toBe(metron);
    expect(unitNameFor("/home/simon/My Project!")).toMatch(
      /^bessel-remote-control-my-project-[0-9a-f]{8}\.service$/,
    );
  });
});

describe("unitFileFor", () => {
  const unit = unitFileFor("/home/simon/dev/metron", "Bessel");

  it("serves new sessions in the folder through a login shell and a terminal", () => {
    expect(unit).toContain("WorkingDirectory=/home/simon/dev/metron\n");
    const exec = unit.split("\n").find((l) => l.startsWith("ExecStart="));
    expect(exec).toBe(
      `ExecStart=/bin/bash -lic "exec script -qfc 'claude remote-control --spawn same-dir --no-create-session-in-dir --permission-mode bypassPermissions --remote-control-session-name-prefix '\\\\''Bessel'\\\\''' /dev/null"`,
    );
  });

  it("restarts after a crash, but gives up on one that keeps failing", () => {
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("StartLimitBurst=5");
    expect(unit).toContain("StandardOutput=null");
    expect(unit).toContain("WantedBy=default.target");
  });

  it("keeps quotes, dollars and percents in names and paths from reaching the shell or systemd", () => {
    const odd = unitFileFor('/home/simon/dev/100% "real"', "it's $HOME");
    expect(odd).toContain('WorkingDirectory=/home/simon/dev/100%% "real"\n');
    expect(() => unitFileFor("/a\nExecStart=/bin/evil", "x")).toThrow();
    const exec = odd.split("\n").find((l) => l.startsWith("ExecStart=")) ?? "";
    expect(exec).toContain("$$HOME");
    expect(exec).toContain(`'\\\\''`);
  });
});

describe("isTrustedFolder", () => {
  it("is true once Claude's trust prompt was accepted there or in a folder around it", () => {
    const config = {
      projects: {
        "/a": { hasTrustDialogAccepted: true },
        "/b": { hasTrustDialogAccepted: false },
      },
    };
    expect(isTrustedFolder(config, "/a")).toBe(true);
    expect(isTrustedFolder(config, "/b")).toBe(false);
    expect(isTrustedFolder(config, "/c")).toBe(false);
    expect(isTrustedFolder(config, "/a/worktrees/one")).toBe(true);
    expect(isTrustedFolder(config, "/b/inside")).toBe(false);
    expect(isTrustedFolder(null, "/a")).toBe(false);
  });
});

describe("phone notifications", () => {
  it("read Claude's two push settings, off when unset", () => {
    expect(
      phoneNotificationsFrom({
        inputNeededNotifEnabled: true,
        agentPushNotifEnabled: false,
      }),
    ).toEqual({ inputNeeded: true, claudeDecides: false });
    expect(phoneNotificationsFrom(null)).toEqual({
      inputNeeded: false,
      claudeDecides: false,
    });
  });

  it("change only the setting asked for, leaving hooks and permissions as they were", () => {
    const settings = {
      hooks: { Stop: [{ command: "notify" }] },
      permissions: { allow: ["Bash(ls)"] },
      agentPushNotifEnabled: true,
    };
    expect(withPhoneNotifications(settings, { inputNeeded: true })).toEqual({
      ...settings,
      inputNeededNotifEnabled: true,
    });
    expect(withPhoneNotifications(settings, { claudeDecides: false })).toEqual({
      ...settings,
      agentPushNotifEnabled: false,
    });
    expect(settings).not.toHaveProperty("inputNeededNotifEnabled");
  });
});

describe("withTrustedFolder", () => {
  it("trusts the folder as Claude's prompt would, leaving every other project and setting alone", () => {
    const config = {
      numStartups: 7,
      projects: {
        "/home/me/app": {
          allowedTools: ["Bash"],
          hasTrustDialogAccepted: false,
        },
        "/home/me/other": { hasTrustDialogAccepted: true },
      },
    };

    const next = withTrustedFolder(config, "/home/me/app/");

    expect(next).toEqual({
      numStartups: 7,
      projects: {
        "/home/me/app": {
          allowedTools: ["Bash"],
          hasTrustDialogAccepted: true,
        },
        "/home/me/other": { hasTrustDialogAccepted: true },
      },
    });
    expect(config.projects["/home/me/app"].hasTrustDialogAccepted).toBe(false);
    expect(isTrustedFolder(next, "/home/me/app")).toBe(true);
  });

  it("starts the config when there is none", () => {
    expect(withTrustedFolder(null, "/new")).toEqual({
      projects: { "/new": { hasTrustDialogAccepted: true } },
    });
  });
});
