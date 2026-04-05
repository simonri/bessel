import { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
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
  Pencil,
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

function PlaceIcon({ place, size = 44, iconSize = 20 }: { place: PlaceSchema; size?: number; iconSize?: number }) {
  const category = place.category ?? "";
  const Icon = CATEGORY_ICONS[category] || MapPin;
  const color = CATEGORY_COLORS[category] || "#71717a";

  return (
    <View
      className="rounded-xl items-center justify-center"
      style={{ width: size, height: size, backgroundColor: `${color}15` }}
    >
      <Icon size={iconSize} color={color} />
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
  onEdit,
}: {
  place: PlaceSchema;
  onClose: () => void;
  onOpenMaps: (place: PlaceSchema) => void;
  onMarkVisited: (place: PlaceSchema) => void;
  onDelete: (place: PlaceSchema) => void;
  onEdit: (place: PlaceSchema) => void;
}) {
  const { country, status, visitedAt, tags } = getPlaceFields(place);
  const isVisited = status === "visited";
  const category = place.category ?? "";
  const color = CATEGORY_COLORS[category] || "#71717a";

  return (
    <BottomSheet onDismiss={onClose}>
      <View>
        {/* Header: icon + name */}
        <View className="flex-row items-center gap-4 mb-4">
          <PlaceIcon place={place} size={56} iconSize={26} />
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-2xl font-bold" numberOfLines={2}>
              {place.name}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              {country && (
                <Text className="text-muted-foreground text-[15px]">{country}</Text>
              )}
              {country && place.category && (
                <Text className="text-muted-foreground text-[15px]">·</Text>
              )}
              {place.category && (
                <Text className="text-[15px] capitalize" style={{ color }}>
                  {place.category.replace(/_/g, " ")}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Rating + visited date row */}
        <View className="flex-row items-center gap-3 mb-4">
          {place.rating ? (
            <RatingStars rating={place.rating} size={16} />
          ) : null}
          {visitedAt && (
            <Text className="text-muted-foreground text-sm">
              {formatDate(visitedAt)}
            </Text>
          )}
        </View>

        {/* Tags */}
        {tags.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mb-4">
            {tags.map((tag) => (
              <View key={tag} className="rounded-full bg-zinc-800 px-3 py-1.5">
                <Text className="text-sm text-zinc-300">{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Address */}
        {place.address && (
          <View className="flex-row items-start gap-2.5 mb-4 bg-zinc-800/60 rounded-xl px-3.5 py-3">
            <MapPin size={16} color="#71717a" className="mt-0.5" />
            <Text className="text-foreground text-[15px] flex-1 leading-snug">
              {place.address}
            </Text>
          </View>
        )}

        {/* Review */}
        {place.review && (
          <View className="mb-4 bg-zinc-800/60 rounded-xl px-3.5 py-3">
            <Text className="text-zinc-300 text-[15px] leading-relaxed">
              {place.review}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View className="flex-row items-center gap-2 mt-1 mb-6">
          <Pressable
            onPress={() => { onEdit(place); onClose(); }}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3.5"
          >
            <Pencil size={16} color="#fafafa" />
            <Text className="text-[15px] font-medium text-foreground">Edit</Text>
          </Pressable>

          <Pressable
            onPress={() => { onOpenMaps(place); onClose(); }}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3.5"
          >
            <Navigation size={16} color="#fafafa" />
            <Text className="text-[15px] font-medium text-foreground">Maps</Text>
          </Pressable>

          {!isVisited && (
            <Pressable
              onPress={() => { onMarkVisited(place); onClose(); }}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3.5"
            >
              <Check size={16} color="#22c55e" />
              <Text className="text-[15px] font-medium text-green-500">Visited</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => { onDelete(place); onClose(); }}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3.5"
          >
            <Trash2 size={16} color="#ef4444" />
            <Text className="text-[15px] font-medium text-red-500">Delete</Text>
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
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-[#171717]">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <SafeAreaView className="flex-1 pt-5">
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
// Edit Place Modal
// ---------------------------------------------------------------------------

const CATEGORIES = [
  "restaurant", "cafe", "bar", "bakery", "hotel", "museum", "park",
  "temple", "shrine", "beach", "shopping", "market", "landmark",
  "nightclub", "spa", "gym", "theater", "gallery", "library",
  "zoo", "aquarium", "airport", "station", "other",
];

function EditPlaceModal({
  place,
  onClose,
}: {
  place: PlaceSchema;
  onClose: () => void;
}) {
  const fields = getPlaceFields(place);
  const [name, setName] = useState(place.name);
  const [address, setAddress] = useState(place.address ?? "");
  const [country, setCountry] = useState(fields.country ?? "");
  const [category, setCategory] = useState(place.category ?? "");
  const [status, setStatus] = useState<"want_to_go" | "visited">(
    fields.status as "want_to_go" | "visited"
  );
  const [rating, setRating] = useState<number | null>(place.rating ?? null);
  const [visitedAt, setVisitedAt] = useState(() => {
    if (!fields.visitedAt) return "";
    const d = fields.visitedAt instanceof Date ? fields.visitedAt : new Date(fields.visitedAt as string);
    return d.toISOString().split("T")[0];
  });
  const [review, setReview] = useState(place.review ?? "");
  const [tags, setTags] = useState(fields.tags.join(", "));
  const queryClient = useQueryClient();
  const queryKey = listPlacesV1PlacesGetQueryKey({ client });

  const updateMutation = useMutation({
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
    onSuccess: () => {
      onClose();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleSave = () => {
    if (!name.trim()) return;
    const parsedTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    updateMutation.mutate({
      client,
      path: { place_id: place.id },
      body: {
        name: name.trim(),
        address: address.trim() || null,
        country: country.trim() || null,
        category: category || null,
        status,
        rating: rating ?? null,
        visited_at: status === "visited" && visitedAt ? new Date(visitedAt) : null,
        review: review.trim() || null,
        tags: parsedTags.length > 0 ? parsedTags : null,
      },
    });
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-[#171717]">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <SafeAreaView className="flex-1 pt-5">
            {/* Header */}
            <View className="flex-row items-center justify-between px-5 mb-4">
              <Pressable onPress={onClose}>
                <Text className="text-primary text-sm">Cancel</Text>
              </Pressable>
              <Text className="text-foreground text-lg font-bold">Edit Place</Text>
              <Pressable onPress={handleSave} disabled={!name.trim() || updateMutation.isPending}>
                <Text className={`text-sm font-semibold ${name.trim() ? "text-primary" : "text-muted-foreground"}`}>
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Text>
              </Pressable>
            </View>

            <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
              {/* Name */}
              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Place name"
                placeholderTextColor="#71717a"
                className="bg-zinc-800 rounded-xl px-4 py-3 mb-5"
                style={{ color: "#fafafa", fontSize: 14, paddingVertical: 0 }}
              />

              {/* Status */}
              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Status</Text>
              <View className="flex-row gap-2 mb-5">
                <Pressable
                  onPress={() => setStatus("want_to_go")}
                  className={`flex-1 items-center py-2.5 rounded-xl ${
                    status === "want_to_go" ? "bg-amber-500/15" : "bg-zinc-800"
                  }`}
                >
                  <Text className={`text-sm font-medium ${status === "want_to_go" ? "text-amber-500" : "text-muted-foreground"}`}>
                    Want to go
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setStatus("visited");
                    if (!visitedAt) setVisitedAt(new Date().toISOString().split("T")[0]);
                  }}
                  className={`flex-1 items-center py-2.5 rounded-xl ${
                    status === "visited" ? "bg-green-500/15" : "bg-zinc-800"
                  }`}
                >
                  <Text className={`text-sm font-medium ${status === "visited" ? "text-green-500" : "text-muted-foreground"}`}>
                    Visited
                  </Text>
                </Pressable>
              </View>

              {/* Rating */}
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

              {/* Visited date (when visited) */}
              {status === "visited" && (
                <>
                  <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Date Visited</Text>
                  <TextInput
                    value={visitedAt}
                    onChangeText={setVisitedAt}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#71717a"
                    className="bg-zinc-800 rounded-xl px-4 py-3 mb-5"
                    style={{ color: "#fafafa", fontSize: 14, paddingVertical: 0 }}
                  />
                </>
              )}

              {/* Review */}
              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Review</Text>
              <TextInput
                value={review}
                onChangeText={setReview}
                placeholder="Your thoughts, tips..."
                placeholderTextColor="#71717a"
                multiline
                className="bg-zinc-800 rounded-xl px-4 py-3 mb-5"
                style={{ color: "#fafafa", fontSize: 14, minHeight: 80, textAlignVertical: "top", paddingTop: 12 }}
              />

              {/* Category */}
              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-5"
                contentContainerStyle={{ gap: 8 }}
              >
                <Pressable
                  onPress={() => setCategory("")}
                  className={`rounded-full px-3 py-1.5 ${!category ? "bg-foreground" : "bg-zinc-800"}`}
                >
                  <Text className={`text-xs font-medium ${!category ? "text-primary-foreground" : "text-muted-foreground"}`}>
                    None
                  </Text>
                </Pressable>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    className={`rounded-full px-3 py-1.5 ${category === cat ? "bg-foreground" : "bg-zinc-800"}`}
                  >
                    <Text className={`text-xs font-medium capitalize ${category === cat ? "text-primary-foreground" : "text-muted-foreground"}`}>
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Tags */}
              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Tags</Text>
              <TextInput
                value={tags}
                onChangeText={setTags}
                placeholder="Comma separated, e.g. sushi, date night"
                placeholderTextColor="#71717a"
                className="bg-zinc-800 rounded-xl px-4 py-3 mb-5"
                style={{ color: "#fafafa", fontSize: 14, paddingVertical: 0 }}
              />

              {/* Address + Country */}
              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Address</Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="Full address"
                placeholderTextColor="#71717a"
                className="bg-zinc-800 rounded-xl px-4 py-3 mb-5"
                style={{ color: "#fafafa", fontSize: 14, paddingVertical: 0 }}
              />

              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Country</Text>
              <TextInput
                value={country}
                onChangeText={setCountry}
                placeholder="e.g. Japan"
                placeholderTextColor="#71717a"
                className="bg-zinc-800 rounded-xl px-4 py-3 mb-8"
                style={{ color: "#fafafa", fontSize: 14, paddingVertical: 0 }}
              />
            </ScrollView>
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
  const [editingPlace, setEditingPlace] = useState<PlaceSchema | null>(null);
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
        "Edit",
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
          if (selected === "Edit") {
            setEditingPlace(place);
          } else if (selected === "Open in Maps") {
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
          onEdit={(place) => {
            setSelectedPlace(null);
            setEditingPlace(place);
          }}
        />
      )}

      {/* Edit place modal */}
      {editingPlace && (
        <EditPlaceModal
          place={editingPlace}
          onClose={() => setEditingPlace(null)}
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
