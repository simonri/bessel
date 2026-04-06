import { View, ScrollView } from "react-native";
import { Text } from "@/components/shared/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { WeatherWidget } from "@/components/dashboard/weather-widget";
import { useTheme } from "@/design-system";

export default function DashboardScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <Text variant="heading" color="text">Dashboard</Text>
        <View style={{ marginTop: 16 }}>
          <WeatherWidget />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
