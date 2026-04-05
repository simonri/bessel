import "../global.css";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { ReactQueryProvider } from "@/providers/react-query";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <ReactQueryProvider>
          <StatusBar style="light" />
          <Slot />
        </ReactQueryProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
