import { useState, useEffect } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getWorkoutV1WorkoutsWorkoutIdGetQueryKey,
  createWorkoutSetV1WorkoutsWorkoutIdSetsPostMutation,
  deleteWorkoutSetV1WorkoutsWorkoutIdSetsSetIdDeleteMutation,
} from "@metron/client";
import type { WorkoutLogDetailSchema, WorkoutSetSchema, ExerciseSchema } from "@metron/client";
import { Plus, Dumbbell, Timer, Trophy, X, ChevronDown, ChevronUp } from "lucide-react-native";
import { ExercisePicker } from "./exercise-picker";
import { client } from "@/lib/client";
import { formatDuration, formatDate } from "./lib";

function LiveTimer({ startedAt }: { startedAt: Date | string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(i);
  }, []);
  return (
    <Text className="text-foreground text-lg font-bold tabular-nums">
      {formatDuration(new Date(startedAt))}
    </Text>
  );
}

function ExerciseGroup({ exerciseName, sets, workoutId, exerciseId }: { exerciseName: string; sets: WorkoutSetSchema[]; workoutId: string; exerciseId: string }) {
  const [expanded, setExpanded] = useState(true);
  const queryClient = useQueryClient();
  const workoutQueryKey = getWorkoutV1WorkoutsWorkoutIdGetQueryKey({ client, path: { workout_id: workoutId } });

  const addSetMutation = useMutation({ ...createWorkoutSetV1WorkoutsWorkoutIdSetsPostMutation({ client }), onSettled: () => { void queryClient.invalidateQueries({ queryKey: workoutQueryKey }); } });
  const deleteSetMutation = useMutation({ ...deleteWorkoutSetV1WorkoutsWorkoutIdSetsSetIdDeleteMutation({ client }), onSettled: () => { void queryClient.invalidateQueries({ queryKey: workoutQueryKey }); } });

  const handleAddSet = () => {
    const last = sets[sets.length - 1];
    addSetMutation.mutate({ client, path: { workout_id: workoutId }, body: { exercise_id: exerciseId, set_number: sets.length + 1, reps: last?.reps ?? 10, weight: last?.weight ?? 0, weight_unit: last?.weight_unit ?? "kg" } });
  };

  return (
    <View className="mx-4 mb-3 rounded-xl bg-zinc-800/50 overflow-hidden">
      <Pressable onPress={() => setExpanded(!expanded)} className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-row items-center gap-2 flex-1 min-w-0">
          <Dumbbell size={16} color="#a1a1aa" />
          <Text className="text-foreground text-sm font-medium" numberOfLines={1}>{exerciseName}</Text>
          <Text className="text-muted-foreground text-xs">{sets.length}s</Text>
        </View>
        {expanded ? <ChevronUp size={16} color="#71717a" /> : <ChevronDown size={16} color="#71717a" />}
      </Pressable>

      {expanded && (
        <View className="px-4 pb-3">
          <View className="flex-row items-center mb-1">
            <Text className="text-muted-foreground text-[10px] uppercase w-8">Set</Text>
            <Text className="text-muted-foreground text-[10px] uppercase flex-1 text-center">Weight</Text>
            <Text className="text-muted-foreground text-[10px] uppercase flex-1 text-center">Reps</Text>
            <View className="w-8" />
          </View>
          {sets.map((set) => (
            <View key={set.id} className="flex-row items-center py-1.5">
              <Text className="text-muted-foreground text-sm w-8">{set.set_number}</Text>
              <View className="flex-1 flex-row items-center justify-center gap-1">
                <Text className="text-foreground text-sm font-medium">{set.weight}</Text>
                <Text className="text-muted-foreground text-xs">{set.weight_unit}</Text>
              </View>
              <Text className="text-foreground text-sm font-medium flex-1 text-center">{set.reps}</Text>
              <View className="w-8 items-end">
                {set.is_pr ? <Trophy size={14} color="#eab308" /> : (
                  <Pressable onPress={() => deleteSetMutation.mutate({ client, path: { workout_id: workoutId, set_id: set.id } })} hitSlop={8}>
                    <X size={14} color="#52525b" />
                  </Pressable>
                )}
              </View>
            </View>
          ))}
          <Pressable onPress={handleAddSet} disabled={addSetMutation.isPending} className="flex-row items-center justify-center gap-1 mt-2 py-2 rounded-lg bg-zinc-700/50">
            <Plus size={14} color="#a1a1aa" />
            <Text className="text-muted-foreground text-xs font-medium">Add Set</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function ActiveSession({ workout, onFinish, onCancel }: { workout: WorkoutLogDetailSchema; onFinish: () => void; onCancel: () => void }) {
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const queryClient = useQueryClient();
  const workoutQueryKey = getWorkoutV1WorkoutsWorkoutIdGetQueryKey({ client, path: { workout_id: workout.id } });

  const addSetMutation = useMutation({ ...createWorkoutSetV1WorkoutsWorkoutIdSetsPostMutation({ client }), onSettled: () => { void queryClient.invalidateQueries({ queryKey: workoutQueryKey }); } });

  const handleSelectExercise = (exercise: ExerciseSchema) => {
    addSetMutation.mutate({ client, path: { workout_id: workout.id }, body: { exercise_id: exercise.id, set_number: 1, reps: 10, weight: 0, weight_unit: "kg" } });
  };

  const sets = workout.sets ?? [];
  const exerciseGroups = new Map<string, { name: string; sets: WorkoutSetSchema[] }>();
  for (const set of sets) {
    const exId = set.exercise_id;
    if (!exerciseGroups.has(exId)) exerciseGroups.set(exId, { name: (set as any).exercise?.name ?? "Exercise", sets: [] });
    exerciseGroups.get(exId)!.sets.push(set);
  }

  return (
    <View className="flex-1">
      <View className="mx-4 mb-4 rounded-xl bg-zinc-800 p-4">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <Timer size={16} color="#22c55e" />
            <LiveTimer startedAt={workout.started_at} />
          </View>
          <Text className="text-muted-foreground text-xs">{formatDate(workout.started_at)}</Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable onPress={onFinish} className="flex-1 items-center py-2.5 rounded-xl bg-green-600">
            <Text className="text-white text-sm font-medium">Finish</Text>
          </Pressable>
          <Pressable onPress={onCancel} className="items-center justify-center px-4 py-2.5 rounded-xl bg-zinc-700">
            <Text className="text-muted-foreground text-sm">Cancel</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {Array.from(exerciseGroups.entries()).map(([exId, group]) => (
          <ExerciseGroup key={exId} exerciseName={group.name} sets={group.sets} workoutId={workout.id} exerciseId={exId} />
        ))}
        <Pressable onPress={() => setShowExercisePicker(true)} className="mx-4 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-zinc-800">
          <Plus size={16} color="#fafafa" />
          <Text className="text-foreground text-sm font-medium">Add Exercise</Text>
        </Pressable>
      </ScrollView>

      {showExercisePicker && <ExercisePicker onSelect={handleSelectExercise} onClose={() => setShowExercisePicker(false)} />}
    </View>
  );
}
