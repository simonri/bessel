import "../global.css";
import { Slot } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { ThemeProvider } from "@shopify/restyle";
import { theme } from "@/design-system";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Box } from "@/components/shared/box";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider theme={theme}>
          <BottomSheetModalProvider>
            <Box flex={1} backgroundColor="background">
              <Slot />
            </Box>
          </BottomSheetModalProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
