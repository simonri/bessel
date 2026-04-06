import { View, Text, Pressable, TextInput } from "react-native";
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
    <View className="items-center gap-1">
      {label && (
        <Text className="text-muted-foreground uppercase" style={{ fontSize: 10, fontWeight: "600" }}>
          {label}
        </Text>
      )}
      <View className="flex-row items-center gap-1">
        <Pressable
          onPress={() => onChange(Math.max(0, display - step))}
          className="w-11 h-11 items-center justify-center rounded-xl bg-zinc-700"
          hitSlop={4}
        >
          <Minus size={18} color="#a1a1aa" />
        </Pressable>
        <TextInput
          value={isGhost ? "" : String(display)}
          placeholder={ghostValue != null ? String(ghostValue) : "0"}
          placeholderTextColor="#52525b"
          onChangeText={(t) => {
            const n = parseFloat(t);
            if (!isNaN(n)) onChange(n);
          }}
          keyboardType="numeric"
          returnKeyType="done"
          className="text-center"
          style={{
            color: isPB ? "#facc15" : theme.colors.foreground,
            fontSize: 18,
            fontWeight: "700",
            width: 56,
            height: 44,
            fontVariant: ["tabular-nums"],
          }}
        />
        <Pressable
          onPress={() => onChange(display + step)}
          className="w-11 h-11 items-center justify-center rounded-xl bg-zinc-700"
          hitSlop={4}
        >
          <Plus size={18} color="#a1a1aa" />
        </Pressable>
      </View>
    </View>
  );
}
