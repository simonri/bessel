import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getWorkoutV1WorkoutsWorkoutIdGetOptions } from "@metron/client";
import type { WorkoutLogDetailSchema, WorkoutSetSchema } from "@metron/client";
import { Trophy } from "lucide-react-native";
import { BottomSheet } from "@/components/shared/sheet";
import { client } from "@/lib/client";
import { formatDuration, formatDate, formatTime } from "./lib";

export function WorkoutDetailSheet({ workoutId, onClose, onDelete }: { workoutId: string; onClose: () => void; onDelete: (id: string) => void }) {
  const { data: workout, isLoading } = useQuery({
    ...getWorkoutV1WorkoutsWorkoutIdGetOptions({ client, path: { workout_id: workoutId } }),
  });

  const w = workout as WorkoutLogDetailSchema | undefined;
  const sets = w?.sets ?? [];

  const exerciseGroups = new Map<string, { name: string; sets: WorkoutSetSchema[] }>();
  for (const set of sets) {
    const exId = set.exercise_id;
    if (!exerciseGroups.has(exId)) {
      exerciseGroups.set(exId, { name: (set as any).exercise?.name ?? "Exercise", sets: [] });
    }
    exerciseGroups.get(exId)!.sets.push(set);
  }

  const totalVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
  const duration = w?.completed_at ? formatDuration(w.started_at, w.completed_at) : null;

  return (
    <BottomSheet onDismiss={onClose}>
      {isLoading || !w ? (
        <ActivityIndicator color="#a1a1aa" className="py-8" />
      ) : (
        <View>
          <Text className="text-foreground text-xl font-bold">{formatDate(w.started_at)}</Text>
          <Text className="text-muted-foreground text-sm mt-0.5">{formatTime(w.started_at)}{duration ? ` · ${duration}` : ""}</Text>

          <View className="flex-row gap-3 mt-4 mb-4">
            <View className="flex-1 rounded-xl bg-zinc-800 p-3 items-center">
              <Text className="text-foreground text-lg font-bold">{sets.length}</Text>
              <Text className="text-muted-foreground text-xs">Sets</Text>
            </View>
            <View className="flex-1 rounded-xl bg-zinc-800 p-3 items-center">
              <Text className="text-foreground text-lg font-bold">{totalVolume > 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume}</Text>
              <Text className="text-muted-foreground text-xs">Volume (kg)</Text>
            </View>
            <View className="flex-1 rounded-xl bg-zinc-800 p-3 items-center">
              <Text className="text-foreground text-lg font-bold">{exerciseGroups.size}</Text>
              <Text className="text-muted-foreground text-xs">Exercises</Text>
            </View>
          </View>

          {Array.from(exerciseGroups.entries()).map(([exId, group]) => (
            <View key={exId} className="mb-3">
              <Text className="text-foreground text-sm font-medium mb-1">{group.name}</Text>
              {group.sets.map((set) => (
                <View key={set.id} className="flex-row items-center gap-3 py-1 pl-2">
                  <Text className="text-muted-foreground text-xs w-6">#{set.set_number}</Text>
                  <Text className="text-foreground text-sm">{set.weight}{set.weight_unit} × {set.reps}</Text>
                  {set.is_pr && <Trophy size={12} color="#eab308" />}
                </View>
              ))}
            </View>
          ))}

          {w.notes && (
            <View className="mt-2 pt-3 border-t border-zinc-700">
              <Text className="text-muted-foreground text-sm">{w.notes}</Text>
            </View>
          )}

          <Pressable onPress={() => { onDelete(w.id); onClose(); }} className="mt-4 mb-4 items-center py-3 rounded-xl bg-zinc-800">
            <Text className="text-red-500 text-sm font-medium">Delete Workout</Text>
          </Pressable>
        </View>
      )}
    </BottomSheet>
  );
}
