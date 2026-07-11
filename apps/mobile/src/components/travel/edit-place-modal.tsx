import { useState } from "react";
import {
  View,
  Pressable,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Text } from "@/components/shared/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  updatePlaceV1PlacesPlaceIdPatchMutation,
  listPlacesV1PlacesGetQueryKey,
} from "@bessel/client";
import type { PlaceSchema } from "@bessel/client";
import { Star, X, Check } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Input } from "@/components/shared/input";
import { client } from "@/lib/client";
import { getPlaceFields, CATEGORIES } from "./lib";
import { useTheme } from "@/design-system";

export function EditPlaceModal({
  place,
  onClose,
}: {
  place: PlaceSchema;
  onClose: () => void;
}) {
  const theme = useTheme();
  const fields = getPlaceFields(place);
  const [name, setName] = useState(place.name);
  const [address, setAddress] = useState(place.address ?? "");
  const [country, setCountry] = useState(fields.country ?? "");
  const [category, setCategory] = useState(place.category ?? "");
  const [status, setStatus] = useState<"want_to_go" | "visited">(
    fields.status as "want_to_go" | "visited"
  );
  const [rating, setRating] = useState<number | null>(place.rating ?? null);
  const [visitedAt, setVisitedAt] = useState<Date | null>(() => {
    if (!fields.visitedAt) return null;
    return fields.visitedAt instanceof Date ? fields.visitedAt : new Date(fields.visitedAt as string);
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
    onError: (_err: any, _vars: any, context: any) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSuccess: () => onClose(),
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
        visited_at: status === "visited" && visitedAt ? new Date(visitedAt.toISOString().split("T")[0]) : null,
        review: review.trim() || null,
        tags: parsedTags.length > 0 ? parsedTags : null,
      },
    });
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.card }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "height" : undefined} style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, paddingTop: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 16 }}>
              <Pressable onPress={onClose} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: theme.colors.surfaceHover }}>
                <X size={18} color={theme.colors.subtext} />
              </Pressable>
              <Text variant="title" color="text">Edit Place</Text>
              <Pressable
                onPress={handleSave}
                disabled={!name.trim() || updateMutation.isPending}
                style={{
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 9999,
                  backgroundColor: name.trim() ? theme.colors.text : theme.colors.surfaceHover,
                }}
              >
                <Check size={18} color={name.trim() ? theme.colors.monochrome : theme.colors.subtext} />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
              <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Name</Text>
              <Input value={name} onChangeText={setName} placeholder="Place name" style={{ backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20 }} />

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
                  onPress={() => { setStatus("visited"); if (!visitedAt) setVisitedAt(new Date()); }}
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

              <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Rating</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable key={star} onPress={() => setRating(rating === star ? null : star)} style={{ padding: 4 }}>
                    <Star size={28} color={rating && star <= rating ? theme.colors.statusYellow : theme.colors.secondary} fill={rating && star <= rating ? theme.colors.statusYellow : "transparent"} />
                  </Pressable>
                ))}
              </View>

              {status === "visited" && (
                <>
                  <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Date Visited</Text>
                  <DateTimePicker
                    value={visitedAt ?? new Date()}
                    mode="date"
                    display="default"
                    maximumDate={new Date()}
                    themeVariant="dark"
                    onChange={(_event, date) => { if (date) setVisitedAt(date); }}
                    style={{ alignSelf: "flex-start", marginBottom: 16 }}
                  />
                </>
              )}

              <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Review</Text>
              <Input
                value={review}
                onChangeText={setReview}
                placeholder="Your thoughts, tips..."
                multiline
                style={{ backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20, minHeight: 80, textAlignVertical: "top", paddingTop: 12 }}
              />

              <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 8 }}>
                <Pressable onPress={() => setCategory("")} style={{ borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: !category ? theme.colors.text : theme.colors.surfaceRaised }}>
                  <Text variant="caption" color={!category ? "monochrome" : "subtext"}>None</Text>
                </Pressable>
                {CATEGORIES.map((cat) => (
                  <Pressable key={cat} onPress={() => setCategory(cat)} style={{ borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: category === cat ? theme.colors.text : theme.colors.surfaceRaised }}>
                    <Text variant="caption" color={category === cat ? "monochrome" : "subtext"} style={{ textTransform: "capitalize" }}>{cat}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Tags</Text>
              <Input value={tags} onChangeText={setTags} placeholder="Comma separated, e.g. sushi, date night" style={{ backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20 }} />

              <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Address</Text>
              <Input value={address} onChangeText={setAddress} placeholder="Full address" style={{ backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20 }} />

              <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Country</Text>
              <Input value={country} onChangeText={setCountry} placeholder="e.g. Japan" style={{ backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 32 }} />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
