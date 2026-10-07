import { createClient } from "@bessel/client/client";
import { toApiError } from "@/lib/api-error";
import { refreshAccessToken } from "@/lib/auth-token";

const DEV_API_BASE_URL = "http://127.0.0.1:8100";

/** Sent with a write so the API can replay its first response to a retry
 *  instead of applying it twice (services/api idempotency.py). */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configured) return configured;
  if (import.meta.env.PROD) {
    throw new Error("VITE_API_BASE_URL must be set for production builds");
  }
  return DEV_API_BASE_URL;
}

export const client = createClient({
  baseUrl: apiBaseUrl(),
  credentials: "include",
});

client.interceptors.error.use(async (error, response) => {
  if (response?.status === 401) await refreshAccessToken();
  return toApiError(error, response);
});
