const { execFileSync } = require("child_process");
const path = require("path");

// The mac build is intentionally unsigned (build.mac.identity is null — no
// Developer ID certificate) and electron-builder's own signing step is a
// no-op as a result. That's fine for Gatekeeper's UI-level "unidentified
// developer" check (worked around by clearing the quarantine attribute, see
// README), but Apple Silicon's kernel-level code signing enforcement (AMFI)
// refuses to execute a Mach-O binary with *no* signature at all, even ad hoc.
// Without this, the app process starts (the Dock icon can even appear/bounce)
// but every window-owning process gets killed before it can render anything.
// Ad-hoc signing (identity "-") satisfies that kernel requirement without
// needing a paid Apple Developer account.
module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
};
