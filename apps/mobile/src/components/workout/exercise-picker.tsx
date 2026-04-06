// @ts-nocheck — query-core version mismatch
import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { listExercisesV1WorkoutsExercisesGetInfiniteOptions, listRecentExercisesV1WorkoutsExercisesRecentGetOptions } from "@metron/client";
import type { ExerciseSchema } from "@metron/client";
import { Dumbbell, Search } from "lucide-react-native";
import { BottomSheet } from "@/components/shared/sheet";
import { Input } from "@/components/shared/input";
import { client } from "@/lib/client";

export function ExercisePicker({ onSelect, onClose }: { onSelect: (exercise: ExerciseSchema) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);

  const { data: recentData } = useQuery({
    ...listRecentExercisesV1WorkoutsExercisesRecentGetOptions({ client, query: { limit: 10 } }),
  });
  const recent = (recentData as ExerciseSchema[]) ?? [];

  const { data: searchData, isLoading: isSearching } = useQuery({
    ...(listExercisesV1WorkoutsExercisesGetInfiniteOptions as any)({ client, query: { q: search, limit: 50 } }),
    enabled: searchEnabled && search.length >= 1,
  });
  const searchResults: ExerciseSchema[] = (searchData as any)?.pages?.[0]?.items ?? (searchData as any)?.items ?? [];

  const handleSearch = () => { if (search.length >= 1) setSearchEnabled(true); };
  const exercises = searchEnabled && search.length >= 1 ? searchResults : recent;
  const label = searchEnabled && search.length >= 1 ? "Results" : "Recent";

  return (
    <BottomSheet onDismiss={onClose}>
      <Text className="text-foreground text-lg font-bold mb-3">Add Exercise</Text>

      <View className="flex-row items-center gap-2 mb-4">
        <View className="flex-1 flex-row items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5">
          <Search size={16} color="#71717a" />
          <Input
            placeholder="Search exercises..."
            value={search}
            onChangeText={(t: string) => { setSearch(t); setSearchEnabled(false); }}
            onSubmitEditing={handleSearch}
            autoFocus
            style={{ flex: 1 }}
            returnKeyType="search"
          />
        </View>
        <Pressable onPress={handleSearch} className={`w-11 h-11 rounded-xl items-center justify-center ${search.length >= 1 ? "bg-foreground" : "bg-zinc-800"}`}>
          <Search size={18} color={search.length >= 1 ? "#09090b" : "#71717a"} />
        </Pressable>
      </View>

      <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">{label}</Text>

      {isSearching ? (
        <ActivityIndicator color="#a1a1aa" className="py-8" />
      ) : exercises.length === 0 ? (
        <Text className="text-muted-foreground text-sm text-center py-8">{searchEnabled ? "No exercises found" : "No recent exercises"}</Text>
      ) : (
        exercises.map((ex) => (
          <Pressable key={ex.id} onPress={() => { onSelect(ex); onClose(); }} className="flex-row items-center gap-3 py-3 active:bg-zinc-800/60 rounded-xl">
            <View className="h-10 w-10 rounded-xl bg-zinc-800 items-center justify-center">
              <Dumbbell size={16} color="#71717a" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-sm font-medium" numberOfLines={1}>{ex.name}</Text>
              <Text className="text-muted-foreground text-xs capitalize mt-0.5">{ex.category?.replace(/_/g, " ")}{ex.equipment ? ` · ${ex.equipment}` : ""}</Text>
            </View>
          </Pressable>
        ))
      )}
    </BottomSheet>
  );
}
