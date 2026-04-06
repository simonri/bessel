import { View, Text, Pressable } from "react-native";
import { MapPin, Navigation, Check, Trash2, Pencil } from "lucide-react-native";
import type { PlaceSchema } from "@metron/client";
import { BottomSheet } from "@/components/shared/sheet";
import { PlaceIcon, RatingStars } from "./place-card";
import { getPlaceFields, formatDate, CATEGORY_COLORS } from "./lib";

export function PlaceDetailSheet({
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
        <View className="flex-row items-center gap-4 mb-4">
          <PlaceIcon place={place} size={56} iconSize={26} />
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-2xl font-bold" numberOfLines={2}>
              {place.name}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              {country && <Text className="text-muted-foreground text-[15px]">{country}</Text>}
              {country && place.category && <Text className="text-muted-foreground text-[15px]">·</Text>}
              {place.category && (
                <Text className="text-[15px] capitalize" style={{ color }}>
                  {place.category.replace(/_/g, " ")}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View className="flex-row items-center gap-3 mb-4">
          {place.rating ? <RatingStars rating={place.rating} size={16} /> : null}
          {!!visitedAt && (
            <Text className="text-muted-foreground text-sm">{formatDate(visitedAt)}</Text>
          )}
        </View>

        {tags.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mb-4">
            {tags.map((tag) => (
              <View key={tag} className="rounded-full bg-zinc-800 px-3 py-1.5">
                <Text className="text-sm text-zinc-300">{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {place.address && (
          <View className="flex-row items-start gap-2.5 mb-4 bg-zinc-800/60 rounded-xl px-3.5 py-3">
            <MapPin size={16} color="#71717a" />
            <Text className="text-foreground text-[15px] flex-1 leading-snug">{place.address}</Text>
          </View>
        )}

        {place.review && (
          <View className="mb-4 bg-zinc-800/60 rounded-xl px-3.5 py-3">
            <Text className="text-zinc-300 text-[15px] leading-relaxed">{place.review}</Text>
          </View>
        )}

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
