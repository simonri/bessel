// @ts-nocheck — query-core version mismatch between @metron/client and mobile app
import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createPlaceV1PlacesPostMutation,
  listPlacesV1PlacesGetQueryKey,
  searchGooglePlacesV1PlacesSearchGetOptions,
} from "@metron/client";
import type { GooglePlaceSearchResult } from "@metron/client";
import { MapPin, Star, Search, X } from "lucide-react-native";
import { Input } from "@/components/shared/input";
import { client } from "@/lib/client";

export function AddPlaceModal({
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
    if (searchQuery.length >= 2) setSearchEnabled(true);
  };

  const handleSelectResult = (result: GooglePlaceSearchResult) => {
    setSelected(result);
    setStep("form");
  };

  const handleCreate = () => {
    if (!selected) return;
    const parsedTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
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
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-[#171717]">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "height" : undefined} className="flex-1">
          <SafeAreaView className="flex-1 pt-5">
            <View className="flex-row items-center justify-between mb-4 px-5">
              <Pressable onPress={step === "form" ? () => setStep("search") : onClose}>
                <Text className="text-primary text-sm">{step === "form" ? "Back" : "Cancel"}</Text>
              </Pressable>
              <Text className="text-foreground text-lg font-bold">
                {step === "search" ? "Search Place" : "Add Place"}
              </Text>
              {step === "form" ? (
                <Pressable onPress={handleCreate} disabled={createMutation.isPending}>
                  <Text className={`text-sm font-semibold ${createMutation.isPending ? "text-muted-foreground" : "text-primary"}`}>
                    {createMutation.isPending ? "Saving..." : "Save"}
                  </Text>
                </Pressable>
              ) : (
                <View className="w-10" />
              )}
            </View>

            {step === "search" ? (
              <View className="flex-1 px-5">
                <View className="flex-row items-center gap-2 mb-3">
                  <View className="flex-1 flex-row items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5">
                    <Search size={16} color="#71717a" />
                    <Input
                      placeholder="Restaurants, cafes, landmarks..."
                      value={searchQuery}
                      onChangeText={(t) => { setSearchQuery(t); setSearchEnabled(false); }}
                      onSubmitEditing={handleSearch}
                      autoFocus
                      className="flex-1"
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

                <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
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
                        <Text className="text-foreground text-sm font-medium" numberOfLines={1}>{result.name}</Text>
                        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{result.address}</Text>
                      </View>
                      {result.category && (
                        <View className="rounded-full bg-zinc-800 px-2 py-0.5">
                          <Text className="text-[10px] text-zinc-400 capitalize">{result.category.replace(/_/g, " ")}</Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                  {searchEnabled && !isSearching && results.length === 0 && (
                    <Text className="text-muted-foreground text-sm text-center py-6">No results found</Text>
                  )}
                </ScrollView>
              </View>
            ) : selected ? (
              <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
                <View className="bg-zinc-800 rounded-xl p-4 mb-5">
                  <Text className="text-foreground text-lg font-semibold">{selected.name}</Text>
                  <Text className="text-muted-foreground text-xs mt-1" numberOfLines={2}>{selected.address}</Text>
                  {selected.category && (
                    <View className="flex-row mt-2">
                      <View className="rounded-full bg-zinc-700 px-2 py-0.5">
                        <Text className="text-[11px] text-zinc-400 capitalize">{selected.category.replace(/_/g, " ")}</Text>
                      </View>
                    </View>
                  )}
                </View>

                <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Status</Text>
                <View className="flex-row gap-2 mb-5">
                  <Pressable
                    onPress={() => setStatus("want_to_go")}
                    className={`flex-1 items-center py-2.5 rounded-xl ${status === "want_to_go" ? "bg-amber-500/15" : "bg-zinc-800"}`}
                  >
                    <Text className={`text-sm font-medium ${status === "want_to_go" ? "text-amber-500" : "text-muted-foreground"}`}>Want to go</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setStatus("visited")}
                    className={`flex-1 items-center py-2.5 rounded-xl ${status === "visited" ? "bg-green-500/15" : "bg-zinc-800"}`}
                  >
                    <Text className={`text-sm font-medium ${status === "visited" ? "text-green-500" : "text-muted-foreground"}`}>Visited</Text>
                  </Pressable>
                </View>

                {status === "visited" && (
                  <>
                    <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Rating</Text>
                    <View className="flex-row gap-2 mb-5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Pressable key={star} onPress={() => setRating(rating === star ? null : star)} className="p-1">
                          <Star size={28} color={rating && star <= rating ? "#eab308" : "#3f3f46"} fill={rating && star <= rating ? "#eab308" : "transparent"} />
                        </Pressable>
                      ))}
                    </View>

                    <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Review</Text>
                    <Input
                      placeholder="Your thoughts, tips..."
                      value={review}
                      onChangeText={setReview}
                      multiline
                      className="bg-zinc-800 rounded-xl px-4 py-3 mb-5"
                      style={{ minHeight: 80, textAlignVertical: "top", paddingTop: 12 }}
                    />
                  </>
                )}

                <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Tags</Text>
                <Input
                  placeholder="Comma separated, e.g. sushi, date night"
                  value={tags}
                  onChangeText={setTags}
                  className="bg-zinc-800 rounded-xl px-4 py-3 mb-8"
                />
              </ScrollView>
            ) : null}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
