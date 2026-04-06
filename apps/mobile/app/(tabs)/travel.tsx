import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable, ActivityIndicator, Alert, Linking, ActionSheetIOS, TextInput } from "react-native";
import { Text } from "@/components/shared/text";
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
import { Button } from "@/components/shared/button";
import { LinearGradient } from "expo-linear-gradient";
import { FlashList } from "@shopify/flash-list";
import * as Location from "expo-location";
import { client } from "@/lib/client";

import { PlaceCard } from "@/components/travel/place-card";
import { PlaceDetailSheet } from "@/components/travel/place-detail-sheet";
import { AddPlaceModal } from "@/components/travel/add-place-modal";
import { EditPlaceModal } from "@/components/travel/edit-place-modal";
import { CountryFilterBar } from "@/components/travel/country-filter";
import { getPlaceFields, getGoogleMapsUrl, PAGE_SIZE } from "@/components/travel/lib";
import { useTheme } from "@/design-system";

function filterPlaces(places: PlaceSchema[], query: string, countries: string[]): PlaceSchema[] {
  let result = places;

  if (countries.length > 0) {
    const set = new Set(countries.map((c) => c.toLowerCase()));
    result = result.filter((p) => {
      const country = getPlaceFields(p).country?.toLowerCase();
      return country && set.has(country);
    });
  }

  const q = query.toLowerCase().trim();
  if (q) {
    result = result.filter((p) => {
      const fields = getPlaceFields(p);
      return (
        p.name.toLowerCase().includes(q) ||
        (fields.country?.toLowerCase().includes(q)) ||
        (p.category?.toLowerCase().includes(q)) ||
        fields.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }

  return result;
}

function useCurrentCountry(): string | null {
  const [country, setCountry] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getLastKnownPositionAsync();
        const pos = loc ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        const [place] = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        if (place?.country) setCountry(place.country);
      } catch {}
    })();
  }, []);
  return country;
}

export default function TravelScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queryKey = listPlacesV1PlacesGetQueryKey({ client });
  const [selectedPlace, setSelectedPlace] = useState<PlaceSchema | null>(null);
  const [editingPlace, setEditingPlace] = useState<PlaceSchema | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[] | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const currentCountry = useCurrentCountry();

  // Default to current country once detected
  useEffect(() => {
    if (currentCountry && selectedCountries === null) {
      setSelectedCountries([currentCountry]);
    }
  }, [currentCountry]);
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 150;

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

  // Extract unique countries sorted by frequency
  const allCountries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of allPlaces) {
      const c = getPlaceFields(p).country;
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [allPlaces]);

  const activeCountries = selectedCountries ?? [];
  const places = useMemo(
    () => filterPlaces(allPlaces, searchQuery, activeCountries),
    [allPlaces, searchQuery, activeCountries]
  );

  const handleToggleCountry = (country: string) => {
    setSelectedCountries((prev) => {
      const list = prev ?? [];
      return list.includes(country) ? list.filter((c) => c !== country) : [...list, country];
    });
  };

  const handleSearchOpen = () => {
    setSearchActive(true);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleSearchClose = () => {
    setSearchActive(false);
    setSearchQuery("");
    searchInputRef.current?.blur();
  };

  const hasActiveFilters = searchQuery || activeCountries.length > 0;
  const emptyMessage = activeCountries.length > 0 && searchQuery
    ? `No places match "${searchQuery}" in ${activeCountries.join(", ")}`
    : activeCountries.length > 0
    ? `No places in ${activeCountries.join(", ")}`
    : `No places match "${searchQuery}"`;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.subtext} />
        </View>
      ) : allPlaces.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <MapPin size={40} color={theme.colors.border} />
          <Text variant="bodyEmphasis" color="text" style={{ marginTop: 12 }}>No places yet</Text>
          <Text variant="label" color="subtext" style={{ textAlign: "center", marginTop: 4 }}>Start building your travel database by adding places.</Text>
          <Button onPress={() => setShowAddSheet(true)}>Add Place</Button>
        </View>
      ) : (
        <FlashList
          data={places}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PlaceCard place={item} onPress={setSelectedPlace} onLongPress={handleLongPress} />}
          contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 100 }}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage && !hasActiveFilters) fetchNextPage(); }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            hasActiveFilters ? (
              <View style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingTop: 80 }}>
                <Text variant="label" color="subtext" style={{ textAlign: "center" }}>{emptyMessage}</Text>
              </View>
            ) : null
          }
          ListFooterComponent={isFetchingNextPage && !hasActiveFilters ? <View style={{ paddingVertical: 16, alignItems: "center" }}><ActivityIndicator color={theme.colors.subtext} /></View> : null}
        />
      )}

      {/* Header fade */}
      <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: headerHeight + 10 }}>
        <View pointerEvents="none" style={{ backgroundColor: theme.colors.background, height: headerHeight }} />
        <LinearGradient pointerEvents="none" colors={[theme.colors.background, "transparent"]} style={{ height: 10 }} />
      </View>

      {/* Header */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + 12 }}>
        {searchActive ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 12, height: 44, marginHorizontal: 16 }}>
            <Search size={16} color={theme.colors.subtext} />
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search places..."
              placeholderTextColor={theme.colors.subtext}
              autoFocus
              returnKeyType="search"
              style={{ flex: 1, color: theme.colors.text, fontSize: 15, paddingVertical: 0 }}
            />
            <Pressable onPress={handleSearchClose} hitSlop={8}>
              <X size={16} color={theme.colors.subtext} />
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 16 }}>
            <View>
              <Text variant="heading" color="text">Travel</Text>
              {totalCount > 0 && <Text variant="bodyLarge" color="subtext" style={{ marginTop: 2 }}>{totalCount} place{totalCount !== 1 ? "s" : ""}</Text>}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
              <Pressable onPress={handleSearchOpen} style={{ alignItems: "center", justifyContent: "center", borderRadius: 9999, width: 36, height: 36, backgroundColor: theme.colors.surfaceRaised }}>
                <Search size={16} color={theme.colors.subtext} />
              </Pressable>
              <Pressable onPress={() => setShowAddSheet(true)} style={{ alignItems: "center", justifyContent: "center", borderRadius: 9999, width: 36, height: 36, backgroundColor: theme.colors.text }}>
                <Plus size={18} color={theme.colors.monochrome} />
              </Pressable>
            </View>
          </View>
        )}
        <View style={{ marginTop: 12 }}>
          <CountryFilterBar
            countries={allCountries}
            selectedCountries={activeCountries}
            onToggle={handleToggleCountry}
            onClear={() => setSelectedCountries([])}
          />
        </View>
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
