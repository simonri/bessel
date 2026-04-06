import { View, Pressable } from "react-native";
import { Text } from "@/components/shared/text";
import { Moon, Check } from "lucide-react-native";
import { Input } from "@/components/shared/input";
import { Button } from "@/components/shared/button";
import { StarRating } from "./star-rating";
import { useTheme } from "@/design-system";

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
  const theme = useTheme();

  return (
    <View style={{ paddingHorizontal: 16, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Moon size={20} color={theme.colors.statusPurple} />
        <Text style={{ color: theme.colors.text, fontFamily: "Inter-SemiBold", fontSize: 18 }}>
          Reflect on your day
        </Text>
      </View>

      {priority && (
        <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, overflow: "hidden" }}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.textSubtle, marginBottom: 4, fontSize: 13 }}>
              Your priority was
            </Text>
            <Text style={{ color: theme.colors.text, fontFamily: "Inter-Medium", fontSize: 16 }}>
              {priority}
            </Text>
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ color: theme.colors.text, marginBottom: 12, fontSize: 15 }}>
              Did you get it done?
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => onChangePriorityDone(true)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRadius: 12,
                  paddingVertical: 12,
                  backgroundColor: priorityDone === true ? theme.colors.successSubtle : theme.colors.surfaceHover,
                }}
              >
                <Check size={16} color={priorityDone === true ? theme.colors.success : theme.colors.textSubtle} />
                <Text
                  style={{
                    fontFamily: "Inter-Medium",
                    fontSize: 15,
                    color: priorityDone === true ? theme.colors.success : theme.colors.textMuted,
                  }}
                >
                  Yes
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onChangePriorityDone(false)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  paddingVertical: 12,
                  backgroundColor: priorityDone === false ? theme.colors.errorSubtle : theme.colors.surfaceHover,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter-Medium",
                    fontSize: 15,
                    color: priorityDone === false ? theme.colors.error : theme.colors.textMuted,
                  }}
                >
                  No
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
        <Text style={{ color: theme.colors.text, fontFamily: "Inter-Medium", fontSize: 15 }}>
          Rate your day
        </Text>
        <StarRating value={scorecard} onChange={onChangeScorecard} />
      </View>

      <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, overflow: "hidden" }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: theme.colors.border }}>
          <Text style={{ color: theme.colors.text, fontFamily: "Inter-Medium", marginBottom: 2, fontSize: 15 }}>
            Key takeaway
          </Text>
          <Text style={{ color: theme.colors.textSubtle, marginBottom: 8, fontSize: 13 }}>
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
        <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
          <Text style={{ color: theme.colors.text, fontFamily: "Inter-Medium", marginBottom: 2, fontSize: 15 }}>
            Tomorrow's problem
          </Text>
          <Text style={{ color: theme.colors.textSubtle, marginBottom: 8, fontSize: 13 }}>
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
