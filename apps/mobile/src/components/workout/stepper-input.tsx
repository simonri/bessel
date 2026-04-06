import { View, Pressable, TextInput } from "react-native";
import { Text } from "@/components/shared/text";
import { Minus, Plus } from "lucide-react-native";
import { useTheme } from "@/design-system";

export function StepperInput({
  value,
  ghostValue,
  onChange,
  step = 1,
  label,
  isPB,
}: {
  value: number | null;
  ghostValue?: number;
  onChange: (v: number) => void;
  step?: number;
  label?: string;
  isPB?: boolean;
}) {
  const theme = useTheme();
  const display = value ?? ghostValue ?? 0;
  const isGhost = value === null;

  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      {label && (
        <Text style={{ color: theme.colors.textMuted, textTransform: "uppercase", fontSize: 10, fontWeight: "600" }}>
          {label}
        </Text>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Pressable
          onPress={() => onChange(Math.max(0, display - step))}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: theme.colors.surfaceHover }}
          hitSlop={4}
        >
          <Minus size={18} color={theme.colors.textMuted} />
        </Pressable>
        <TextInput
          value={isGhost ? "" : String(display)}
          placeholder={ghostValue != null ? String(ghostValue) : "0"}
          placeholderTextColor={theme.colors.textMuted}
          onChangeText={(t) => {
            const n = parseFloat(t);
            if (!isNaN(n)) onChange(n);
          }}
          keyboardType="numeric"
          returnKeyType="done"
          style={{
            textAlign: "center",
            color: isPB ? theme.colors.statusYellow : theme.colors.foreground,
            fontSize: 18,
            fontWeight: "700",
            width: 56,
            height: 44,
            fontVariant: ["tabular-nums"],
          }}
        />
        <Pressable
          onPress={() => onChange(display + step)}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: theme.colors.surfaceHover }}
          hitSlop={4}
        >
          <Plus size={18} color={theme.colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}
