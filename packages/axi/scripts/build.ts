import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

// Bundled into a single file so it can be copied into the packaged desktop
// app's resources (extraResources) and run via a PATH shim without carrying
// node_modules along — see apps/desktop/src/cli-broker.ts for how it's
// installed.
await build({
  entryPoints: ["src/bin/bessel-axi.ts"],
  // .mjs, not .js: this file is copied alone into the packaged app's
  // resources (no accompanying package.json for Node to read a "type" field
  // from), so the extension is what tells Node to parse it as ESM.
  outfile: "dist/bin/bessel-axi.mjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  banner: { js: "#!/usr/bin/env node" },
  // No package.json ships alongside the bundle, so the version can't be read
  // from disk at runtime like a normal installed CLI would — inline it.
  define: { __BESSEL_AXI_VERSION__: JSON.stringify(pkg.version) },
});
