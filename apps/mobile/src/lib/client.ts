import { createClient } from "@metron/client/client";

const IS_DEV = __DEV__;
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || (IS_DEV ? "http://localhost:8100" : "http://vps:8080");

export const client = createClient({
  baseUrl: API_BASE_URL,
});
