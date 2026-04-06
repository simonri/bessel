import { Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
      <Pressable
        onPress={resetErrorBoundary}
        className="bg-foreground rounded-xl px-6 py-3"
      >
        <Text className="text-primary-foreground text-sm font-semibold">Try Again</Text>
      </Pressable>
    </SafeAreaView>
  );
}
