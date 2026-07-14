import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Mirrors Electron's app.getPath("userData") for the packaged desktop app
 * (apps/desktop/src/main.ts pins it to `<appData>/@bessel/desktop`). This CLI
 * runs as plain Node — no `app` module available — so the platform-specific
 * appData root is reproduced by hand here.
 */
export function besselDesktopUserDataDir(): string {
  const home = homedir();
  const appData =
    process.platform === "darwin"
      ? join(home, "Library", "Application Support")
      : process.platform === "win32"
        ? (process.env.APPDATA ?? join(home, "AppData", "Roaming"))
        : (process.env.XDG_CONFIG_HOME ?? join(home, ".config"));
  return join(appData, "@bessel", "desktop");
}

export function cliCredentialsDir(): string {
  return join(homedir(), ".config", "bessel-axi");
}
