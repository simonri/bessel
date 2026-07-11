import { View, Pressable } from "react-native";
import { Text } from "@/components/shared/text";
import { Star, MapPin } from "lucide-react-native";
import type { PlaceSchema } from "@bessel/client";
import { getPlaceFields, CATEGORY_ICONS, CATEGORY_COLORS } from "./lib";
import { useTheme } from "@/design-system";

function RatingStars({ rating, size = 10 }: { rating: number; size?: number }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
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
      style={{ borderRadius: 12, alignItems: "center", justifyContent: "center", width: size, height: size, backgroundColor: `${color}15` }}
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
      style={{ marginBottom: 2, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }}
    >
      <PlaceIcon place={place} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyEmphasis" color="text" numberOfLines={1}>
          {place.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          {country && <Text variant="label" color="subtext">{country}</Text>}
          {country && place.category && <Text variant="label" color="subtext">·</Text>}
          {place.category && (
            <Text variant="label" color="subtext" style={{ textTransform: "capitalize" }}>
              {place.category.replace(/_/g, " ")}
            </Text>
          )}
        </View>
      </View>

      {place.rating ? <RatingStars rating={place.rating} /> : null}
    </Pressable>
  );
}
