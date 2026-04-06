import { useState } from "react";
import { View, Pressable, Alert } from "react-native";
import { Text } from "@/components/shared/text";
import { Plus, X } from "lucide-react-native";
import { Input } from "@/components/shared/input";
import { useTheme } from "@/design-system";

type CaptureItem = { text: string; timestamp: string };

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function Capture({
  priority,
  captures,
  onAddCapture,
  onDeleteCapture,
}: {
  priority: string | null;
  captures: CaptureItem[];
  onAddCapture: (text: string) => void;
  onDeleteCapture: (index: number) => void;
}) {
  const theme = useTheme();
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    if (!input.trim()) return;
    onAddCapture(input.trim());
    setInput("");
  };

  const handleDelete = (index: number) => {
    Alert.alert("Delete thought?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDeleteCapture(index) },
    ]);
  };

  return (
    <View style={{ paddingHorizontal: 16, gap: 16 }}>
      {priority ? (
        <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 16, paddingVertical: 14 }}>
          <Text style={{ color: theme.colors.textSubtle, marginBottom: 4, fontSize: 13 }}>
            Your priority today
          </Text>
          <Text style={{ color: theme.colors.text, fontFamily: "Inter-Medium", fontSize: 16 }}>
            {priority}
          </Text>
        </View>
      ) : null}

      <View>
        <Text style={{ color: theme.colors.textSubtle, marginBottom: 8, paddingHorizontal: 4, fontSize: 13 }}>
          Quick-dump anything on your mind. Don't hold thoughts — capture them.
        </Text>
        <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Input
              value={input}
              onChangeText={setInput}
              placeholder="What's on your mind?"
              onSubmitEditing={handleSubmit}
              returnKeyType="done"
              style={{ fontSize: 16 }}
            />
          </View>
          <Pressable
            onPress={handleSubmit}
            disabled={!input.trim()}
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
              backgroundColor: input.trim() ? theme.colors.text : theme.colors.surfaceHover,
            }}
          >
            <Plus size={18} color={input.trim() ? theme.colors.background : theme.colors.textSubtle} />
          </Pressable>
        </View>
      </View>

      {captures.length > 0 ? (
        <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, overflow: "hidden" }}>
          {[...captures].reverse().map((item, reversedIdx) => {
            const realIndex = captures.length - 1 - reversedIdx;
            const isLast = reversedIdx === captures.length - 1;
            return (
              <View
                key={realIndex}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  ...(!isLast ? { borderBottomWidth: 1, borderColor: theme.colors.border } : {}),
                }}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 15 }}>
                    {item.text}
                  </Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                    {formatTime(item.timestamp)}
                  </Text>
                </View>
                <Pressable onPress={() => handleDelete(realIndex)} hitSlop={10}>
                  <X size={15} color={theme.colors.textMuted} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Text style={{ fontSize: 15, color: theme.colors.surfaceHover }}>
            Your captured thoughts will appear here.
          </Text>
        </View>
      )}
    </View>
  );
}
