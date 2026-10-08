import type { Configuration } from "electron-builder";

const config: Configuration = {
  appId: "dev.bessel.app",
  productName: "Bessel",
  executableName: "bessel",
  directories: {
    output: "release",
  },
  afterSign: "scripts/afterSign.js",
  files: ["dist/**/*", "node_modules/**/*"],
  asarUnpack: [
    "**/node_modules/node-pty/**",
    // Loaded as a worker thread, which can't read from inside the asar.
    "dist/agent-usage-worker.js",
    "dist/agent-usage-core.js",
  ],
  extraResources: [
    {
      from: "../web/dist/client",
      to: "web/dist/client",
    },
    {
      from: "../../services/monitor",
      to: "monitor",
    },
  ],
  publish: {
    provider: "github",
    owner: "simonri",
    repo: "bessel",
    releaseType: "release",
  },
  artifactName: "${productName}-${os}-${arch}.${ext}",
  linux: {
    target: ["AppImage"],
    icon: "assets/icon.png",
    category: "Development",
  },
  mac: {
    target: [
      {
        target: "dmg",
        arch: ["arm64"],
      },
    ],
    icon: "assets/icon.png",
    identity: null,
  },
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    icon: "assets/icon.ico",
  },
};

export default config;
