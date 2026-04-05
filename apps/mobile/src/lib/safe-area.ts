import { useSafeAreaInsets } from "react-native-safe-area-context";

export function useBottomSpacing() {
  const insets = useSafeAreaInsets();
  return Math.max((insets.bottom - 20) * 2, 4);
}
