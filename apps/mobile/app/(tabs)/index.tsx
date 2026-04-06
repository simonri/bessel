import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WeatherWidget } from "@/components/dashboard/weather-widget";

export default function DashboardScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 p-4">
        <Text className="text-3xl font-bold text-foreground">Dashboard</Text>
        <View className="mt-4">
          <WeatherWidget />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
