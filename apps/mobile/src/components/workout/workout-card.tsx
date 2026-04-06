import { View, Text, Pressable } from "react-native";
import type { WorkoutLogSchema } from "@metron/client";
import { formatDuration, formatDate, formatTime } from "./lib";

export function WorkoutCard({ workout, onPress }: { workout: WorkoutLogSchema; onPress: () => void }) {
  const duration = workout.completed_at ? formatDuration(workout.started_at, workout.completed_at) : null;

  return (
    <Pressable onPress={onPress} className="mx-4 mb-2 rounded-xl px-4 py-3.5 active:bg-zinc-800/60">
      <View className="flex-row items-center justify-between">
        <Text className="text-foreground text-base font-medium">{formatDate(workout.started_at)}</Text>
        {duration && (
          <View className="rounded-full bg-zinc-800 px-2.5 py-0.5">
            <Text className="text-muted-foreground text-xs">{duration}</Text>
          </View>
        )}
      </View>
      <Text className="text-muted-foreground text-xs mt-0.5">
        {formatTime(workout.started_at)}
        {workout.notes ? ` · ${workout.notes}` : ""}
      </Text>
    </Pressable>
  );
}
