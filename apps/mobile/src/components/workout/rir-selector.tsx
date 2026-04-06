import { View, Text, Pressable } from "react-native";

const RIR_VALUES = [0, 1, 2, 3, 4];
const RIR_LABELS = ["0", "1", "2", "3", "4+"];

export function RIRSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <View className="items-center gap-1">
      <Text className="text-muted-foreground uppercase" style={{ fontSize: 10, fontWeight: "600" }}>
        RIR
      </Text>
      <View className="flex-row gap-1">
        {RIR_VALUES.map((n, i) => (
          <Pressable
            key={n}
            onPress={() => onChange(value === n ? null : n)}
            className={`w-10 h-10 items-center justify-center rounded-xl ${
              value === n ? "bg-foreground" : "bg-zinc-700"
            }`}
          >
            <Text
              className={`font-semibold ${value === n ? "text-background" : "text-muted-foreground"}`}
              style={{ fontSize: 14 }}
            >
              {RIR_LABELS[i]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
