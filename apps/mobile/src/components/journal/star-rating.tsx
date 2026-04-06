import { View, Pressable } from "react-native";
import { Star } from "lucide-react-native";

export function StarRating({
  value,
  onChange,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  const current = value ?? 0;

  return (
    <View className="flex-row gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(current === n ? null : n)}
          hitSlop={4}
        >
          <Star
            size={32}
            color={n <= current ? "#facc15" : "#3f3f46"}
            fill={n <= current ? "#facc15" : "transparent"}
          />
        </Pressable>
      ))}
    </View>
  );
}
