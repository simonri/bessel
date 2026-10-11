// Run with the packaged app's own Electron (ELECTRON_RUN_AS_NODE=1) and its
// resources directory: proves node-pty loads and spawns in that Electron.
const path = require("node:path");

const resources = path.resolve(process.argv[2]);
const pty = require(
  // Through app.asar, as the app loads it: node-pty maps its helper paths
  // from there to app.asar.unpacked itself.
  path.join(resources, "app.asar", "node_modules", "node-pty"),
);
const [file, args] =
  process.platform === "win32"
    ? ["cmd.exe", ["/c", "echo PTY_OK"]]
    : ["/bin/sh", ["-c", "echo PTY_OK"]];

const term = pty.spawn(file, args, { cols: 80, rows: 24 });
let output = "";
term.onData((data) => {
  output += data;
});
const timeout = setTimeout(() => {
  console.error("node-pty smoke test timed out:", JSON.stringify(output));
  process.exit(1);
}, 20_000);
term.onExit(() => {
  clearTimeout(timeout);
  if (!output.includes("PTY_OK")) {
    console.error("node-pty smoke test failed:", JSON.stringify(output));
    process.exit(1);
  }
  console.log(`node-pty OK in Electron ${process.versions.electron}`);
  process.exit(0);
});
