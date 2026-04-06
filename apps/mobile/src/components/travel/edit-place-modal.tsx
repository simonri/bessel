// @ts-nocheck — query-core version mismatch between @metron/client and mobile app
import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  updatePlaceV1PlacesPlaceIdPatchMutation,
  listPlacesV1PlacesGetQueryKey,
} from "@metron/client";
import type { PlaceSchema } from "@metron/client";
import { Star } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Input } from "@/components/shared/input";
import { client } from "@/lib/client";
import { getPlaceFields, CATEGORIES } from "./lib";

export function EditPlaceModal({
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
        visited_at: status === "visited" && visitedAt ? visitedAt : null,
        review: review.trim() || null,
        tags: parsedTags.length > 0 ? parsedTags : null,
      },
    });
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-[#171717]">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "height" : undefined} className="flex-1">
          <SafeAreaView className="flex-1 pt-5">
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
              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Name</Text>
              <Input value={name} onChangeText={setName} placeholder="Place name" className="bg-zinc-800 rounded-xl px-4 py-3 mb-5" />

              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Status</Text>
              <View className="flex-row gap-2 mb-5">
                <Pressable
                  onPress={() => setStatus("want_to_go")}
                  className={`flex-1 items-center py-2.5 rounded-xl ${status === "want_to_go" ? "bg-amber-500/15" : "bg-zinc-800"}`}
                >
                  <Text className={`text-sm font-medium ${status === "want_to_go" ? "text-amber-500" : "text-muted-foreground"}`}>Want to go</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setStatus("visited"); if (!visitedAt) setVisitedAt(new Date()); }}
                  className={`flex-1 items-center py-2.5 rounded-xl ${status === "visited" ? "bg-green-500/15" : "bg-zinc-800"}`}
                >
                  <Text className={`text-sm font-medium ${status === "visited" ? "text-green-500" : "text-muted-foreground"}`}>Visited</Text>
                </Pressable>
              </View>

              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Rating</Text>
              <View className="flex-row gap-2 mb-5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable key={star} onPress={() => setRating(rating === star ? null : star)} className="p-1">
                    <Star size={28} color={rating && star <= rating ? "#eab308" : "#3f3f46"} fill={rating && star <= rating ? "#eab308" : "transparent"} />
                  </Pressable>
                ))}
              </View>

              {status === "visited" && (
                <>
                  <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Date Visited</Text>
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

              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Review</Text>
              <Input
                value={review}
                onChangeText={setReview}
                placeholder="Your thoughts, tips..."
                multiline
                className="bg-zinc-800 rounded-xl px-4 py-3 mb-5"
                style={{ minHeight: 80, textAlignVertical: "top", paddingTop: 12 }}
              />

              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5" contentContainerStyle={{ gap: 8 }}>
                <Pressable onPress={() => setCategory("")} className={`rounded-full px-3 py-1.5 ${!category ? "bg-foreground" : "bg-zinc-800"}`}>
                  <Text className={`text-xs font-medium ${!category ? "text-primary-foreground" : "text-muted-foreground"}`}>None</Text>
                </Pressable>
                {CATEGORIES.map((cat) => (
                  <Pressable key={cat} onPress={() => setCategory(cat)} className={`rounded-full px-3 py-1.5 ${category === cat ? "bg-foreground" : "bg-zinc-800"}`}>
                    <Text className={`text-xs font-medium capitalize ${category === cat ? "text-primary-foreground" : "text-muted-foreground"}`}>{cat}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Tags</Text>
              <Input value={tags} onChangeText={setTags} placeholder="Comma separated, e.g. sushi, date night" className="bg-zinc-800 rounded-xl px-4 py-3 mb-5" />

              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Address</Text>
              <Input value={address} onChangeText={setAddress} placeholder="Full address" className="bg-zinc-800 rounded-xl px-4 py-3 mb-5" />

              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Country</Text>
              <Input value={country} onChangeText={setCountry} placeholder="e.g. Japan" className="bg-zinc-800 rounded-xl px-4 py-3 mb-8" />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
