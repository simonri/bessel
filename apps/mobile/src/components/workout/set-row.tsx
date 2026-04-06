import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Check, Trophy } from "lucide-react-native";
import { StepperInput } from "./stepper-input";
import { RIRSelector } from "./rir-selector";

const SET_TYPES = ["standard", "top", "backoff", "failure"] as const;
const SET_TYPE_LABELS: Record<string, string> = {
  standard: "S",
  top: "T",
  backoff: "B",
  failure: "F",
};
const SET_TYPE_COLORS: Record<string, string> = {
  standard: "#a1a1aa",
  top: "#facc15",
  backoff: "#60a5fa",
  failure: "#ef4444",
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
      <View className="mx-4 mb-2 rounded-xl bg-zinc-800/30 px-4 py-3">
        <View className="flex-row items-center">
          <Text className="text-muted-foreground font-bold w-8" style={{ fontSize: 15 }}>{setNumber}</Text>
          <View
            className="rounded-full px-2 py-0.5 mr-3"
            style={{ backgroundColor: SET_TYPE_COLORS[setType] + "30" }}
          >
            <Text style={{ color: SET_TYPE_COLORS[setType], fontSize: 11, fontWeight: "700" }}>
              {SET_TYPE_LABELS[setType] ?? "S"}
            </Text>
          </View>
          <Text
            className="flex-1 font-bold"
            style={{ fontSize: 16, color: isPR ? "#facc15" : "#fafafa" }}
          >
            {effectiveWeight}kg x {effectiveReps}
          </Text>
          {rir != null && (
            <Text className="text-muted-foreground mr-3" style={{ fontSize: 13 }}>
              RIR {rir}
            </Text>
          )}
          {isPR ? (
            <View className="flex-row items-center gap-1">
              <Trophy size={14} color="#facc15" />
              <Text style={{ color: "#facc15", fontSize: 11, fontWeight: "700" }}>PB</Text>
            </View>
          ) : (
            <Check size={18} color="#22c55e" />
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="mx-4 mb-3 rounded-2xl bg-zinc-800 p-4">
      {/* Set number + type */}
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center gap-3">
          <Text className="text-foreground font-bold" style={{ fontSize: 18 }}>Set {setNumber}</Text>
          <Pressable
            onPress={cycleSetType}
            className="rounded-full px-3 py-1"
            style={{ backgroundColor: SET_TYPE_COLORS[setType] + "30" }}
          >
            <Text style={{ color: SET_TYPE_COLORS[setType], fontSize: 13, fontWeight: "700" }}>
              {SET_TYPE_LABELS[setType] ?? "S"}
            </Text>
          </Pressable>
        </View>
        {isPB && (
          <View className="flex-row items-center gap-1">
            <Trophy size={14} color="#facc15" />
            <Text style={{ color: "#facc15", fontSize: 12, fontWeight: "700" }}>PB</Text>
          </View>
        )}
      </View>

      {/* Weight + Reps steppers */}
      <View className="flex-row justify-around mb-4">
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
      <View className="flex-row items-end justify-between">
        <RIRSelector value={rir} onChange={setRir} />
        <Pressable
          onPress={handleCommit}
          className="w-14 h-14 items-center justify-center rounded-2xl bg-green-600"
        >
          <Check size={24} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}
