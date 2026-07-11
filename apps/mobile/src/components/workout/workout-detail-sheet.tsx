import { View, ActivityIndicator } from "react-native";
import { Text } from "@/components/shared/text";
import { Button } from "@/components/shared/button";
import { useQuery } from "@tanstack/react-query";
import { getWorkoutV1WorkoutsWorkoutIdGetOptions } from "@bessel/client";
import type { WorkoutLogDetailSchema, WorkoutSetSchema } from "@bessel/client";
import { Trophy } from "lucide-react-native";
import { BottomSheet } from "@/components/shared/sheet";
import { client } from "@/lib/client";
import { formatDuration, formatDate, formatTime } from "./lib";
import { useTheme } from "@/design-system";

export function WorkoutDetailSheet({ workoutId, onClose, onDelete }: { workoutId: string; onClose: () => void; onDelete: (id: string) => void }) {
  const theme = useTheme();
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
        <ActivityIndicator color={theme.colors.subtext} style={{ paddingVertical: 32 }} />
      ) : (
        <View>
          <Text variant="title" color="text">{formatDate(w.started_at)}</Text>
          <Text variant="label" color="subtext" style={{ marginTop: 2 }}>{formatTime(w.started_at)}{duration ? ` · ${duration}` : ""}</Text>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 16, marginBottom: 16 }}>
            <View style={{ flex: 1, borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, padding: 12, alignItems: "center" }}>
              <Text variant="title" color="text">{sets.length}</Text>
              <Text variant="caption" color="subtext">Sets</Text>
            </View>
            <View style={{ flex: 1, borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, padding: 12, alignItems: "center" }}>
              <Text variant="title" color="text">{totalVolume > 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume}</Text>
              <Text variant="caption" color="subtext">Volume (kg)</Text>
            </View>
            <View style={{ flex: 1, borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, padding: 12, alignItems: "center" }}>
              <Text variant="title" color="text">{exerciseGroups.size}</Text>
              <Text variant="caption" color="subtext">Exercises</Text>
            </View>
          </View>

          {Array.from(exerciseGroups.entries()).map(([exId, group]) => (
            <View key={exId} style={{ marginBottom: 12 }}>
              <Text variant="body" color="text" style={{ marginBottom: 4 }}>{group.name}</Text>
              {group.sets.map((set) => (
                <View key={set.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4, paddingLeft: 8 }}>
                  <Text variant="caption" color="subtext" style={{ width: 24 }}>#{set.set_number}</Text>
                  <Text variant="label" color="text">{set.weight}{set.weight_unit} × {set.reps}</Text>
                  {set.is_pr && <Trophy size={12} color={theme.colors.statusYellow} />}
                </View>
              ))}
            </View>
          ))}

          {w.notes && (
            <View style={{ marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderColor: theme.colors.border }}>
              <Text variant="label" color="subtext">{w.notes}</Text>
            </View>
          )}

          <Button variant="destructive" onPress={() => { onDelete(w.id); onClose(); }} fullWidth>Delete Workout</Button>
        </View>
      )}
    </BottomSheet>
  );
}
