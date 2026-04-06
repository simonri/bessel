import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, Linking, ActionSheetIOS, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPlacesV1PlacesGetInfiniteOptions,
  listPlacesV1PlacesGetQueryKey,
  deletePlaceV1PlacesPlaceIdDeleteMutation,
  updatePlaceV1PlacesPlaceIdPatchMutation,
} from "@metron/client";
import type { PlaceSchema } from "@metron/client";
import { MapPin, Plus, Search, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { FlashList } from "@shopify/flash-list";
import { client } from "@/lib/client";

import { PlaceCard } from "@/components/travel/place-card";
import { PlaceDetailSheet } from "@/components/travel/place-detail-sheet";
import { AddPlaceModal } from "@/components/travel/add-place-modal";
import { EditPlaceModal } from "@/components/travel/edit-place-modal";
import { getPlaceFields, getGoogleMapsUrl, PAGE_SIZE } from "@/components/travel/lib";

function filterPlaces(places: PlaceSchema[], query: string): PlaceSchema[] {
  const q = query.toLowerCase().trim();
  if (!q) return places;
  return places.filter((p) => {
    const fields = getPlaceFields(p);
    return (
      p.name.toLowerCase().includes(q) ||
      (fields.country?.toLowerCase().includes(q)) ||
      (p.category?.toLowerCase().includes(q)) ||
      fields.tags.some((t) => t.toLowerCase().includes(q))
    );
  });
}

export default function TravelScreen() {
  const queryClient = useQueryClient();
  const queryKey = listPlacesV1PlacesGetQueryKey({ client });
  const [selectedPlace, setSelectedPlace] = useState<PlaceSchema | null>(null);
  const [editingPlace, setEditingPlace] = useState<PlaceSchema | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 70;

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...listPlacesV1PlacesGetInfiniteOptions({
      client,
      query: { limit: PAGE_SIZE, sorting: ["-created_at" as const] },
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const currentPage = typeof lastPageParam === "number" ? lastPageParam : 1;
      if (currentPage >= lastPage.pagination.max_page) return undefined;
      return currentPage + 1;
    },
  });

  const deleteMutation = useMutation({
    ...deletePlaceV1PlacesPlaceIdDeleteMutation({ client }),
    onMutate: async ({ path }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.pages) return old;
        return { ...old, pages: old.pages.map((page: any) => ({ ...page, items: page.items.filter((p: any) => p.id !== path.place_id) })) };
      });
      return { previous };
    },
    onError: (_err: any, _vars: any, context: any) => {
      if (context?.previous) for (const [key, data] of context.previous) queryClient.setQueryData(key, data);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey }); },
  });

  const markVisitedMutation = useMutation({
    ...updatePlaceV1PlacesPlaceIdPatchMutation({ client }),
    onMutate: async ({ path, body }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.pages) return old;
        return { ...old, pages: old.pages.map((page: any) => ({ ...page, items: page.items.map((p: any) => p.id === path.place_id ? { ...p, ...body } : p) })) };
      });
      return { previous };
    },
    onError: (_err: any, _vars: any, context: any) => {
      if (context?.previous) for (const [key, data] of context.previous) queryClient.setQueryData(key, data);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey }); },
  });

  const handleMarkVisited = (place: PlaceSchema) => {
    markVisitedMutation.mutate({ client, path: { place_id: place.id }, body: { status: "visited", visited_at: new Date(new Date().toISOString().split("T")[0]) } });
  };

  const handleDelete = (place: PlaceSchema) => {
    Alert.alert("Delete place?", `"${place.name}" will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate({ client, path: { place_id: place.id } }) },
    ]);
  };

  const handleOpenMaps = (place: PlaceSchema) => Linking.openURL(getGoogleMapsUrl(place));

  const handleLongPress = useCallback((place: PlaceSchema) => {
    const { status } = getPlaceFields(place);
    const isVisited = status === "visited";
    const options = ["Edit", "Open in Maps", ...(isVisited ? [] : ["Mark as Visited"]), "Delete", "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, destructiveButtonIndex: options.indexOf("Delete"), cancelButtonIndex: options.length - 1, title: place.name },
      (i) => {
        const s = options[i];
        if (s === "Edit") setEditingPlace(place);
        else if (s === "Open in Maps") handleOpenMaps(place);
        else if (s === "Mark as Visited") handleMarkVisited(place);
        else if (s === "Delete") handleDelete(place);
      }
    );
  }, [deleteMutation, markVisitedMutation]);

  const allPlaces = data?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = data?.pages[0]?.pagination.total_count ?? 0;
  const places = useMemo(() => filterPlaces(allPlaces, searchQuery), [allPlaces, searchQuery]);

  const handleSearchOpen = () => {
    setSearchActive(true);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleSearchClose = () => {
    setSearchActive(false);
    setSearchQuery("");
    searchInputRef.current?.blur();
  };

  return (
    <View className="flex-1 bg-background">
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#a1a1aa" />
        </View>
      ) : allPlaces.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MapPin size={40} color="#27272a" />
          <Text className="text-foreground font-semibold text-lg mt-3">No places yet</Text>
          <Text className="text-muted-foreground text-sm text-center mt-1">Start building your travel database by adding places.</Text>
          <Pressable onPress={() => setShowAddSheet(true)} className="mt-4 bg-foreground rounded-xl px-5 py-2.5">
            <Text className="text-primary-foreground text-sm font-semibold">Add Place</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={places}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PlaceCard place={item} onPress={setSelectedPlace} onLongPress={handleLongPress} />}
          contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 100 }}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage && !searchQuery) fetchNextPage(); }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            searchQuery ? (
              <View className="items-center justify-center px-8 pt-20">
                <Text className="text-muted-foreground text-sm">No places match "{searchQuery}"</Text>
              </View>
            ) : null
          }
          ListFooterComponent={isFetchingNextPage && !searchQuery ? <View className="py-4 items-center"><ActivityIndicator color="#a1a1aa" /></View> : null}
        />
      )}

      {/* Header fade */}
      <View pointerEvents="box-none" className="absolute top-0 left-0 right-0" style={{ height: headerHeight + 10 }}>
        <View pointerEvents="none" className="bg-background" style={{ height: headerHeight }} />
        <LinearGradient pointerEvents="none" colors={["#09090b", "transparent"]} style={{ height: 10 }} />
      </View>

      {/* Header */}
      <View className="absolute top-0 left-0 right-0 px-4" style={{ paddingTop: insets.top + 12 }}>
        {searchActive ? (
          <View className="flex-row items-center gap-2 bg-zinc-800 rounded-xl px-3 h-11">
            <Search size={16} color="#71717a" />
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search places..."
              placeholderTextColor="#71717a"
              autoFocus
              returnKeyType="search"
              style={{ flex: 1, color: "#fafafa", fontSize: 15, paddingVertical: 0 }}
            />
            <Pressable onPress={handleSearchClose} hitSlop={8}>
              <X size={16} color="#71717a" />
            </Pressable>
          </View>
        ) : (
          <View className="flex-row items-start justify-between">
            <View>
              <Text className="text-3xl font-bold text-foreground">Travel</Text>
              {totalCount > 0 && <Text className="text-muted-foreground text-base mt-0.5">{totalCount} place{totalCount !== 1 ? "s" : ""}</Text>}
            </View>
            <View className="flex-row items-center gap-2 mt-0.5">
              <Pressable onPress={handleSearchOpen} className="items-center justify-center rounded-full w-9 h-9 bg-zinc-800">
                <Search size={16} color="#a1a1aa" />
              </Pressable>
              <Pressable onPress={() => setShowAddSheet(true)} className="items-center justify-center rounded-full w-9 h-9 bg-foreground">
                <Plus size={18} color="#09090b" />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {selectedPlace && (
        <PlaceDetailSheet
          place={selectedPlace}
          onClose={() => setSelectedPlace(null)}
          onOpenMaps={handleOpenMaps}
          onMarkVisited={handleMarkVisited}
          onDelete={handleDelete}
          onEdit={(place) => { setSelectedPlace(null); setEditingPlace(place); }}
        />
      )}

      {editingPlace && <EditPlaceModal place={editingPlace} onClose={() => setEditingPlace(null)} />}
      {showAddSheet && <AddPlaceModal onClose={() => setShowAddSheet(false)} onCreated={() => {}} />}
    </View>
  );
}
