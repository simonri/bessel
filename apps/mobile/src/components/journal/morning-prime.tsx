import { View, Pressable } from "react-native";
import { Text } from "@/components/shared/text";
import { Sun, Check } from "lucide-react-native";
import { Input } from "@/components/shared/input";
import { useTheme } from "@/design-system";

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
  const theme = useTheme();

  return (
    <View style={{ paddingHorizontal: 16, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Sun size={20} color={theme.colors.statusYellow} />
        <Text style={{ color: theme.colors.text, fontFamily: "Inter-SemiBold", fontSize: 18 }}>
          Good morning
        </Text>
      </View>

      <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, overflow: "hidden" }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: theme.colors.border }}>
          <Text style={{ color: theme.colors.text, fontFamily: "Inter-Medium", marginBottom: 2, fontSize: 15 }}>
            The one thing
          </Text>
          <Text style={{ color: theme.colors.textSubtle, marginBottom: 8, fontSize: 13 }}>
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
        <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
          <Text style={{ color: theme.colors.text, fontFamily: "Inter-Medium", marginBottom: 2, fontSize: 15 }}>
            Obstacle
          </Text>
          <Text style={{ color: theme.colors.textSubtle, marginBottom: 8, fontSize: 13 }}>
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

      <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 16, paddingVertical: 14 }}>
        <Text style={{ color: theme.colors.text, fontFamily: "Inter-Medium", marginBottom: 2, fontSize: 15 }}>
          Gratitude
        </Text>
        <Text style={{ color: theme.colors.textSubtle, marginBottom: 12, fontSize: 13 }}>
          Three things you're grateful for right now.
        </Text>
        <View style={{ gap: 12 }}>
          {[
            { value: gratitude1, onChange: onChangeGratitude1, n: 1 },
            { value: gratitude2, onChange: onChangeGratitude2, n: 2 },
            { value: gratitude3, onChange: onChangeGratitude3, n: 3 },
          ].map(({ value, onChange, n }) => (
            <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: "Inter-Medium", fontSize: 15 }}>{n}.</Text>
              <View style={{ flex: 1 }}>
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
        style={{
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          paddingVertical: 14,
          backgroundColor: isCommitted ? theme.colors.surfaceRaised : theme.colors.text,
        }}
      >
        {isCommitted ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Check size={18} color={theme.colors.success} />
            <Text style={{ fontFamily: "Inter-SemiBold", color: theme.colors.success, fontSize: 15 }}>
              Morning locked in
            </Text>
          </View>
        ) : (
          <Text style={{ fontFamily: "Inter-SemiBold", color: theme.colors.background, fontSize: 15 }}>
            Commit & Start Day
          </Text>
        )}
      </Pressable>
    </View>
  );
}
