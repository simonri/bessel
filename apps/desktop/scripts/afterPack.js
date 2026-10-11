const fs = require("fs");
const path = require("path");

// node-pty 1.1.0 publishes its prebuilt macOS spawn-helper without the
// executable bit, so every terminal fails with "posix_spawnp failed" unless
// the module is recompiled. The prebuilt pty.node is Node-API and loads in
// Electron as is (npmRebuild is off), so restore the bit instead.
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const prebuilds = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds",
  );
  for (const platform of fs.readdirSync(prebuilds)) {
    const helper = path.join(prebuilds, platform, "spawn-helper");
    if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
  }
};
