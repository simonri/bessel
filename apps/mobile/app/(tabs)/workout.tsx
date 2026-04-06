import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listWorkoutsV1WorkoutsGetInfiniteOptions,
  listWorkoutsV1WorkoutsGetQueryKey,
  getWorkoutV1WorkoutsWorkoutIdGetOptions,
  createWorkoutV1WorkoutsPostMutation,
  updateWorkoutV1WorkoutsWorkoutIdPatchMutation,
  deleteWorkoutV1WorkoutsWorkoutIdDeleteMutation,
} from "@metron/client";
import type { WorkoutLogDetailSchema } from "@metron/client";
import { Dumbbell, Play } from "lucide-react-native";
import { Button } from "@/components/shared/button";
import { LinearGradient } from "expo-linear-gradient";
import { client } from "@/lib/client";
import { useTheme } from "@/design-system";

import { ActiveSession } from "@/components/workout/active-session";
import { WorkoutCard } from "@/components/workout/workout-card";
import { WorkoutDetailSheet } from "@/components/workout/workout-detail-sheet";

type Tab = "log" | "history";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <View className="flex-row mx-4 mb-3 gap-2">
      {(["log", "history"] as const).map((tab) => (
        <Pressable key={tab} onPress={() => onChange(tab)} className={`rounded-full px-4 py-1.5 ${active === tab ? "bg-foreground" : "bg-zinc-800"}`}>
          <Text className={`text-sm font-medium capitalize ${active === tab ? "text-primary-foreground" : "text-muted-foreground"}`}>{tab === "log" ? "Workout" : "History"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function WorkoutScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const listQueryKey = listWorkoutsV1WorkoutsGetQueryKey({ client });
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 70;
  const [tab, setTab] = useState<Tab>("log");
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [detailWorkoutId, setDetailWorkoutId] = useState<string | null>(null);

  const { data: activeWorkout } = useQuery({
    ...getWorkoutV1WorkoutsWorkoutIdGetOptions({ client, path: { workout_id: activeWorkoutId! } }),
    enabled: !!activeWorkoutId,
    refetchInterval: 5000,
  });

  const { data: historyData, isLoading: historyLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...listWorkoutsV1WorkoutsGetInfiniteOptions({ client, query: { limit: 20, sorting: ["-started_at" as any] } }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _all, lastParam) => {
      const page = typeof lastParam === "number" ? lastParam : 1;
      return page >= lastPage.pagination.max_page ? undefined : page + 1;
    },
  });

  const createMutation = useMutation({ ...createWorkoutV1WorkoutsPostMutation({ client }), onSuccess: (data) => { setActiveWorkoutId(data.id); void queryClient.invalidateQueries({ queryKey: listQueryKey }); } });
  const updateMutation = useMutation({ ...updateWorkoutV1WorkoutsWorkoutIdPatchMutation({ client }), onSettled: () => { void queryClient.invalidateQueries({ queryKey: listQueryKey }); } });
  const deleteMutation = useMutation({ ...deleteWorkoutV1WorkoutsWorkoutIdDeleteMutation({ client }), onSettled: () => { void queryClient.invalidateQueries({ queryKey: listQueryKey }); } });

  const handleStartWorkout = () => createMutation.mutate({ client, body: { started_at: new Date() } });
  const handleFinishWorkout = () => { if (!activeWorkoutId) return; updateMutation.mutate({ client, path: { workout_id: activeWorkoutId }, body: { completed_at: new Date() } }, { onSuccess: () => setActiveWorkoutId(null) }); };
  const handleCancelWorkout = () => {
    if (!activeWorkoutId) return;
    Alert.alert("Cancel workout?", "This workout will be deleted.", [
      { text: "Keep Going", style: "cancel" },
      { text: "Cancel Workout", style: "destructive", onPress: () => deleteMutation.mutate({ client, path: { workout_id: activeWorkoutId } }, { onSuccess: () => setActiveWorkoutId(null) }) },
    ]);
  };
  const handleDeleteWorkout = (id: string) => {
    Alert.alert("Delete workout?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate({ client, path: { workout_id: id } }) },
    ]);
  };

  const workouts = historyData?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View className="flex-1 bg-background">
      {tab === "log" ? (
        activeWorkoutId && activeWorkout ? (
          <View style={{ paddingTop: headerHeight + 8 }} className="flex-1">
            <ActiveSession workout={activeWorkout as WorkoutLogDetailSchema} onFinish={handleFinishWorkout} onCancel={handleCancelWorkout} />
          </View>
        ) : (
          <View style={{ paddingTop: headerHeight }} className="flex-1 items-center justify-center px-8">
            <Dumbbell size={48} color={theme.colors.border} />
            <Text className="text-foreground font-semibold text-lg mt-4">Ready to train?</Text>
            <Text className="text-muted-foreground text-sm text-center mt-1 mb-6">Start a workout to log your exercises and sets.</Text>
            <Button onPress={handleStartWorkout} loading={createMutation.isPending} icon={<Play size={16} color={theme.colors.monochrome} fill={theme.colors.monochrome} />}>Start Workout</Button>
          </View>
        )
      ) : historyLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={theme.colors.subtext} /></View>
      ) : (
        <FlashList
          data={workouts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <WorkoutCard workout={item} onPress={() => setDetailWorkoutId(item.id)} />}
          contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 100 }}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View className="items-center justify-center px-8 pt-20">
              <Dumbbell size={40} color={theme.colors.border} />
              <Text className="text-foreground font-semibold text-lg mt-3">No workouts yet</Text>
              <Text className="text-muted-foreground text-sm text-center mt-1">Complete a workout and it will show up here.</Text>
            </View>
          }
          ListFooterComponent={isFetchingNextPage ? <View className="py-4 items-center"><ActivityIndicator color={theme.colors.subtext} /></View> : null}
        />
      )}

      <View pointerEvents="box-none" className="absolute top-0 left-0 right-0" style={{ height: headerHeight + 10 }}>
        <View pointerEvents="none" className="bg-background" style={{ height: headerHeight }} />
        <LinearGradient pointerEvents="none" colors={[theme.colors.monochrome, "transparent"]} style={{ height: 10 }} />
      </View>

      <View className="absolute top-0 left-0 right-0 px-4" style={{ paddingTop: insets.top + 12 }}>
        <Text className="text-3xl font-bold text-foreground mb-3">Workout</Text>
        <TabBar active={tab} onChange={setTab} />
      </View>

      {detailWorkoutId && <WorkoutDetailSheet workoutId={detailWorkoutId} onClose={() => setDetailWorkoutId(null)} onDelete={handleDeleteWorkout} />}
    </View>
  );
}
