import { useState } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { Text } from "@/components/shared/text";
import { useQuery } from "@tanstack/react-query";
import { listExercisesV1WorkoutsExercisesGetInfiniteOptions, listRecentExercisesV1WorkoutsExercisesRecentGetOptions } from "@metron/client";
import type { ExerciseSchema } from "@metron/client";
import { Dumbbell, Search } from "lucide-react-native";
import { BottomSheet } from "@/components/shared/sheet";
import { Input } from "@/components/shared/input";
import { client } from "@/lib/client";
import { useTheme } from "@/design-system";

export function ExercisePicker({ onSelect, onClose }: { onSelect: (exercise: ExerciseSchema) => void; onClose: () => void }) {
  const theme = useTheme();
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
      <Text variant="title" color="text" style={{ marginBottom: 12 }}>Add Exercise</Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Search size={16} color={theme.colors.textFaint} />
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
        <Pressable
          onPress={handleSearch}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: search.length >= 1 ? theme.colors.text : theme.colors.surfaceRaised,
          }}
        >
          <Search size={18} color={search.length >= 1 ? theme.colors.background : theme.colors.textFaint} />
        </Pressable>
      </View>

      <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{label}</Text>

      {isSearching ? (
        <ActivityIndicator color={theme.colors.textMuted} style={{ paddingVertical: 32 }} />
      ) : exercises.length === 0 ? (
        <Text variant="label" color="subtext" style={{ textAlign: "center", paddingVertical: 32 }}>{searchEnabled ? "No exercises found" : "No recent exercises"}</Text>
      ) : (
        exercises.map((ex) => (
          <Pressable key={ex.id} onPress={() => { onSelect(ex); onClose(); }} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderRadius: 12 }}>
            <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
              <Dumbbell size={16} color={theme.colors.textFaint} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="body" color="text" numberOfLines={1}>{ex.name}</Text>
              <Text variant="caption" color="subtext" style={{ textTransform: "capitalize", marginTop: 2 }}>{ex.category?.replace(/_/g, " ")}{ex.equipment ? ` · ${ex.equipment}` : ""}</Text>
            </View>
          </Pressable>
        ))
      )}
    </BottomSheet>
  );
}
