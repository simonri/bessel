import { useState } from "react";
import { View, Pressable } from "react-native";
import { Text } from "@/components/shared/text";
import { Check, Trophy } from "lucide-react-native";
import { StepperInput } from "./stepper-input";
import { RIRSelector } from "./rir-selector";
import { useTheme } from "@/design-system";

const SET_TYPES = ["standard", "top", "backoff", "failure"] as const;
const SET_TYPE_LABELS: Record<string, string> = {
  standard: "S",
  top: "T",
  backoff: "B",
  failure: "F",
};
const SET_TYPE_COLORS: Record<string, string> = {
  standard: "#5D5D5D",
  top: "#F2C94C",
  backoff: "#4EA7FC",
  failure: "#EB5757",
};

type GhostSet = { weight: number; reps: number; rir?: number | null; set_type?: string | null };

export function SetRow({
  setNumber,
  ghostSet,
  bestWeight,
  isCommitted,
  isPR,
  onCommit,
}: {
  setNumber: number;
  ghostSet?: GhostSet;
  bestWeight?: number;
  isCommitted: boolean;
  isPR: boolean;
  onCommit: (data: { weight: number; reps: number; rir: number | null; set_type: string }) => void;
}) {
  const theme = useTheme();
  const [weight, setWeight] = useState<number | null>(null);
  const [reps, setReps] = useState<number | null>(null);
  const [rir, setRir] = useState<number | null>(ghostSet?.rir ?? null);
  const [setType, setSetType] = useState(ghostSet?.set_type ?? "standard");

  const effectiveWeight = weight ?? ghostSet?.weight ?? 0;
  const effectiveReps = reps ?? ghostSet?.reps ?? 0;
  const isPB = bestWeight != null && effectiveWeight > bestWeight;

  const cycleSetType = () => {
    const idx = SET_TYPES.indexOf(setType as any);
    setSetType(SET_TYPES[(idx + 1) % SET_TYPES.length]);
  };

  const handleCommit = () => {
    onCommit({
      weight: effectiveWeight,
      reps: effectiveReps,
      rir,
      set_type: setType,
    });
  };

  if (isCommitted) {
    return (
      <View style={{ marginHorizontal: 16, marginBottom: 8, borderRadius: 12, backgroundColor: theme.colors.overlay12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ color: theme.colors.textMuted, fontWeight: "bold", width: 32, fontSize: 15 }}>{setNumber}</Text>
          <View
            style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, marginRight: 12, backgroundColor: SET_TYPE_COLORS[setType] + "30" }}
          >
            <Text style={{ color: SET_TYPE_COLORS[setType], fontSize: 11, fontWeight: "700" }}>
              {SET_TYPE_LABELS[setType] ?? "S"}
            </Text>
          </View>
          <Text
            style={{ flex: 1, fontWeight: "bold", fontSize: 16, color: isPR ? theme.colors.statusYellow : theme.colors.text }}
          >
            {effectiveWeight}kg x {effectiveReps}
          </Text>
          {rir != null && (
            <Text style={{ color: theme.colors.textMuted, marginRight: 12, fontSize: 13 }}>
              RIR {rir}
            </Text>
          )}
          {isPR ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Trophy size={14} color={theme.colors.statusYellow} />
              <Text style={{ color: theme.colors.statusYellow, fontSize: 11, fontWeight: "700" }}>PB</Text>
            </View>
          ) : (
            <Check size={18} color={theme.colors.success} />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12, borderRadius: 16, backgroundColor: theme.colors.surfaceRaised, padding: 16 }}>
      {/* Set number + type */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "bold", fontSize: 18 }}>Set {setNumber}</Text>
          <Pressable
            onPress={cycleSetType}
            style={{ borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: SET_TYPE_COLORS[setType] + "30" }}
          >
            <Text style={{ color: SET_TYPE_COLORS[setType], fontSize: 13, fontWeight: "700" }}>
              {SET_TYPE_LABELS[setType] ?? "S"}
            </Text>
          </Pressable>
        </View>
        {isPB && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Trophy size={14} color={theme.colors.statusYellow} />
            <Text style={{ color: theme.colors.statusYellow, fontSize: 12, fontWeight: "700" }}>PB</Text>
          </View>
        )}
      </View>

      {/* Weight + Reps steppers */}
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 16 }}>
        <StepperInput
          value={weight}
          ghostValue={ghostSet?.weight}
          onChange={setWeight}
          step={2.5}
          label="Weight (kg)"
          isPB={isPB}
        />
        <StepperInput
          value={reps}
          ghostValue={ghostSet?.reps}
          onChange={setReps}
          step={1}
          label="Reps"
        />
      </View>

      {/* RIR + Commit */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <RIRSelector value={rir} onChange={setRir} />
        <Pressable
          onPress={handleCommit}
          style={{ width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: theme.colors.success }}
        >
          <Check size={24} color={theme.colors.text} />
        </Pressable>
      </View>
    </View>
  );
}
