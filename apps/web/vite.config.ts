import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    ssr: false,
    rolldownOptions: {
      output: {
        // React and the login library load on every page and rarely change;
        // in their own chunks they stay cached across app releases.
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            { name: "auth0", test: /node_modules[\\/]@auth0[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          outputPath: "/index.html",
          crawlLinks: true,
        },
      },
    }),
    viteReact(),
  ],
});

export default config;
