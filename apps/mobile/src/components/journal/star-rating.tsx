import { View, Pressable } from "react-native";
import { Star } from "lucide-react-native";
import { useTheme } from "@/design-system";

export function StarRating({
  value,
  onChange,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  const theme = useTheme();
  const current = value ?? 0;

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(current === n ? null : n)}
          hitSlop={4}
        >
          <Star
            size={32}
            color={n <= current ? theme.colors.statusYellow : theme.colors.surfaceHover}
            fill={n <= current ? theme.colors.statusYellow : "transparent"}
          />
        </Pressable>
      ))}
    </View>
  );
}
