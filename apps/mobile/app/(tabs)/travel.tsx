import { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
  ActionSheetIOS,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  listPlacesV1PlacesGetInfiniteOptions,
  listPlacesV1PlacesGetQueryKey,
  deletePlaceV1PlacesPlaceIdDeleteMutation,
  updatePlaceV1PlacesPlaceIdPatchMutation,
  createPlaceV1PlacesPostMutation,
  searchGooglePlacesV1PlacesSearchGetOptions,
} from "@metron/client";
import type { PlaceSchema, GooglePlaceSearchResult } from "@metron/client";
import {
  MapPin,
  Star,
  Navigation,
  Check,
  Trash2,
  X,
  Plus,
  Search,
  UtensilsCrossed,
  Coffee,
  Beer,
  Hotel,
  ShoppingBag,
  Landmark,
  TreePine,
  Plane,
  Church,
  Dumbbell,
  GraduationCap,
  Stethoscope,
  Building2,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { BottomSheet } from "@/components/sheet";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
import { client } from "@/lib/client";

const PAGE_SIZE = 30;

function formatDate(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value as string);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getPlaceFields(place: PlaceSchema) {
  const a = place as Record<string, unknown>;
  return {
    country: a.country as string | undefined,
    status: a.status as string,
    visitedAt: a.visited_at,
    tags: Array.isArray(a.tags) ? (a.tags as string[]) : [],
    googlePlaceId: a.google_place_id as string | undefined,
  };
}

function getGoogleMapsUrl(place: PlaceSchema): string {
  const a = place as Record<string, unknown>;
  if (typeof a.google_place_id === "string") {
    return `https://www.google.com/maps/place/?q=place_id:${a.google_place_id}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
}

function RatingStars({
  rating,
  size = 10,
}: {
  rating: number;
  size?: number;
}) {
  return (
    <View className="flex-row items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          color={i < rating ? "#eab308" : "#27272a"}
          fill={i < rating ? "#eab308" : "transparent"}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Place Icon
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<string, typeof MapPin> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  bar: Beer,
  nightclub: Beer,
  hotel: Hotel,
  shopping: ShoppingBag,
  market: ShoppingBag,
  park: TreePine,
  museum: Landmark,
  landmark: Landmark,
  temple: Church,
  church: Church,
  mosque: Church,
  gym: Dumbbell,
  hospital: Stethoscope,
  university: GraduationCap,
  airport: Plane,
  theater: Building2,
  gallery: Building2,
};

const CATEGORY_COLORS: Record<string, string> = {
  restaurant: "#f97316",
  cafe: "#a16207",
  bar: "#a855f7",
  nightclub: "#a855f7",
  hotel: "#3b82f6",
  shopping: "#ec4899",
  market: "#ec4899",
  park: "#22c55e",
  museum: "#eab308",
  landmark: "#eab308",
  temple: "#ef4444",
  church: "#ef4444",
  mosque: "#ef4444",
  gym: "#06b6d4",
  hospital: "#ef4444",
  airport: "#6366f1",
};

function PlaceIcon({ place }: { place: PlaceSchema }) {
  const [imgError, setImgError] = useState(false);
  const category = place.category ?? "";
  const Icon = CATEGORY_ICONS[category] || MapPin;
  const color = CATEGORY_COLORS[category] || "#71717a";

  if (place.photo_url && !imgError) {
    return (
      <Image
        source={{ uri: place.photo_url }}
        className="h-11 w-11 rounded-xl"
        resizeMode="cover"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <View
      className="h-11 w-11 rounded-xl items-center justify-center"
      style={{ backgroundColor: `${color}15` }}
    >
      <Icon size={20} color={color} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Place Card
// ---------------------------------------------------------------------------

function PlaceCard({
  place,
  onPress,
  onLongPress,
}: {
  place: PlaceSchema;
  onPress: (place: PlaceSchema) => void;
  onLongPress: (place: PlaceSchema) => void;
}) {
  const { country } = getPlaceFields(place);

  return (
    <Pressable
      onPress={() => onPress(place)}
      onLongPress={() => onLongPress(place)}
      delayLongPress={300}
      className="mx-4 mb-0.5 flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-zinc-800/60"
    >
      <PlaceIcon place={place} />

      <View className="flex-1 min-w-0">
        <Text
          className="text-foreground font-medium text-base"
          numberOfLines={1}
        >
          {place.name}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-0.5">
          {country && (
            <Text className="text-muted-foreground text-sm">{country}</Text>
          )}
          {country && place.category && (
            <Text className="text-muted-foreground text-sm">·</Text>
          )}
          {place.category && (
            <Text className="text-muted-foreground text-sm capitalize">
              {place.category.replace(/_/g, " ")}
            </Text>
          )}
        </View>
      </View>

      {place.rating ? <RatingStars rating={place.rating} /> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Place Detail Sheet
// ---------------------------------------------------------------------------

function PlaceDetailSheet({
  place,
  onClose,
  onOpenMaps,
  onMarkVisited,
  onDelete,
}: {
  place: PlaceSchema;
  onClose: () => void;
  onOpenMaps: (place: PlaceSchema) => void;
  onMarkVisited: (place: PlaceSchema) => void;
  onDelete: (place: PlaceSchema) => void;
}) {
  const { country, status, visitedAt, tags } = getPlaceFields(place);
  const isVisited = status === "visited";

  return (
    <BottomSheet onDismiss={onClose}>
      <View>
        {place.photo_url && (
          <Image
            source={{ uri: place.photo_url }}
            className="w-full h-44 rounded-xl mb-4"
            resizeMode="cover"
          />
        )}

        <View className="mb-1">
          <Text className="text-foreground text-xl font-bold">
            {place.name}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-1">
            {country && (
              <Text className="text-muted-foreground text-sm">{country}</Text>
            )}
            {country && place.category && (
              <Text className="text-muted-foreground text-sm">·</Text>
            )}
            {place.category && (
              <Text className="text-muted-foreground text-sm capitalize">
                {place.category.replace(/_/g, " ")}
              </Text>
            )}
          </View>
        </View>

        <View className="flex-row items-center gap-2 flex-wrap mt-3">
          <View
            className={`rounded-full px-2.5 py-1 ${
              isVisited ? "bg-green-500/15" : "bg-amber-500/15"
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                isVisited ? "text-green-500" : "text-amber-500"
              }`}
            >
              {isVisited ? "Visited" : "Want to go"}
            </Text>
          </View>
          {visitedAt && (
            <Text className="text-muted-foreground text-xs">
              {formatDate(visitedAt)}
            </Text>
          )}
          {place.rating && (
            <View className="ml-auto">
              <RatingStars rating={place.rating} size={14} />
            </View>
          )}
        </View>

        {tags.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mt-3">
            {tags.map((tag) => (
              <View key={tag} className="rounded-full bg-zinc-700 px-2.5 py-1">
                <Text className="text-xs text-zinc-300">{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {place.address && (
          <View className="flex-row items-start gap-2 mt-4">
            <MapPin size={14} color="#71717a" />
            <Text className="text-foreground text-sm flex-1">
              {place.address}
            </Text>
          </View>
        )}

        {place.review && (
          <View className="mt-4 pt-4 border-t border-zinc-700">
            <Text className="text-muted-foreground text-sm leading-relaxed">
              {place.review}
            </Text>
          </View>
        )}

        <View className="flex-row items-center gap-2 mt-5 mb-8">
          <Pressable
            onPress={() => { onOpenMaps(place); onClose(); }}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-700 py-3"
          >
            <Navigation size={16} color="#fafafa" />
            <Text className="text-sm font-medium text-foreground">Maps</Text>
          </Pressable>

          {!isVisited && (
            <Pressable
              onPress={() => { onMarkVisited(place); onClose(); }}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-700 py-3"
            >
              <Check size={16} color="#22c55e" />
              <Text className="text-sm font-medium text-foreground">Visited</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => { onDelete(place); onClose(); }}
            className="items-center justify-center rounded-xl bg-zinc-700 w-12 h-12"
          >
            <Trash2 size={16} color="#ef4444" />
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Add Place Sheet
// ---------------------------------------------------------------------------

function AddPlaceSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<"search" | "form">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [selected, setSelected] = useState<GooglePlaceSearchResult | null>(null);
  const [status, setStatus] = useState<"want_to_go" | "visited">("want_to_go");
  const [rating, setRating] = useState<number | null>(null);
  const [review, setReview] = useState("");
  const [tags, setTags] = useState("");
  const queryClient = useQueryClient();

  const { data: searchResults, isLoading: isSearching } = useQuery({
    ...searchGooglePlacesV1PlacesSearchGetOptions({
      client,
      query: { query: searchQuery },
    }),
    enabled: searchEnabled && searchQuery.length >= 2,
  });

  const createMutation = useMutation({
    ...createPlaceV1PlacesPostMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: listPlacesV1PlacesGetQueryKey({ client }),
      });
      onCreated();
      onClose();
    },
  });

  const handleSearch = () => {
    if (searchQuery.length >= 2) {
      setSearchEnabled(true);
    }
  };

  const handleSelectResult = (result: GooglePlaceSearchResult) => {
    setSelected(result);
    setStep("form");
  };

  const handleCreate = () => {
    if (!selected) return;
    const parsedTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    createMutation.mutate({
      client,
      body: {
        name: selected.name,
        address: selected.address,
        country: selected.country ?? undefined,
        latitude: selected.latitude,
        longitude: selected.longitude,
        google_place_id: selected.place_id,
        plus_code: selected.plus_code ?? undefined,
        category: selected.category ?? undefined,
        photo_url: selected.photo_url ?? undefined,
        website: selected.website ?? undefined,
        phone: selected.phone ?? undefined,
        status,
        rating: status === "visited" ? rating ?? undefined : undefined,
        visited_at: status === "visited" ? new Date() : undefined,
        review: status === "visited" && review.trim() ? review.trim() : undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
      },
    });
  };

  const results = searchResults?.results ?? [];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-[#171717]">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <SafeAreaView className="flex-1 pt-2">
            {/* Header */}
            <View className="flex-row items-center justify-between mb-4 px-5">
              {step === "form" ? (
                <Pressable onPress={() => setStep("search")}>
                  <Text className="text-primary text-sm">Back</Text>
                </Pressable>
              ) : (
                <View className="w-9" />
              )}
              <Text className="text-foreground text-lg font-bold">
                {step === "search" ? "Search Place" : "Add Place"}
              </Text>
              <Pressable onPress={onClose} className="w-9 h-9 items-center justify-center rounded-full bg-zinc-700">
                <X size={16} color="#a1a1aa" />
              </Pressable>
            </View>

            {step === "search" ? (
              <View className="flex-1 px-5">
                {/* Search input + button */}
                <View className="flex-row items-center gap-2 mb-3">
                  <View className="flex-1 flex-row items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5">
                    <Search size={16} color="#71717a" />
                    <TextInput
                      placeholder="Restaurants, cafes, landmarks..."
                      placeholderTextColor="#71717a"
                      value={searchQuery}
                      onChangeText={(t) => {
                        setSearchQuery(t);
                        setSearchEnabled(false);
                      }}
                      onSubmitEditing={handleSearch}
                      autoFocus
                      className="flex-1"
                      style={{ color: "#fafafa", fontSize: 14, paddingVertical: 0 }}
                      returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                      <Pressable onPress={() => { setSearchQuery(""); setSearchEnabled(false); }}>
                        <X size={16} color="#71717a" />
                      </Pressable>
                    )}
                  </View>
                  <Pressable
                    onPress={handleSearch}
                    disabled={searchQuery.length < 2}
                    className={`w-11 h-11 rounded-xl items-center justify-center ${
                      searchQuery.length >= 2 ? "bg-foreground" : "bg-zinc-800"
                    }`}
                  >
                    {isSearching ? (
                      <ActivityIndicator color="#09090b" size="small" />
                    ) : (
                      <Search size={18} color={searchQuery.length >= 2 ? "#09090b" : "#71717a"} />
                    )}
                  </Pressable>
                </View>

                {/* Results */}
                <ScrollView
                  className="flex-1"
                  keyboardShouldPersistTaps="handled"
                >
                  {results.map((result) => (
                    <Pressable
                      key={result.place_id}
                      onPress={() => handleSelectResult(result)}
                      className="flex-row items-center gap-3 py-3 active:bg-zinc-800/60 rounded-xl px-1"
                    >
                      <View className="h-10 w-10 rounded-xl bg-zinc-800 items-center justify-center">
                        <MapPin size={16} color="#71717a" />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
                          {result.name}
                        </Text>
                        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                          {result.address}
                        </Text>
                      </View>
                      {result.category && (
                        <View className="rounded-full bg-zinc-800 px-2 py-0.5">
                          <Text className="text-[10px] text-zinc-400 capitalize">
                            {result.category.replace(/_/g, " ")}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                  {searchEnabled && !isSearching && results.length === 0 && (
                    <Text className="text-muted-foreground text-sm text-center py-6">
                      No results found
                    </Text>
                  )}
                </ScrollView>
              </View>
            ) : selected ? (
              <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
                {/* Selected place card */}
                <View className="bg-zinc-800 rounded-xl p-4 mb-5">
                  <Text className="text-foreground text-lg font-semibold">
                    {selected.name}
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-1" numberOfLines={2}>
                    {selected.address}
                  </Text>
                  {selected.category && (
                    <View className="flex-row mt-2">
                      <View className="rounded-full bg-zinc-700 px-2 py-0.5">
                        <Text className="text-[11px] text-zinc-400 capitalize">
                          {selected.category.replace(/_/g, " ")}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Status toggle */}
                <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Status</Text>
                <View className="flex-row gap-2 mb-5">
                  <Pressable
                    onPress={() => setStatus("want_to_go")}
                    className={`flex-1 items-center py-2.5 rounded-xl ${
                      status === "want_to_go"
                        ? "bg-amber-500/15"
                        : "bg-zinc-800"
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        status === "want_to_go" ? "text-amber-500" : "text-muted-foreground"
                      }`}
                    >
                      Want to go
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setStatus("visited")}
                    className={`flex-1 items-center py-2.5 rounded-xl ${
                      status === "visited"
                        ? "bg-green-500/15"
                        : "bg-zinc-800"
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        status === "visited" ? "text-green-500" : "text-muted-foreground"
                      }`}
                    >
                      Visited
                    </Text>
                  </Pressable>
                </View>

                {/* Rating (shown when visited) */}
                {status === "visited" && (
                  <>
                    <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Rating</Text>
                    <View className="flex-row gap-2 mb-5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Pressable
                          key={star}
                          onPress={() => setRating(rating === star ? null : star)}
                          className="p-1"
                        >
                          <Star
                            size={28}
                            color={rating && star <= rating ? "#eab308" : "#3f3f46"}
                            fill={rating && star <= rating ? "#eab308" : "transparent"}
                          />
                        </Pressable>
                      ))}
                    </View>

                    <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Review</Text>
                    <TextInput
                      placeholder="Your thoughts, tips..."
                      placeholderTextColor="#71717a"
                      value={review}
                      onChangeText={setReview}
                      multiline
                      className="bg-zinc-800 rounded-xl px-4 py-3 mb-5"
                      style={{ color: "#fafafa", fontSize: 14, minHeight: 80, textAlignVertical: "top", paddingTop: 12 }}
                    />
                  </>
                )}

                {/* Tags */}
                <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Tags</Text>
                <TextInput
                  placeholder="Comma separated, e.g. sushi, date night"
                  placeholderTextColor="#71717a"
                  value={tags}
                  onChangeText={setTags}
                  className="bg-zinc-800 rounded-xl px-4 py-3 mb-8"
                  style={{ color: "#fafafa", fontSize: 14, paddingVertical: 0 }}
                />

                {/* Add button */}
                <Pressable
                  onPress={handleCreate}
                  disabled={createMutation.isPending}
                  className="bg-foreground rounded-xl py-3.5 items-center mb-8"
                >
                  <Text className="text-primary-foreground text-sm font-semibold">
                    {createMutation.isPending ? "Adding..." : "Save Place"}
                  </Text>
                </Pressable>
              </ScrollView>
            ) : null}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Travel Screen
// ---------------------------------------------------------------------------

export default function TravelScreen() {
  const queryClient = useQueryClient();
  const queryKey = listPlacesV1PlacesGetQueryKey({ client });
  const [selectedPlace, setSelectedPlace] = useState<PlaceSchema | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...listPlacesV1PlacesGetInfiniteOptions({
      client,
      query: {
        limit: PAGE_SIZE,
        sorting: ["-created_at" as const],
      },
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const currentPage =
        typeof lastPageParam === "number" ? lastPageParam : 1;
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
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.filter(
              (p: any) => p.id !== path.place_id
            ),
          })),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const markVisitedMutation = useMutation({
    ...updatePlaceV1PlacesPlaceIdPatchMutation({ client }),
    onMutate: async ({ path, body }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((p: any) =>
              p.id === path.place_id ? { ...p, ...body } : p
            ),
          })),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleMarkVisited = (place: PlaceSchema) => {
    markVisitedMutation.mutate({
      client,
      path: { place_id: place.id },
      body: { status: "visited", visited_at: new Date() },
    });
  };

  const handleDelete = (place: PlaceSchema) => {
    Alert.alert(
      "Delete place?",
      `"${place.name}" will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            deleteMutation.mutate({
              client,
              path: { place_id: place.id },
            }),
        },
      ]
    );
  };

  const handleOpenMaps = (place: PlaceSchema) => {
    Linking.openURL(getGoogleMapsUrl(place));
  };

  const handleLongPress = useCallback(
    (place: PlaceSchema) => {
      const { status } = getPlaceFields(place);
      const isVisited = status === "visited";

      const options = [
        "Open in Maps",
        ...(isVisited ? [] : ["Mark as Visited"]),
        "Delete",
        "Cancel",
      ];
      const destructiveIndex = options.indexOf("Delete");
      const cancelIndex = options.length - 1;

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: destructiveIndex,
          cancelButtonIndex: cancelIndex,
          title: place.name,
        },
        (buttonIndex) => {
          const selected = options[buttonIndex];
          if (selected === "Open in Maps") {
            handleOpenMaps(place);
          } else if (selected === "Mark as Visited") {
            handleMarkVisited(place);
          } else if (selected === "Delete") {
            handleDelete(place);
          }
        }
      );
    },
    [deleteMutation, markVisitedMutation]
  );

  const places = data?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = data?.pages[0]?.pagination.total_count ?? 0;

  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 70;

  return (
    <View className="flex-1 bg-background">
      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#a1a1aa" />
        </View>
      ) : places.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MapPin size={40} color="#27272a" />
          <Text className="text-foreground font-semibold text-lg mt-3">
            No places yet
          </Text>
          <Text className="text-muted-foreground text-sm text-center mt-1">
            Start building your travel database by adding places.
          </Text>
          <Pressable
            onPress={() => setShowAddSheet(true)}
            className="mt-4 bg-foreground rounded-xl px-5 py-2.5"
          >
            <Text className="text-primary-foreground text-sm font-semibold">
              Add Place
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={places}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PlaceCard
              place={item}
              onPress={setSelectedPlace}
              onLongPress={handleLongPress}
            />
          )}
          contentContainerStyle={{
            paddingTop: headerHeight + 8,
            paddingBottom: 100,
          }}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-4 items-center">
                <ActivityIndicator color="#a1a1aa" />
              </View>
            ) : null
          }
        />
      )}

      {/* Top header: solid bg + 10px fade at bottom */}
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

      {/* Header text + add button */}
      <View
        className="absolute top-0 left-0 right-0 px-4 flex-row items-start justify-between"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View>
          <Text className="text-3xl font-bold text-foreground">Travel</Text>
          {totalCount > 0 && (
            <Text className="text-muted-foreground text-base mt-0.5">
              {totalCount} place{totalCount !== 1 ? "s" : ""}
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => setShowAddSheet(true)}
          className="items-center justify-center rounded-full w-9 h-9 bg-foreground mt-0.5"
        >
          <Plus size={18} color="#09090b" />
        </Pressable>
      </View>

      {/* Detail bottom sheet */}
      {selectedPlace && (
        <PlaceDetailSheet
          place={selectedPlace}
          onClose={() => setSelectedPlace(null)}
          onOpenMaps={handleOpenMaps}
          onMarkVisited={handleMarkVisited}
          onDelete={handleDelete}
        />
      )}

      {/* Add place sheet */}
      {showAddSheet && (
        <AddPlaceSheet
          onClose={() => setShowAddSheet(false)}
          onCreated={() => {}}
        />
      )}
    </View>
  );
}
