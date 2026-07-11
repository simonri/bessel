import { useState } from "react";
import {
  View,
  Pressable,
  ActivityIndicator,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Text } from "@/components/shared/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createPlaceV1PlacesPostMutation,
  listPlacesV1PlacesGetQueryKey,
  searchGooglePlacesV1PlacesSearchGetOptions,
} from "@bessel/client";
import type { GooglePlaceSearchResult } from "@bessel/client";
import { MapPin, Star, Search, X, Check, ChevronLeft } from "lucide-react-native";
import { Input } from "@/components/shared/input";
import { client } from "@/lib/client";
import { useTheme } from "@/design-system";

export function AddPlaceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const theme = useTheme();
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
        visited_at: status === "visited" ? new Date(new Date().toISOString().split("T")[0]) : undefined,
        review: status === "visited" && review.trim() ? review.trim() : undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
      },
    });
  };

  const results = searchResults?.results ?? [];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.card }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "height" : undefined} style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, paddingTop: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingHorizontal: 20 }}>
              <Pressable
                onPress={step === "form" ? () => setStep("search") : onClose}
                style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: theme.colors.surfaceHover }}
              >
                {step === "form" ? <ChevronLeft size={18} color={theme.colors.subtext} /> : <X size={18} color={theme.colors.subtext} />}
              </Pressable>
              <Text variant="title" color="text">
                {step === "search" ? "Search Place" : "Add Place"}
              </Text>
              {step === "form" ? (
                <Pressable
                  onPress={handleCreate}
                  disabled={createMutation.isPending}
                  style={{
                    width: 36,
                    height: 36,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 9999,
                    backgroundColor: createMutation.isPending ? theme.colors.surfaceHover : theme.colors.text,
                  }}
                >
                  <Check size={18} color={createMutation.isPending ? theme.colors.subtext : theme.colors.monochrome} />
                </Pressable>
              ) : (
                <View style={{ width: 36 }} />
              )}
            </View>

            {step === "search" ? (
              <View style={{ flex: 1, paddingHorizontal: 20 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Search size={16} color={theme.colors.subtext} />
                    <Input
                      placeholder="Restaurants, cafes, landmarks..."
                      value={searchQuery}
                      onChangeText={(t) => { setSearchQuery(t); setSearchEnabled(false); }}
                      onSubmitEditing={handleSearch}
                      autoFocus
                      style={{ flex: 1 }}
                      returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                      <Pressable onPress={() => { setSearchQuery(""); setSearchEnabled(false); }}>
                        <X size={16} color={theme.colors.subtext} />
                      </Pressable>
                    )}
                  </View>
                  <Pressable
                    onPress={handleSearch}
                    disabled={searchQuery.length < 2}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: searchQuery.length >= 2 ? theme.colors.text : theme.colors.surfaceRaised,
                    }}
                  >
                    {isSearching ? (
                      <ActivityIndicator color={theme.colors.monochrome} size="small" />
                    ) : (
                      <Search size={18} color={searchQuery.length >= 2 ? theme.colors.monochrome : theme.colors.subtext} />
                    )}
                  </Pressable>
                </View>

                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                  {results.map((result) => (
                    <Pressable
                      key={result.place_id}
                      onPress={() => handleSelectResult(result)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderRadius: 12, paddingHorizontal: 4 }}
                    >
                      <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
                        <MapPin size={16} color={theme.colors.subtext} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="body" color="text" numberOfLines={1}>{result.name}</Text>
                        <Text variant="caption" color="subtext" style={{ marginTop: 2 }} numberOfLines={1}>{result.address}</Text>
                      </View>
                      {result.category && (
                        <View style={{ borderRadius: 9999, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text variant="micro" color="subtext" style={{ textTransform: "capitalize" }}>{result.category.replace(/_/g, " ")}</Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                  {searchEnabled && !isSearching && results.length === 0 && (
                    <Text variant="label" color="subtext" style={{ textAlign: "center", paddingVertical: 24 }}>No results found</Text>
                  )}
                </ScrollView>
              </View>
            ) : selected ? (
              <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
                <View style={{ backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, padding: 16, marginBottom: 20 }}>
                  <Text variant="bodyEmphasis" color="text">{selected.name}</Text>
                  <Text variant="caption" color="subtext" style={{ marginTop: 4 }} numberOfLines={2}>{selected.address}</Text>
                  {selected.category && (
                    <View style={{ flexDirection: "row", marginTop: 8 }}>
                      <View style={{ borderRadius: 9999, backgroundColor: theme.colors.surfaceHover, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text variant="micro" color="subtext" style={{ textTransform: "capitalize" }}>{selected.category.replace(/_/g, " ")}</Text>
                      </View>
                    </View>
                  )}
                </View>

                <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Status</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
                  <Pressable
                    onPress={() => setStatus("want_to_go")}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: status === "want_to_go" ? "rgba(245,158,11,0.15)" : theme.colors.surfaceRaised,
                    }}
                  >
                    <Text variant="body" color={status === "want_to_go" ? "statusYellow" : "subtext"}>Want to go</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setStatus("visited")}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: status === "visited" ? theme.colors.successSubtle : theme.colors.surfaceRaised,
                    }}
                  >
                    <Text variant="body" color={status === "visited" ? "statusGreen" : "subtext"}>Visited</Text>
                  </Pressable>
                </View>

                {status === "visited" && (
                  <>
                    <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Rating</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Pressable key={star} onPress={() => setRating(rating === star ? null : star)} style={{ padding: 4 }}>
                          <Star size={28} color={rating && star <= rating ? theme.colors.statusYellow : theme.colors.secondary} fill={rating && star <= rating ? theme.colors.statusYellow : "transparent"} />
                        </Pressable>
                      ))}
                    </View>

                    <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Review</Text>
                    <Input
                      placeholder="Your thoughts, tips..."
                      value={review}
                      onChangeText={setReview}
                      multiline
                      style={{ backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20, minHeight: 80, textAlignVertical: "top", paddingTop: 12 }}
                    />
                  </>
                )}

                <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Tags</Text>
                <Input
                  placeholder="Comma separated, e.g. sushi, date night"
                  value={tags}
                  onChangeText={setTags}
                  style={{ backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 32 }}
                />
              </ScrollView>
            ) : null}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
