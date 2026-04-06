import { Text } from "@/components/shared/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/shared/button";
import { useTheme } from "@/design-system";

export function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  const theme = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
      <Text variant="title" color="text" style={{ marginBottom: 8 }}>Something went wrong</Text>
      <Text variant="label" color="subtext" style={{ textAlign: "center", marginBottom: 24 }}>
        {error.message || "An unexpected error occurred."}
      </Text>
      <Button onPress={resetErrorBoundary}>Try Again</Button>
    </SafeAreaView>
  );
}
