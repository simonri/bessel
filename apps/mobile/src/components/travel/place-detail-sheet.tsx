import { View } from "react-native";
import { Text } from "@/components/shared/text";
import { MapPin, Navigation, Check, Trash2, Pencil } from "lucide-react-native";
import { Button } from "@/components/shared/button";
import type { PlaceSchema } from "@metron/client";
import { BottomSheet } from "@/components/shared/sheet";
import { PlaceIcon, RatingStars } from "./place-card";
import { getPlaceFields, formatDate, CATEGORY_COLORS } from "./lib";
import { useTheme } from "@/design-system";

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
  const theme = useTheme();
  const { country, status, visitedAt, tags } = getPlaceFields(place);
  const isVisited = status === "visited";
  const category = place.category ?? "";
  const color = CATEGORY_COLORS[category] || theme.colors.subtext;

  return (
    <BottomSheet onDismiss={onClose}>
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <PlaceIcon place={place} size={56} iconSize={26} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="headingSmall" color="text" numberOfLines={2}>
              {place.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              {country && <Text variant="label" color="subtext">{country}</Text>}
              {country && place.category && <Text variant="label" color="subtext">·</Text>}
              {place.category && (
                <Text variant="label" style={{ textTransform: "capitalize", color }}>
                  {place.category.replace(/_/g, " ")}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          {place.rating ? <RatingStars rating={place.rating} size={16} /> : null}
          {!!visitedAt && (
            <Text variant="label" color="subtext">{formatDate(visitedAt)}</Text>
          )}
        </View>

        {tags.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {tags.map((tag) => (
              <View key={tag} style={{ borderRadius: 9999, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text variant="label" style={{ color: theme.colors.text }}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {place.address && (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 16, backgroundColor: theme.colors.overlay12, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
            <MapPin size={16} color={theme.colors.subtext} />
            <Text variant="label" color="text" style={{ flex: 1, lineHeight: 20 }}>{place.address}</Text>
          </View>
        )}

        {place.review && (
          <View style={{ marginBottom: 16, backgroundColor: theme.colors.overlay12, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text variant="label" style={{ color: theme.colors.text, lineHeight: 22 }}>{place.review}</Text>
          </View>
        )}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <Button flex variant="filled" onPress={() => { onEdit(place); onClose(); }} icon={<Pencil size={16} color={theme.colors.monochrome} />}>Edit</Button>
          <Button flex variant="filled" onPress={() => { onOpenMaps(place); onClose(); }} icon={<Navigation size={16} color={theme.colors.monochrome} />}>Maps</Button>
          {!isVisited && (
            <Button flex variant="tinted" onPress={() => { onMarkVisited(place); onClose(); }} icon={<Check size={16} color={theme.colors.error} />}>Visited</Button>
          )}
          <Button flex variant="destructive" onPress={() => { onDelete(place); onClose(); }} icon={<Trash2 size={16} color={theme.colors.error} />}>Delete</Button>
        </View>
      </View>
    </BottomSheet>
  );
}
