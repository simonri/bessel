import { View } from "react-native";
import { Text } from "@/components/shared/text";
import { Trophy } from "lucide-react-native";
import { useTheme } from "@/design-system";

export function GoalCard({
  weight,
  reps,
  unit,
}: {
  weight: number;
  reps: number;
  unit: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ marginHorizontal: 16, borderRadius: 12, backgroundColor: theme.colors.overlay12, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Trophy size={20} color={theme.colors.statusYellow} />
      <View>
        <Text style={{ color: theme.colors.textMuted, textTransform: "uppercase", fontSize: 10, fontWeight: "600" }}>
          Goal to Beat
        </Text>
        <Text style={{ color: theme.colors.text, fontWeight: "bold", fontSize: 20 }}>
          {weight}{unit} x {reps}
        </Text>
      </View>
    </View>
  );
}
