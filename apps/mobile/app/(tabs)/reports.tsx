import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

export default function ReportsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center gap-2 p-4 pb-2">
        <Pressable onPress={() => router.back()}>
          <ArrowLeft size={20} color="#fafafa" />
        </Pressable>
        <Text className="text-3xl font-bold text-foreground">Reports</Text>
      </View>
      <View className="flex-1 p-4" />
    </SafeAreaView>
  );
}
