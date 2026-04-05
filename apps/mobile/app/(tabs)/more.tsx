import { View, Text, Pressable, ScrollView } from "react-native";
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
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 p-4">
        <Text className="text-3xl font-bold text-foreground mb-4">More</Text>
        {items.map((item) => (
          <Pressable
            key={item.title}
            onPress={() => router.push(item.href as any)}
            className="flex-row items-center gap-3 rounded-lg px-3 py-3 active:bg-accent"
          >
            <item.icon size={20} color="#a1a1aa" />
            <Text className="text-base font-medium text-foreground">
              {item.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
