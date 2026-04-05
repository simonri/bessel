import { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  ActionSheetIOS,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  listWorkoutsV1WorkoutsGetInfiniteOptions,
  listWorkoutsV1WorkoutsGetQueryKey,
  getWorkoutV1WorkoutsWorkoutIdGetOptions,
  getWorkoutV1WorkoutsWorkoutIdGetQueryKey,
  createWorkoutV1WorkoutsPostMutation,
  updateWorkoutV1WorkoutsWorkoutIdPatchMutation,
  deleteWorkoutV1WorkoutsWorkoutIdDeleteMutation,
  createWorkoutSetV1WorkoutsWorkoutIdSetsPostMutation,
  deleteWorkoutSetV1WorkoutsWorkoutIdSetsSetIdDeleteMutation,
  listExercisesV1WorkoutsExercisesGetInfiniteOptions,
  listRecentExercisesV1WorkoutsExercisesRecentGetOptions,
} from "@metron/client";
import type {
  WorkoutLogSchema,
  WorkoutLogDetailSchema,
  WorkoutSetSchema,
  ExerciseSchema,
} from "@metron/client";
import {
  Plus,
  Dumbbell,
  Timer,
  Trophy,
  Trash2,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BottomSheet } from "@/components/sheet";
import { client } from "@/lib/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(start: Date, end?: Date | null): string {
  const ms = ((end ?? new Date()).getTime() - new Date(start).getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function formatDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Live Timer
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = "log" | "history";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <View className="flex-row mx-4 mb-3 gap-2">
      {(["log", "history"] as const).map((tab) => (
        <Pressable
          key={tab}
          onPress={() => onChange(tab)}
          className={`rounded-full px-4 py-1.5 ${
            active === tab ? "bg-foreground" : "bg-zinc-800"
          }`}
        >
          <Text
            className={`text-sm font-medium capitalize ${
              active === tab ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {tab === "log" ? "Workout" : "History"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Exercise Picker (Bottom Sheet)
// ---------------------------------------------------------------------------

function ExercisePicker({
  onSelect,
  onClose,
}: {
  onSelect: (exercise: ExerciseSchema) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);

  const { data: recentData } = useQuery({
    ...listRecentExercisesV1WorkoutsExercisesRecentGetOptions({
      client,
      query: { limit: 10 },
    }),
  } as any);
  const recent = (recentData as ExerciseSchema[]) ?? [];

  const { data: searchData, isLoading: isSearching } = useQuery({
    ...(listExercisesV1WorkoutsExercisesGetInfiniteOptions as any)({
      client,
      query: { q: search, limit: 50 },
    }),
    enabled: searchEnabled && search.length >= 1,
  } as any);
  const searchResults: ExerciseSchema[] =
    (searchData as any)?.pages?.[0]?.items ?? (searchData as any)?.items ?? [];

  const handleSearch = () => {
    if (search.length >= 1) setSearchEnabled(true);
  };

  const exercises = searchEnabled && search.length >= 1 ? searchResults : recent;
  const label = searchEnabled && search.length >= 1 ? "Results" : "Recent";

  return (
    <BottomSheet onDismiss={onClose}>
      <Text className="text-foreground text-lg font-bold mb-3">Add Exercise</Text>

      <View className="flex-row items-center gap-2 mb-4">
        <View className="flex-1 flex-row items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5">
          <Search size={16} color="#71717a" />
          <TextInput
            placeholder="Search exercises..."
            placeholderTextColor="#71717a"
            value={search}
            onChangeText={(t) => { setSearch(t); setSearchEnabled(false); }}
            onSubmitEditing={handleSearch}
            autoFocus
            style={{ flex: 1, color: "#fafafa", fontSize: 14, paddingVertical: 0 }}
            returnKeyType="search"
          />
        </View>
        <Pressable
          onPress={handleSearch}
          className={`w-11 h-11 rounded-xl items-center justify-center ${
            search.length >= 1 ? "bg-foreground" : "bg-zinc-800"
          }`}
        >
          <Search size={18} color={search.length >= 1 ? "#09090b" : "#71717a"} />
        </Pressable>
      </View>

      <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">{label}</Text>

      {isSearching ? (
        <ActivityIndicator color="#a1a1aa" className="py-8" />
      ) : exercises.length === 0 ? (
        <Text className="text-muted-foreground text-sm text-center py-8">
          {searchEnabled ? "No exercises found" : "No recent exercises"}
        </Text>
      ) : (
        exercises.map((ex) => (
          <Pressable
            key={ex.id}
            onPress={() => { onSelect(ex); onClose(); }}
            className="flex-row items-center gap-3 py-3 active:bg-zinc-800/60 rounded-xl"
          >
            <View className="h-10 w-10 rounded-xl bg-zinc-800 items-center justify-center">
              <Dumbbell size={16} color="#71717a" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
                {ex.name}
              </Text>
              <Text className="text-muted-foreground text-xs capitalize mt-0.5">
                {ex.category?.replace(/_/g, " ")}
                {ex.equipment ? ` · ${ex.equipment}` : ""}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Exercise Group (sets for one exercise in active workout)
// ---------------------------------------------------------------------------

function ExerciseGroup({
  exerciseName,
  sets,
  workoutId,
  exerciseId,
}: {
  exerciseName: string;
  sets: WorkoutSetSchema[];
  workoutId: string;
  exerciseId: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const queryClient = useQueryClient();
  const workoutQueryKey = getWorkoutV1WorkoutsWorkoutIdGetQueryKey({
    client,
    path: { workout_id: workoutId },
  });

  const addSetMutation = useMutation({
    ...createWorkoutSetV1WorkoutsWorkoutIdSetsPostMutation({ client }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: workoutQueryKey });
    },
  });

  const deleteSetMutation = useMutation({
    ...deleteWorkoutSetV1WorkoutsWorkoutIdSetsSetIdDeleteMutation({ client }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: workoutQueryKey });
    },
  });

  const handleAddSet = () => {
    const last = sets[sets.length - 1];
    addSetMutation.mutate({
      client,
      path: { workout_id: workoutId },
      body: {
        exercise_id: exerciseId,
        set_number: sets.length + 1,
        reps: last?.reps ?? 10,
        weight: last?.weight ?? 0,
        weight_unit: last?.weight_unit ?? "kg",
      },
    });
  };

  const handleDeleteSet = (setId: string) => {
    deleteSetMutation.mutate({
      client,
      path: { workout_id: workoutId, set_id: setId },
    });
  };

  return (
    <View className="mx-4 mb-3 rounded-xl bg-zinc-800/50 overflow-hidden">
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="flex-row items-center justify-between px-4 py-3"
      >
        <View className="flex-row items-center gap-2 flex-1 min-w-0">
          <Dumbbell size={16} color="#a1a1aa" />
          <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
            {exerciseName}
          </Text>
          <Text className="text-muted-foreground text-xs">{sets.length}s</Text>
        </View>
        {expanded ? (
          <ChevronUp size={16} color="#71717a" />
        ) : (
          <ChevronDown size={16} color="#71717a" />
        )}
      </Pressable>

      {expanded && (
        <View className="px-4 pb-3">
          {/* Header */}
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
              <Text className="text-foreground text-sm font-medium flex-1 text-center">
                {set.reps}
              </Text>
              <View className="w-8 items-end">
                {set.is_pr ? (
                  <Trophy size={14} color="#eab308" />
                ) : (
                  <Pressable onPress={() => handleDeleteSet(set.id)} hitSlop={8}>
                    <X size={14} color="#52525b" />
                  </Pressable>
                )}
              </View>
            </View>
          ))}

          <Pressable
            onPress={handleAddSet}
            disabled={addSetMutation.isPending}
            className="flex-row items-center justify-center gap-1 mt-2 py-2 rounded-lg bg-zinc-700/50"
          >
            <Plus size={14} color="#a1a1aa" />
            <Text className="text-muted-foreground text-xs font-medium">Add Set</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Active Workout Session
// ---------------------------------------------------------------------------

function ActiveSession({
  workout,
  onFinish,
  onCancel,
}: {
  workout: WorkoutLogDetailSchema;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const queryClient = useQueryClient();
  const workoutQueryKey = getWorkoutV1WorkoutsWorkoutIdGetQueryKey({
    client,
    path: { workout_id: workout.id },
  });

  const addSetMutation = useMutation({
    ...createWorkoutSetV1WorkoutsWorkoutIdSetsPostMutation({ client }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: workoutQueryKey });
    },
  });

  const handleSelectExercise = (exercise: ExerciseSchema) => {
    addSetMutation.mutate({
      client,
      path: { workout_id: workout.id },
      body: {
        exercise_id: exercise.id,
        set_number: 1,
        reps: 10,
        weight: 0,
        weight_unit: "kg",
      },
    });
  };

  // Group sets by exercise
  const sets = workout.sets ?? [];
  const exerciseGroups = new Map<string, { name: string; sets: WorkoutSetSchema[] }>();
  for (const set of sets) {
    const exId = set.exercise_id;
    if (!exerciseGroups.has(exId)) {
      const a = set as Record<string, any>;
      exerciseGroups.set(exId, { name: a.exercise?.name ?? "Exercise", sets: [] });
    }
    exerciseGroups.get(exId)!.sets.push(set);
  }

  return (
    <View className="flex-1">
      {/* Session header card */}
      <View className="mx-4 mb-4 rounded-xl bg-zinc-800 p-4">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <Timer size={16} color="#22c55e" />
            <LiveTimer startedAt={workout.started_at} />
          </View>
          <Text className="text-muted-foreground text-xs">
            {formatDate(workout.started_at)}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={onFinish}
            className="flex-1 items-center py-2.5 rounded-xl bg-green-600"
          >
            <Text className="text-white text-sm font-medium">Finish</Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            className="items-center justify-center px-4 py-2.5 rounded-xl bg-zinc-700"
          >
            <Text className="text-muted-foreground text-sm">Cancel</Text>
          </Pressable>
        </View>
      </View>

      {/* Exercise groups */}
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {Array.from(exerciseGroups.entries()).map(([exId, group]) => (
          <ExerciseGroup
            key={exId}
            exerciseName={group.name}
            sets={group.sets}
            workoutId={workout.id}
            exerciseId={exId}
          />
        ))}

        <Pressable
          onPress={() => setShowExercisePicker(true)}
          className="mx-4 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-zinc-800"
        >
          <Plus size={16} color="#fafafa" />
          <Text className="text-foreground text-sm font-medium">Add Exercise</Text>
        </Pressable>
      </ScrollView>

      {showExercisePicker && (
        <ExercisePicker
          onSelect={handleSelectExercise}
          onClose={() => setShowExercisePicker(false)}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Workout History Card
// ---------------------------------------------------------------------------

function WorkoutCard({
  workout,
  onPress,
}: {
  workout: WorkoutLogSchema;
  onPress: () => void;
}) {
  const duration = workout.completed_at
    ? formatDuration(workout.started_at, workout.completed_at)
    : null;

  return (
    <Pressable
      onPress={onPress}
      className="mx-4 mb-2 rounded-xl px-4 py-3.5 active:bg-zinc-800/60"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-foreground text-base font-medium">
          {formatDate(workout.started_at)}
        </Text>
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

// ---------------------------------------------------------------------------
// Workout Detail Sheet
// ---------------------------------------------------------------------------

function WorkoutDetailSheet({
  workoutId,
  onClose,
  onDelete,
}: {
  workoutId: string;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { data: workout, isLoading } = useQuery({
    ...getWorkoutV1WorkoutsWorkoutIdGetOptions({
      client,
      path: { workout_id: workoutId },
    }),
  } as any);

  const w = workout as WorkoutLogDetailSchema | undefined;
  const sets = w?.sets ?? [];

  // Group sets by exercise
  const exerciseGroups = new Map<string, { name: string; sets: WorkoutSetSchema[] }>();
  for (const set of sets) {
    const exId = set.exercise_id;
    if (!exerciseGroups.has(exId)) {
      const a = set as Record<string, any>;
      exerciseGroups.set(exId, { name: a.exercise?.name ?? "Exercise", sets: [] });
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
          <Text className="text-foreground text-xl font-bold">
            {formatDate(w.started_at)}
          </Text>
          <Text className="text-muted-foreground text-sm mt-0.5">
            {formatTime(w.started_at)}
            {duration ? ` · ${duration}` : ""}
          </Text>

          {/* Stats */}
          <View className="flex-row gap-3 mt-4 mb-4">
            <View className="flex-1 rounded-xl bg-zinc-800 p-3 items-center">
              <Text className="text-foreground text-lg font-bold">{sets.length}</Text>
              <Text className="text-muted-foreground text-xs">Sets</Text>
            </View>
            <View className="flex-1 rounded-xl bg-zinc-800 p-3 items-center">
              <Text className="text-foreground text-lg font-bold">
                {totalVolume > 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume}
              </Text>
              <Text className="text-muted-foreground text-xs">Volume (kg)</Text>
            </View>
            <View className="flex-1 rounded-xl bg-zinc-800 p-3 items-center">
              <Text className="text-foreground text-lg font-bold">{exerciseGroups.size}</Text>
              <Text className="text-muted-foreground text-xs">Exercises</Text>
            </View>
          </View>

          {/* Exercise breakdown */}
          {Array.from(exerciseGroups.entries()).map(([exId, group]) => (
            <View key={exId} className="mb-3">
              <Text className="text-foreground text-sm font-medium mb-1">{group.name}</Text>
              {group.sets.map((set) => (
                <View key={set.id} className="flex-row items-center gap-3 py-1 pl-2">
                  <Text className="text-muted-foreground text-xs w-6">#{set.set_number}</Text>
                  <Text className="text-foreground text-sm">
                    {set.weight}{set.weight_unit} × {set.reps}
                  </Text>
                  {set.is_pr && <Trophy size={12} color="#eab308" />}
                </View>
              ))}
            </View>
          ))}

          {/* Notes */}
          {w.notes && (
            <View className="mt-2 pt-3 border-t border-zinc-700">
              <Text className="text-muted-foreground text-sm">{w.notes}</Text>
            </View>
          )}

          {/* Delete */}
          <Pressable
            onPress={() => { onDelete(w.id); onClose(); }}
            className="mt-4 mb-4 items-center py-3 rounded-xl bg-zinc-800"
          >
            <Text className="text-red-500 text-sm font-medium">Delete Workout</Text>
          </Pressable>
        </View>
      )}
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Workout Screen
// ---------------------------------------------------------------------------

export default function WorkoutScreen() {
  const queryClient = useQueryClient();
  const listQueryKey = listWorkoutsV1WorkoutsGetQueryKey({ client });
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 70;

  const [tab, setTab] = useState<Tab>("log");
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [detailWorkoutId, setDetailWorkoutId] = useState<string | null>(null);

  // Active workout detail
  const { data: activeWorkout } = useQuery({
    ...getWorkoutV1WorkoutsWorkoutIdGetOptions({
      client,
      path: { workout_id: activeWorkoutId! },
    }),
    enabled: !!activeWorkoutId,
    refetchInterval: 5000,
  } as any);

  // Workout history
  const {
    data: historyData,
    isLoading: historyLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...listWorkoutsV1WorkoutsGetInfiniteOptions({
      client,
      query: { limit: 20, sorting: ["-started_at" as any] },
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _all, lastParam) => {
      const page = typeof lastParam === "number" ? lastParam : 1;
      return page >= lastPage.pagination.max_page ? undefined : page + 1;
    },
  });

  const createMutation = useMutation({
    ...createWorkoutV1WorkoutsPostMutation({ client }),
    onSuccess: (data) => {
      setActiveWorkoutId(data.id);
      void queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
  });

  const updateMutation = useMutation({
    ...updateWorkoutV1WorkoutsWorkoutIdPatchMutation({ client }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
  });

  const deleteMutation = useMutation({
    ...deleteWorkoutV1WorkoutsWorkoutIdDeleteMutation({ client }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
  });

  const handleStartWorkout = () => {
    createMutation.mutate({
      client,
      body: { started_at: new Date() },
    });
  };

  const handleFinishWorkout = () => {
    if (!activeWorkoutId) return;
    updateMutation.mutate(
      { client, path: { workout_id: activeWorkoutId }, body: { completed_at: new Date() } },
      { onSuccess: () => setActiveWorkoutId(null) }
    );
  };

  const handleCancelWorkout = () => {
    if (!activeWorkoutId) return;
    Alert.alert("Cancel workout?", "This workout will be deleted.", [
      { text: "Keep Going", style: "cancel" },
      {
        text: "Cancel Workout",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate(
            { client, path: { workout_id: activeWorkoutId } },
            { onSuccess: () => setActiveWorkoutId(null) }
          );
        },
      },
    ]);
  };

  const handleDeleteWorkout = (id: string) => {
    Alert.alert("Delete workout?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMutation.mutate({ client, path: { workout_id: id } }),
      },
    ]);
  };

  const workouts = historyData?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View className="flex-1 bg-background">
      {/* Content */}
      {tab === "log" ? (
        activeWorkoutId && activeWorkout ? (
          <View style={{ paddingTop: headerHeight + 8 }} className="flex-1">
            <ActiveSession
              workout={activeWorkout as WorkoutLogDetailSchema}
              onFinish={handleFinishWorkout}
              onCancel={handleCancelWorkout}
            />
          </View>
        ) : (
          <View style={{ paddingTop: headerHeight }} className="flex-1 items-center justify-center px-8">
            <Dumbbell size={48} color="#27272a" />
            <Text className="text-foreground font-semibold text-lg mt-4">Ready to train?</Text>
            <Text className="text-muted-foreground text-sm text-center mt-1 mb-6">
              Start a workout to log your exercises and sets.
            </Text>
            <Pressable
              onPress={handleStartWorkout}
              disabled={createMutation.isPending}
              className="flex-row items-center gap-2 bg-foreground rounded-xl px-6 py-3"
            >
              <Play size={16} color="#09090b" fill="#09090b" />
              <Text className="text-primary-foreground text-sm font-semibold">
                {createMutation.isPending ? "Starting..." : "Start Workout"}
              </Text>
            </Pressable>
          </View>
        )
      ) : (
        historyLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#a1a1aa" />
          </View>
        ) : (
          <FlashList
            data={workouts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <WorkoutCard
                workout={item}
                onPress={() => setDetailWorkoutId(item.id)}
              />
            )}
            contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 100 }}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <View className="items-center justify-center px-8 pt-20">
                <Dumbbell size={40} color="#27272a" />
                <Text className="text-foreground font-semibold text-lg mt-3">No workouts yet</Text>
                <Text className="text-muted-foreground text-sm text-center mt-1">
                  Complete a workout and it will show up here.
                </Text>
              </View>
            }
            ListFooterComponent={
              isFetchingNextPage ? (
                <View className="py-4 items-center">
                  <ActivityIndicator color="#a1a1aa" />
                </View>
              ) : null
            }
          />
        )
      )}

      {/* Top header */}
      <View
        pointerEvents="box-none"
        className="absolute top-0 left-0 right-0"
        style={{ height: headerHeight + 10 }}
      >
        <View pointerEvents="none" className="bg-background" style={{ height: headerHeight }} />
        <LinearGradient
          pointerEvents="none"
          colors={["#09090b", "transparent"]}
          style={{ height: 10 }}
        />
      </View>

      <View
        className="absolute top-0 left-0 right-0 px-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Text className="text-3xl font-bold text-foreground mb-3">Workout</Text>
        <TabBar active={tab} onChange={setTab} />
      </View>

      {/* Workout detail sheet */}
      {detailWorkoutId && (
        <WorkoutDetailSheet
          workoutId={detailWorkoutId}
          onClose={() => setDetailWorkoutId(null)}
          onDelete={handleDeleteWorkout}
        />
      )}
    </View>
  );
}
