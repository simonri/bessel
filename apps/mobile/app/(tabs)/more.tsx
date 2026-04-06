import { View, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/shared/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ArrowLeftRight,
  Landmark,
  TrendingUp,
  BookOpen,
  Dumbbell,
  PieChart,
  Settings,
} from "lucide-react-native";
import { useTheme } from "@/design-system";

const items = [
  { title: "Transactions", icon: ArrowLeftRight, href: "/(tabs)/transactions" },
  { title: "Accounts", icon: Landmark, href: "/(tabs)/accounts" },
  { title: "Investments", icon: TrendingUp, href: "/(tabs)/investments" },
  { title: "Journal", icon: BookOpen, href: "/(tabs)/journal" },
  { title: "Workout", icon: Dumbbell, href: "/(tabs)/workout" },
  { title: "Reports", icon: PieChart, href: "/(tabs)/reports" },
  { title: "Settings", icon: Settings, href: "/(tabs)/settings" },
] as const;

export default function MoreScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <Text variant="heading" color="text" style={{ marginBottom: 16 }}>More</Text>
        {items.map((item) => (
          <Pressable
            key={item.title}
            onPress={() => router.push(item.href as any)}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12 }}
          >
            <item.icon size={20} color={theme.colors.textMuted} />
            <Text variant="bodyEmphasis" color="text">
              {item.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
