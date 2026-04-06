import { View, Text, Pressable } from "react-native";
import { Sun, Check } from "lucide-react-native";
import { Input } from "@/components/shared/input";

export function MorningPrime({
  priority,
  friction,
  gratitude1,
  gratitude2,
  gratitude3,
  isCommitted,
  isSaving,
  onChangePriority,
  onChangeFriction,
  onChangeGratitude1,
  onChangeGratitude2,
  onChangeGratitude3,
  onCommit,
}: {
  priority: string;
  friction: string;
  gratitude1: string;
  gratitude2: string;
  gratitude3: string;
  isCommitted: boolean;
  isSaving: boolean;
  onChangePriority: (v: string) => void;
  onChangeFriction: (v: string) => void;
  onChangeGratitude1: (v: string) => void;
  onChangeGratitude2: (v: string) => void;
  onChangeGratitude3: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <View className="px-4 gap-4">
      <View className="flex-row items-center gap-2 mb-1">
        <Sun size={20} color="#facc15" />
        <Text className="text-foreground font-semibold" style={{ fontSize: 18 }}>
          Good morning
        </Text>
      </View>

      <View className="rounded-xl bg-zinc-800 overflow-hidden">
        <View className="px-4 py-3.5 border-b border-zinc-700">
          <Text className="text-foreground font-medium mb-0.5" style={{ fontSize: 15 }}>
            The one thing
          </Text>
          <Text className="text-zinc-500 mb-2" style={{ fontSize: 13 }}>
            If you could only accomplish one thing today, what would it be?
          </Text>
          <Input
            value={priority}
            onChangeText={onChangePriority}
            placeholder="e.g. Ship the login page"
            style={{ fontSize: 16 }}
            multiline
          />
        </View>
        <View className="px-4 py-3.5">
          <Text className="text-foreground font-medium mb-0.5" style={{ fontSize: 15 }}>
            Obstacle
          </Text>
          <Text className="text-zinc-500 mb-2" style={{ fontSize: 13 }}>
            What could get in the way? Name it so you can plan around it.
          </Text>
          <Input
            value={friction}
            onChangeText={onChangeFriction}
            placeholder="e.g. Waiting on design review"
            style={{ fontSize: 16 }}
            multiline
          />
        </View>
      </View>

      <View className="rounded-xl bg-zinc-800 px-4 py-3.5">
        <Text className="text-foreground font-medium mb-0.5" style={{ fontSize: 15 }}>
          Gratitude
        </Text>
        <Text className="text-zinc-500 mb-3" style={{ fontSize: 13 }}>
          Three things you're grateful for right now.
        </Text>
        <View className="gap-3">
          {[
            { value: gratitude1, onChange: onChangeGratitude1, n: 1 },
            { value: gratitude2, onChange: onChangeGratitude2, n: 2 },
            { value: gratitude3, onChange: onChangeGratitude3, n: 3 },
          ].map(({ value, onChange, n }) => (
            <View key={n} className="flex-row items-center gap-3">
              <Text className="text-zinc-600 font-medium" style={{ fontSize: 15 }}>{n}.</Text>
              <View className="flex-1">
                <Input
                  value={value}
                  onChangeText={onChange}
                  placeholder={n === 1 ? "e.g. Good health" : n === 2 ? "e.g. My team" : "e.g. Morning coffee"}
                  style={{ fontSize: 15 }}
                />
              </View>
            </View>
          ))}
        </View>
      </View>

      <Pressable
        onPress={onCommit}
        disabled={isSaving}
        className={`items-center justify-center rounded-xl py-3.5 ${
          isCommitted ? "bg-zinc-800" : "bg-foreground"
        }`}
      >
        {isCommitted ? (
          <View className="flex-row items-center gap-2">
            <Check size={18} color="#22c55e" />
            <Text className="font-semibold text-green-500" style={{ fontSize: 15 }}>
              Morning locked in
            </Text>
          </View>
        ) : (
          <Text className="font-semibold text-background" style={{ fontSize: 15 }}>
            Commit & Start Day
          </Text>
        )}
      </Pressable>
    </View>
  );
}
