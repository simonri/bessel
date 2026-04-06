import { View, Text, Pressable } from "react-native";
import { Star, MapPin } from "lucide-react-native";
import type { PlaceSchema } from "@metron/client";
import { getPlaceFields, CATEGORY_ICONS, CATEGORY_COLORS } from "./lib";
import { useTheme } from "@/design-system";

function RatingStars({ rating, size = 10 }: { rating: number; size?: number }) {
  const theme = useTheme();
  return (
    <View className="flex-row items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          color={i < rating ? theme.colors.statusYellow : theme.colors.border}
          fill={i < rating ? theme.colors.statusYellow : "transparent"}
        />
      ))}
    </View>
  );
}

export { RatingStars };

export function PlaceIcon({
  place,
  size = 44,
  iconSize = 20,
}: {
  place: PlaceSchema;
  size?: number;
  iconSize?: number;
}) {
  const theme = useTheme();
  const category = place.category ?? "";
  const Icon = CATEGORY_ICONS[category] || MapPin;
  const color = CATEGORY_COLORS[category] || theme.colors.subtext;

  return (
    <View
      className="rounded-xl items-center justify-center"
      style={{ width: size, height: size, backgroundColor: `${color}15` }}
    >
      <Icon size={iconSize} color={color} />
    </View>
  );
}

export function PlaceCard({
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
      className="mb-0.5 flex-row items-center gap-3 rounded-xl px-4 py-3 active:bg-zinc-800/60"
    >
      <PlaceIcon place={place} />

      <View className="flex-1 min-w-0">
        <Text className="text-foreground font-medium text-base" numberOfLines={1}>
          {place.name}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-0.5">
          {country && <Text className="text-muted-foreground text-sm">{country}</Text>}
          {country && place.category && <Text className="text-muted-foreground text-sm">·</Text>}
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
