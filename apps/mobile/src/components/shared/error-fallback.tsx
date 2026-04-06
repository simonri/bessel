import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/shared/button";

export function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center px-8">
      <Text className="text-foreground text-xl font-bold mb-2">Something went wrong</Text>
      <Text className="text-muted-foreground text-sm text-center mb-6">
        {error.message || "An unexpected error occurred."}
      </Text>
      <Button onPress={resetErrorBoundary}>Try Again</Button>
    </SafeAreaView>
  );
}
