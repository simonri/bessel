import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function DashboardScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 p-4">
        <Text className="text-3xl font-bold text-foreground">Dashboard</Text>
      </View>
    </SafeAreaView>
  );
}
