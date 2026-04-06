import { View, Text } from "react-native";
import { Trophy } from "lucide-react-native";

export function GoalCard({
  weight,
  reps,
  unit,
}: {
  weight: number;
  reps: number;
  unit: string;
}) {
  return (
    <View className="mx-4 rounded-xl bg-zinc-800/50 p-4 flex-row items-center gap-3">
      <Trophy size={20} color="#facc15" />
      <View>
        <Text className="text-muted-foreground uppercase" style={{ fontSize: 10, fontWeight: "600" }}>
          Goal to Beat
        </Text>
        <Text className="text-foreground font-bold" style={{ fontSize: 20 }}>
          {weight}{unit} x {reps}
        </Text>
      </View>
    </View>
  );
}
