import { View, Pressable } from "react-native";
import { Text } from "@/components/shared/text";
import type { WorkoutLogSchema } from "@metron/client";
import { formatDuration, formatDate, formatTime } from "./lib";
import { useTheme } from "@/design-system";

export function WorkoutCard({ workout, onPress }: { workout: WorkoutLogSchema; onPress: () => void }) {
  const theme = useTheme();
  const duration = workout.completed_at ? formatDuration(workout.started_at, workout.completed_at) : null;

  return (
    <Pressable onPress={onPress} style={{ marginHorizontal: 16, marginBottom: 8, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text variant="bodyEmphasis" color="text">{formatDate(workout.started_at)}</Text>
        {duration && (
          <View style={{ borderRadius: 9999, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 10, paddingVertical: 2 }}>
            <Text variant="caption" color="subtext">{duration}</Text>
          </View>
        )}
      </View>
      <Text variant="caption" color="subtext" style={{ marginTop: 2 }}>
        {formatTime(workout.started_at)}
        {workout.notes ? ` · ${workout.notes}` : ""}
      </Text>
    </Pressable>
  );
}
