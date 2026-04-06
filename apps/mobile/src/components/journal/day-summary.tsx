import { View, Text } from "react-native";
import { Sun, Moon, Star, Check, X, Clock } from "lucide-react-native";
import type { JournalEntrySchema } from "@metron/client";

type CaptureItem = { text: string; timestamp: string };

export function DaySummary({ entry }: { entry: JournalEntrySchema }) {
  const hasMorning = !!(entry.priority || entry.friction || entry.gratitude_1);
  const captures = (entry.captures as CaptureItem[] | null) ?? [];
  const hasAudit = entry.scorecard != null || entry.priority_done != null || entry.insight || entry.seed;

  if (!hasMorning && captures.length === 0 && !hasAudit) {
    return (
      <View className="px-4 items-center py-16">
        <Text style={{ fontSize: 15, color: "#3f3f46" }}>No entry for this day.</Text>
      </View>
    );
  }

  return (
    <View className="px-4 gap-4">
      {hasMorning && (
        <View className="rounded-xl bg-zinc-800 overflow-hidden">
          <View className="flex-row items-center gap-2 px-4 pt-3.5 pb-2">
            <Sun size={16} color="#facc15" />
            <Text className="text-foreground font-medium" style={{ fontSize: 15 }}>
              Morning plan
            </Text>
          </View>
          {entry.priority && (
            <View className="px-4 py-2">
              <Text className="text-zinc-500" style={{ fontSize: 13 }}>The one thing</Text>
              <Text className="text-foreground" style={{ fontSize: 15 }}>{entry.priority}</Text>
            </View>
          )}
          {entry.friction && (
            <View className="px-4 py-2">
              <Text className="text-zinc-500" style={{ fontSize: 13 }}>Obstacle</Text>
              <Text className="text-foreground" style={{ fontSize: 15 }}>{entry.friction}</Text>
            </View>
          )}
          {(entry.gratitude_1 || entry.gratitude_2 || entry.gratitude_3) && (
            <View className="px-4 py-2 pb-3.5">
              <Text className="text-zinc-500 mb-1" style={{ fontSize: 13 }}>Gratitude</Text>
              {[entry.gratitude_1, entry.gratitude_2, entry.gratitude_3].map((g, i) =>
                g ? (
                  <Text key={i} className="text-foreground" style={{ fontSize: 15 }}>
                    {i + 1}. {g}
                  </Text>
                ) : null,
              )}
            </View>
          )}
        </View>
      )}

      {captures.length > 0 && (
        <View className="rounded-xl bg-zinc-800 overflow-hidden">
          <View className="flex-row items-center gap-2 px-4 pt-3.5 pb-2">
            <Clock size={16} color="#a1a1aa" />
            <Text className="text-foreground font-medium" style={{ fontSize: 15 }}>
              Captures
            </Text>
            <Text className="text-zinc-600" style={{ fontSize: 13 }}>{captures.length}</Text>
          </View>
          {captures.map((item, i) => (
            <View
              key={i}
              className={`px-4 py-2.5 ${i < captures.length - 1 ? "border-b border-zinc-700" : "pb-3.5"}`}
            >
              <Text className="text-foreground" style={{ fontSize: 15 }}>{item.text}</Text>
              {item.timestamp && (
                <Text className="text-zinc-600" style={{ fontSize: 12 }}>
                  {new Date(item.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {hasAudit && (
        <View className="rounded-xl bg-zinc-800 overflow-hidden">
          <View className="flex-row items-center gap-2 px-4 pt-3.5 pb-2">
            <Moon size={16} color="#a78bfa" />
            <Text className="text-foreground font-medium" style={{ fontSize: 15 }}>
              Reflection
            </Text>
          </View>
          {entry.priority && entry.priority_done != null && (
            <View className="px-4 py-2 flex-row items-center gap-2">
              {entry.priority_done ? (
                <Check size={14} color="#22c55e" />
              ) : (
                <X size={14} color="#ef4444" />
              )}
              <Text
                className={entry.priority_done ? "text-green-500" : "text-red-500"}
                style={{ fontSize: 15 }}
              >
                {entry.priority_done ? "Priority done" : "Priority missed"}
              </Text>
            </View>
          )}
          {entry.scorecard != null && (
            <View className="px-4 py-2 flex-row items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={16}
                  color={n <= entry.scorecard! ? "#facc15" : "#3f3f46"}
                  fill={n <= entry.scorecard! ? "#facc15" : "transparent"}
                />
              ))}
            </View>
          )}
          {entry.insight && (
            <View className="px-4 py-2">
              <Text className="text-zinc-500" style={{ fontSize: 13 }}>Key takeaway</Text>
              <Text className="text-foreground" style={{ fontSize: 15 }}>{entry.insight}</Text>
            </View>
          )}
          {entry.seed && (
            <View className="px-4 py-2 pb-3.5">
              <Text className="text-zinc-500" style={{ fontSize: 13 }}>Tomorrow's problem</Text>
              <Text className="text-foreground" style={{ fontSize: 15 }}>{entry.seed}</Text>
            </View>
          )}
          {!entry.insight && !entry.seed && <View className="h-2" />}
        </View>
      )}
    </View>
  );
}
