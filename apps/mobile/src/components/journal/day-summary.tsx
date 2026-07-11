import { View } from "react-native";
import { Text } from "@/components/shared/text";
import { Sun, Moon, Star, Check, X, Clock } from "lucide-react-native";
import type { JournalEntrySchema } from "@bessel/client";
import { useTheme } from "@/design-system";

type CaptureItem = { text: string; timestamp: string };

export function DaySummary({ entry }: { entry: JournalEntrySchema }) {
  const theme = useTheme();
  const hasMorning = !!(entry.priority || entry.friction || entry.gratitude_1);
  const captures = (entry.captures as CaptureItem[] | null) ?? [];
  const hasAudit = entry.scorecard != null || entry.priority_done != null || entry.insight || entry.seed;

  if (!hasMorning && captures.length === 0 && !hasAudit) {
    return (
      <View style={{ paddingHorizontal: 16, alignItems: "center", paddingVertical: 64 }}>
        <Text style={{ fontSize: 15, color: theme.colors.border }}>No entry for this day.</Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, gap: 16 }}>
      {hasMorning && (
        <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
            <Sun size={16} color={theme.colors.statusYellow} />
            <Text style={{ color: theme.colors.text, fontFamily: "Inter-Medium", fontSize: 15 }}>
              Morning plan
            </Text>
          </View>
          {entry.priority && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ color: theme.colors.textSubtle, fontSize: 13 }}>The one thing</Text>
              <Text style={{ color: theme.colors.text, fontSize: 15 }}>{entry.priority}</Text>
            </View>
          )}
          {entry.friction && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ color: theme.colors.textSubtle, fontSize: 13 }}>Obstacle</Text>
              <Text style={{ color: theme.colors.text, fontSize: 15 }}>{entry.friction}</Text>
            </View>
          )}
          {(entry.gratitude_1 || entry.gratitude_2 || entry.gratitude_3) && (
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 }}>
              <Text style={{ color: theme.colors.textSubtle, marginBottom: 4, fontSize: 13 }}>Gratitude</Text>
              {[entry.gratitude_1, entry.gratitude_2, entry.gratitude_3].map((g, i) =>
                g ? (
                  <Text key={i} style={{ color: theme.colors.text, fontSize: 15 }}>
                    {i + 1}. {g}
                  </Text>
                ) : null,
              )}
            </View>
          )}
        </View>
      )}

      {captures.length > 0 && (
        <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
            <Clock size={16} color={theme.colors.textMuted} />
            <Text style={{ color: theme.colors.text, fontFamily: "Inter-Medium", fontSize: 15 }}>
              Captures
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{captures.length}</Text>
          </View>
          {captures.map((item, i) => (
            <View
              key={i}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                ...(i < captures.length - 1
                  ? { borderBottomWidth: 1, borderColor: theme.colors.border }
                  : { paddingBottom: 14 }),
              }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 15 }}>{item.text}</Text>
              {item.timestamp && (
                <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                  {new Date(item.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {hasAudit && (
        <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
            <Moon size={16} color={theme.colors.statusPurple} />
            <Text style={{ color: theme.colors.text, fontFamily: "Inter-Medium", fontSize: 15 }}>
              Reflection
            </Text>
          </View>
          {entry.priority && entry.priority_done != null && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
              {entry.priority_done ? (
                <Check size={14} color={theme.colors.success} />
              ) : (
                <X size={14} color={theme.colors.error} />
              )}
              <Text
                style={{ color: entry.priority_done ? theme.colors.success : theme.colors.error, fontSize: 15 }}
              >
                {entry.priority_done ? "Priority done" : "Priority missed"}
              </Text>
            </View>
          )}
          {entry.scorecard != null && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={16}
                  color={n <= entry.scorecard! ? theme.colors.statusYellow : theme.colors.border}
                  fill={n <= entry.scorecard! ? theme.colors.statusYellow : "transparent"}
                />
              ))}
            </View>
          )}
          {entry.insight && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ color: theme.colors.textSubtle, fontSize: 13 }}>Key takeaway</Text>
              <Text style={{ color: theme.colors.text, fontSize: 15 }}>{entry.insight}</Text>
            </View>
          )}
          {entry.seed && (
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 }}>
              <Text style={{ color: theme.colors.textSubtle, fontSize: 13 }}>Tomorrow's problem</Text>
              <Text style={{ color: theme.colors.text, fontSize: 15 }}>{entry.seed}</Text>
            </View>
          )}
          {!entry.insight && !entry.seed && <View style={{ height: 8 }} />}
        </View>
      )}
    </View>
  );
}
