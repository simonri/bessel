import { defineConfig } from "vite-plus";

// Node-only: vault-core.ts (the module under test) must stay importable
// without pulling in "electron", which only resolves inside a running
// Electron process.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
