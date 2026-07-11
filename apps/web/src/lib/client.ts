import { createClient } from "@bessel/client/client";

export const client = createClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8100",
  credentials: "include",
});
