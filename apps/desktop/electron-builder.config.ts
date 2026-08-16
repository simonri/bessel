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
  asarUnpack: ["**/node_modules/node-pty/**"],
  extraResources: [
    {
      from: "../web/dist/client",
      to: "web/dist/client",
    },
    {
      from: "../../packages/axi/dist",
      to: "axi",
    },
    {
      from: "../../services/monitor",
      to: "monitor",
    },
    {
      from: "../../tools/agent-usage-collector",
      to: "agent-usage-collector",
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
