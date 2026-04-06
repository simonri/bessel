import { Tabs } from "expo-router";
import { FloatingTabBar } from "@/components/shared/floating-tab-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorFallback } from "@/components/shared/error-fallback";
import { useQueryClient } from "@tanstack/react-query";
import { ErrorBoundary as ErrorBoundaryComponent } from "react-error-boundary";
import { useRouter } from "expo-router";
import { MetronClientProvider } from "@/providers/metron-client-provider";
import { MetronQueryClientProvider } from "@/providers/metron-query-client-provider";
import { DarkTheme, ThemeProvider } from '@react-navigation/native'

function RootLayout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return (
    <ErrorBoundaryComponent
      onReset={() => {
        queryClient.clear()
        router.replace('/')
      }}
      fallbackRender={({ error, resetErrorBoundary }) => (
        <ErrorFallback error={error as Error} resetErrorBoundary={resetErrorBoundary} />
      )}
    >
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          sceneStyle: { backgroundColor: "#09090b" },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
        <Tabs.Screen name="travel" options={{ title: "Travel" }} />
        <Tabs.Screen name="tasks" options={{ title: "Tasks" }} />
        <Tabs.Screen name="more" options={{ title: "More" }} />
        {/* Hidden from tab bar, navigable from More menu */}
        <Tabs.Screen name="transactions" options={{ href: null }} />
        <Tabs.Screen name="accounts" options={{ href: null }} />
        <Tabs.Screen name="investments" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="workout" options={{ href: null }} />
        <Tabs.Screen name="reports" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </ErrorBoundaryComponent>
  );
}

export default function Providers() {
  return (
    <ThemeProvider value={DarkTheme}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <MetronClientProvider>
          <MetronQueryClientProvider>
            <RootLayout />
          </MetronQueryClientProvider>
        </MetronClientProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  )
}