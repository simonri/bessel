import { useTheme as useRestyleTheme } from "@shopify/restyle";
import type { Theme } from "./theme";

export function useTheme() {
  return useRestyleTheme<Theme>();
}
