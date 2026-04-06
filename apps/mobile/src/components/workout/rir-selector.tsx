import { View, Pressable } from "react-native";
import { Text } from "@/components/shared/text";
import { useTheme } from "@/design-system";

const RIR_VALUES = [0, 1, 2, 3, 4];
const RIR_LABELS = ["0", "1", "2", "3", "4+"];

export function RIRSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <Text style={{ color: theme.colors.textMuted, textTransform: "uppercase", fontSize: 10, fontWeight: "600" }}>
        RIR
      </Text>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {RIR_VALUES.map((n, i) => (
          <Pressable
            key={n}
            onPress={() => onChange(value === n ? null : n)}
            style={{
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: value === n ? theme.colors.text : theme.colors.surfaceHover,
            }}
          >
            <Text
              style={{
                fontWeight: "600",
                fontSize: 14,
                color: value === n ? theme.colors.background : theme.colors.textMuted,
              }}
            >
              {RIR_LABELS[i]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
