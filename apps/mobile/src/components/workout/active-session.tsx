import { useState, useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getWorkoutV1WorkoutsWorkoutIdGetQueryKey,
  createWorkoutSetV1WorkoutsWorkoutIdSetsPostMutation,
  getLastSessionV1WorkoutsExercisesExerciseIdLastSessionGetOptions,
} from "@metron/client";
import type { WorkoutLogDetailSchema, WorkoutSetSchema, ExerciseSchema } from "@metron/client";
import { Plus, ChevronLeft, ChevronRight, Timer, Dumbbell } from "lucide-react-native";
import { ExercisePicker } from "./exercise-picker";
import { SetRow } from "./set-row";
import { GoalCard } from "./goal-card";
import { Input } from "@/components/shared/input";
import { client } from "@/lib/client";
import { formatDuration } from "./lib";
import { useTheme } from "@/design-system";

function LiveTimer({ startedAt }: { startedAt: Date | string }) {
  const [, setTick] = useState(0);
  useState(() => {
    const i = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(i);
  });
  return (
    <Text className="text-foreground font-bold tabular-nums" style={{ fontSize: 16 }}>
      {formatDuration(new Date(startedAt))}
    </Text>
  );
}

type ExerciseGroup = { exerciseId: string; exerciseName: string; sets: WorkoutSetSchema[] };

export function ActiveSession({
  workout,
  onFinish,
  onCancel,
}: {
  workout: WorkoutLogDetailSchema;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const workoutQueryKey = getWorkoutV1WorkoutsWorkoutIdGetQueryKey({ client, path: { workout_id: workout.id } });
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [pendingSets, setPendingSets] = useState(0);

  const addSetMutation = useMutation({
    ...createWorkoutSetV1WorkoutsWorkoutIdSetsPostMutation({ client }),
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: workoutQueryKey }); },
  });

  // Group sets by exercise
  const exerciseGroups = useMemo<ExerciseGroup[]>(() => {
    const groups = new Map<string, ExerciseGroup>();
    for (const set of workout.sets ?? []) {
      const exId = set.exercise_id;
      if (!groups.has(exId)) {
        groups.set(exId, {
          exerciseId: exId,
          exerciseName: (set as any).exercise?.name ?? "Exercise",
          sets: [],
        });
      }
      groups.get(exId)!.sets.push(set);
    }
    return Array.from(groups.values());
  }, [workout.sets]);

  const currentGroup = exerciseGroups[currentExIdx];
  const totalExercises = exerciseGroups.length;

  const handleSelectExercise = (exercise: ExerciseSchema) => {
    addSetMutation.mutate(
      { client, path: { workout_id: workout.id }, body: { exercise_id: exercise.id, set_number: 1, reps: 0, weight: 0, weight_unit: "kg" } },
      {
        onSuccess: () => {
          // Navigate to the new exercise (it'll be last)
          setTimeout(() => setCurrentExIdx(exerciseGroups.length), 300);
        },
      },
    );
  };

  const handleCommitSet = (exerciseId: string, setNumber: number, data: { weight: number; reps: number; rir: number | null; set_type: string }) => {
    addSetMutation.mutate({
      client,
      path: { workout_id: workout.id },
      body: {
        exercise_id: exerciseId,
        set_number: setNumber,
        weight: data.weight,
        reps: data.reps,
        weight_unit: "kg",
        rir: data.rir ?? undefined,
        set_type: data.set_type,
      },
    });
    setPendingSets((p) => p + 1);
  };

  const handleFinishExercise = () => {
    if (currentExIdx < totalExercises - 1) {
      setCurrentExIdx(currentExIdx + 1);
      setPendingSets(0);
    } else {
      onFinish();
    }
  };

  const handlePrevExercise = () => {
    if (currentExIdx > 0) setCurrentExIdx(currentExIdx - 1);
  };

  const handleNextExercise = () => {
    if (currentExIdx < totalExercises - 1) setCurrentExIdx(currentExIdx + 1);
  };

  // No exercises yet — show add exercise prompt
  if (totalExercises === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Dumbbell size={48} color={theme.colors.border} />
        <Text className="text-foreground font-semibold mt-4" style={{ fontSize: 18 }}>
          Add your first exercise
        </Text>
        <Text className="text-muted-foreground text-center mt-1 mb-6" style={{ fontSize: 15 }}>
          Tap below to pick an exercise and start logging.
        </Text>
        <Pressable
          onPress={() => setShowPicker(true)}
          className="flex-row items-center gap-2 bg-foreground rounded-xl px-6 py-3"
        >
          <Plus size={16} color={theme.colors.monochrome} />
          <Text className="text-primary-foreground font-semibold" style={{ fontSize: 15 }}>
            Add Exercise
          </Text>
        </Pressable>
        {showPicker && <ExercisePicker onSelect={handleSelectExercise} onClose={() => setShowPicker(false)} />}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ExerciseView
        key={currentGroup.exerciseId}
        group={currentGroup}
        workoutId={workout.id}
        workoutStartedAt={workout.started_at}
        exerciseIndex={currentExIdx}
        totalExercises={totalExercises}
        committedSetCount={currentGroup.sets.length}
        pendingSets={pendingSets}
        onCommitSet={handleCommitSet}
        onFinishExercise={handleFinishExercise}
        onPrev={handlePrevExercise}
        onNext={handleNextExercise}
        onAddExercise={() => setShowPicker(true)}
        onCancel={onCancel}
      />
      {showPicker && <ExercisePicker onSelect={handleSelectExercise} onClose={() => setShowPicker(false)} />}
    </View>
  );
}

function ExerciseView({
  group,
  workoutId,
  workoutStartedAt,
  exerciseIndex,
  totalExercises,
  committedSetCount,
  pendingSets,
  onCommitSet,
  onFinishExercise,
  onPrev,
  onNext,
  onAddExercise,
  onCancel,
}: {
  group: ExerciseGroup;
  workoutId: string;
  workoutStartedAt: Date | string;
  exerciseIndex: number;
  totalExercises: number;
  committedSetCount: number;
  pendingSets: number;
  onCommitSet: (exerciseId: string, setNumber: number, data: { weight: number; reps: number; rir: number | null; set_type: string }) => void;
  onFinishExercise: () => void;
  onPrev: () => void;
  onNext: () => void;
  onAddExercise: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [note, setNote] = useState("");
  const [extraSets, setExtraSets] = useState(0);

  // Fetch ghost data for this exercise
  const { data: lastSession } = useQuery({
    ...getLastSessionV1WorkoutsExercisesExerciseIdLastSessionGetOptions({
      client,
      path: { exercise_id: group.exerciseId },
    }),
  });

  const ghostSets = lastSession?.sets ?? [];
  const bestSet = lastSession?.best_set;
  const bestWeight = bestSet?.weight;

  // Determine how many uncommitted set slots to show
  const targetSetCount = Math.max(ghostSets.length, 1);
  const totalSlots = targetSetCount + extraSets;
  const uncommittedSlots = Math.max(0, totalSlots - committedSetCount);

  const isLastExercise = exerciseIndex === totalExercises - 1;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      {/* Timer bar */}
      <View className="mx-4 mb-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Timer size={14} color={theme.colors.statusGreen} />
          <LiveTimer startedAt={workoutStartedAt} />
        </View>
        <Pressable onPress={onCancel}>
          <Text className="text-muted-foreground" style={{ fontSize: 14 }}>Cancel</Text>
        </Pressable>
      </View>

      {/* Exercise header with nav */}
      <View className="mx-4 mb-4 flex-row items-center">
        <Pressable onPress={onPrev} disabled={exerciseIndex === 0} className="p-2" hitSlop={8}>
          <ChevronLeft size={22} color={exerciseIndex === 0 ? theme.colors.border : theme.colors.subtext} />
        </Pressable>
        <View className="flex-1 items-center">
          <Text className="text-foreground font-bold" style={{ fontSize: 22 }}>
            {group.exerciseName}
          </Text>
          <Text className="text-muted-foreground" style={{ fontSize: 13 }}>
            {exerciseIndex + 1} of {totalExercises}
          </Text>
        </View>
        <Pressable onPress={onNext} disabled={exerciseIndex === totalExercises - 1} className="p-2" hitSlop={8}>
          <ChevronRight size={22} color={exerciseIndex === totalExercises - 1 ? theme.colors.border : theme.colors.subtext} />
        </Pressable>
      </View>

      {/* Goal to Beat */}
      {bestSet && (
        <View className="mb-4">
          <GoalCard weight={bestSet.weight} reps={bestSet.reps} unit={bestSet.weight_unit} />
        </View>
      )}

      {/* Committed sets */}
      {group.sets.map((set) => (
        <SetRow
          key={set.id}
          setNumber={set.set_number}
          bestWeight={bestWeight}
          isCommitted
          isPR={set.is_pr}
          onCommit={() => {}}
        />
      ))}

      {/* Uncommitted set slots */}
      {Array.from({ length: uncommittedSlots }).map((_, i) => {
        const setNum = committedSetCount + i + 1;
        const ghost = ghostSets[setNum - 1];
        return (
          <SetRow
            key={`pending-${setNum}`}
            setNumber={setNum}
            ghostSet={ghost ? { weight: ghost.weight, reps: ghost.reps, rir: ghost.rir, set_type: ghost.set_type } : undefined}
            bestWeight={bestWeight}
            isCommitted={false}
            isPR={false}
            onCommit={(data) => onCommitSet(group.exerciseId, setNum, data)}
          />
        );
      })}

      {/* Add Set */}
      <Pressable
        onPress={() => setExtraSets((s) => s + 1)}
        className="mx-4 mb-4 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-zinc-800"
      >
        <Plus size={16} color={theme.colors.subtext} />
        <Text className="text-muted-foreground font-medium" style={{ fontSize: 15 }}>Add Set</Text>
      </Pressable>

      {/* Exercise note */}
      <View className="mx-4 mb-5 rounded-xl bg-zinc-800 px-4 py-3">
        <Input
          value={note}
          onChangeText={setNote}
          placeholder="Exercise note (grip, cues...)"
          style={{ fontSize: 15 }}
        />
      </View>

      {/* Finish Exercise / Add Another */}
      <View className="mx-4 gap-3">
        <Pressable
          onPress={onFinishExercise}
          className="items-center py-4 rounded-xl bg-foreground"
        >
          <Text className="text-background font-semibold" style={{ fontSize: 16 }}>
            {isLastExercise ? "Finish Workout" : "Finish Exercise"}
          </Text>
        </Pressable>

        {!isLastExercise ? null : (
          <Pressable
            onPress={onAddExercise}
            className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-zinc-800"
          >
            <Plus size={16} color={theme.colors.text} />
            <Text className="text-foreground font-medium" style={{ fontSize: 15 }}>Add Another Exercise</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
