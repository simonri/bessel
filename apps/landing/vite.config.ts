import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import viteTsConfigPaths from "vite-tsconfig-paths";

const config = defineConfig({
  build: {
    ssr: false,
  },
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart({
      // Static-site prerender (not `spa` mode): `spa` mode intentionally
      // writes an empty hydration shell for client-only apps and was
      // silently producing a bodyless index.html here, so Google had no
      // crawlable text at all. This renders real HTML per route instead.
      prerender: {
        enabled: true,
        crawlLinks: true,
      },
      sitemap: {
        enabled: true,
        host: "https://getbessel.com",
      },
    }),
    viteReact(),
  ],
});

export default config;
