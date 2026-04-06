import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { Plus, X } from "lucide-react-native";
import { Input } from "@/components/shared/input";

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
    <View className="px-4 gap-4">
      {priority ? (
        <View className="rounded-xl bg-zinc-800 px-4 py-3.5">
          <Text className="text-zinc-500 mb-1" style={{ fontSize: 13 }}>
            Your priority today
          </Text>
          <Text className="text-foreground font-medium" style={{ fontSize: 16 }}>
            {priority}
          </Text>
        </View>
      ) : null}

      <View>
        <Text className="text-zinc-500 mb-2 px-1" style={{ fontSize: 13 }}>
          Quick-dump anything on your mind. Don't hold thoughts — capture them.
        </Text>
        <View className="rounded-xl bg-zinc-800 px-4 py-3 flex-row items-center gap-3">
          <View className="flex-1">
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
            className={`w-9 h-9 items-center justify-center rounded-full ${
              input.trim() ? "bg-foreground" : "bg-zinc-700"
            }`}
          >
            <Plus size={18} color={input.trim() ? "#09090b" : "#71717a"} />
          </Pressable>
        </View>
      </View>

      {captures.length > 0 ? (
        <View className="rounded-xl bg-zinc-800 overflow-hidden">
          {[...captures].reverse().map((item, reversedIdx) => {
            const realIndex = captures.length - 1 - reversedIdx;
            const isLast = reversedIdx === captures.length - 1;
            return (
              <View
                key={realIndex}
                className={`flex-row items-center px-4 py-3 ${!isLast ? "border-b border-zinc-700" : ""}`}
              >
                <View className="flex-1 mr-3">
                  <Text className="text-foreground" style={{ fontSize: 15 }}>
                    {item.text}
                  </Text>
                  <Text className="text-zinc-600" style={{ fontSize: 12 }}>
                    {formatTime(item.timestamp)}
                  </Text>
                </View>
                <Pressable onPress={() => handleDelete(realIndex)} hitSlop={10}>
                  <X size={15} color="#52525b" />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <View className="items-center py-12">
          <Text style={{ fontSize: 15, color: "#3f3f46" }}>
            Your captured thoughts will appear here.
          </Text>
        </View>
      )}
    </View>
  );
}
