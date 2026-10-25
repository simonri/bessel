import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "../../services/api/openapi.json",
  logs: { file: false },
  output: {
    format: "prettier",
    path: "./src",
  },
  plugins: [
    {
      name: "@hey-api/client-fetch",
      exportFromIndex: true,
    },
    "@hey-api/schemas",
    {
      dates: true,
      name: "@hey-api/transformers",
    },
    {
      enums: "javascript",
      name: "@hey-api/typescript",
    },
    {
      name: "@hey-api/sdk",
      transformer: true,
      exportFromIndex: true,
    },
    {
      name: "@tanstack/react-query",
      exportFromIndex: true,
    },
  ],
});
