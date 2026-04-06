import { View, Text, Pressable } from "react-native";
import { Moon, Check } from "lucide-react-native";
import { Input } from "@/components/shared/input";
import { Button } from "@/components/shared/button";
import { StarRating } from "./star-rating";

export function EveningAudit({
  priority,
  priorityDone,
  scorecard,
  insight,
  seed,
  isSaving,
  onChangePriorityDone,
  onChangeScorecard,
  onChangeInsight,
  onChangeSeed,
  onClose,
}: {
  priority: string | null;
  priorityDone: boolean | null;
  scorecard: number | null;
  insight: string;
  seed: string;
  isSaving: boolean;
  onChangePriorityDone: (v: boolean) => void;
  onChangeScorecard: (v: number | null) => void;
  onChangeInsight: (v: string) => void;
  onChangeSeed: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <View className="px-4 gap-4">
      <View className="flex-row items-center gap-2 mb-1">
        <Moon size={20} color="#a78bfa" />
        <Text className="text-foreground font-semibold" style={{ fontSize: 18 }}>
          Reflect on your day
        </Text>
      </View>

      {priority && (
        <View className="rounded-xl bg-zinc-800 overflow-hidden">
          <View className="px-4 py-3.5 border-b border-zinc-700">
            <Text className="text-zinc-500 mb-1" style={{ fontSize: 13 }}>
              Your priority was
            </Text>
            <Text className="text-foreground font-medium" style={{ fontSize: 16 }}>
              {priority}
            </Text>
          </View>
          <View className="px-4 py-3.5">
            <Text className="text-foreground mb-3" style={{ fontSize: 15 }}>
              Did you get it done?
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => onChangePriorityDone(true)}
                className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 ${
                  priorityDone === true ? "bg-green-500/20" : "bg-zinc-700"
                }`}
              >
                <Check size={16} color={priorityDone === true ? "#22c55e" : "#71717a"} />
                <Text
                  className={`font-medium ${priorityDone === true ? "text-green-500" : "text-muted-foreground"}`}
                  style={{ fontSize: 15 }}
                >
                  Yes
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onChangePriorityDone(false)}
                className={`flex-1 items-center justify-center rounded-xl py-3 ${
                  priorityDone === false ? "bg-red-500/20" : "bg-zinc-700"
                }`}
              >
                <Text
                  className={`font-medium ${priorityDone === false ? "text-red-500" : "text-muted-foreground"}`}
                  style={{ fontSize: 15 }}
                >
                  No
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <View className="rounded-xl bg-zinc-800 px-4 py-3.5 gap-3">
        <Text className="text-foreground font-medium" style={{ fontSize: 15 }}>
          Rate your day
        </Text>
        <StarRating value={scorecard} onChange={onChangeScorecard} />
      </View>

      <View className="rounded-xl bg-zinc-800 overflow-hidden">
        <View className="px-4 py-3.5 border-b border-zinc-700">
          <Text className="text-foreground font-medium mb-0.5" style={{ fontSize: 15 }}>
            Key takeaway
          </Text>
          <Text className="text-zinc-500 mb-2" style={{ fontSize: 13 }}>
            What's the most important thing you learned or realized today?
          </Text>
          <Input
            value={insight}
            onChangeText={onChangeInsight}
            placeholder="e.g. Saying no to meetings protects deep work"
            multiline
            style={{ fontSize: 15, minHeight: 60, textAlignVertical: "top" }}
          />
        </View>
        <View className="px-4 py-3.5">
          <Text className="text-foreground font-medium mb-0.5" style={{ fontSize: 15 }}>
            Tomorrow's problem
          </Text>
          <Text className="text-zinc-500 mb-2" style={{ fontSize: 13 }}>
            Give your brain something to work on overnight.
          </Text>
          <Input
            value={seed}
            onChangeText={onChangeSeed}
            placeholder="e.g. How should I restructure the API?"
            multiline
            style={{ fontSize: 15, minHeight: 60, textAlignVertical: "top" }}
          />
        </View>
      </View>

      <Button onPress={onClose} loading={isSaving} fullWidth size="medium">
        Close the Day
      </Button>
    </View>
  );
}
