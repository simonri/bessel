import { View, Text, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  getCalendarV1JournalCalendarGetOptions,
  getStreakV1JournalStreakGetOptions,
} from "@metron/client";
import { Flame } from "lucide-react-native";
import { BottomSheet } from "@/components/shared/sheet";
import { client } from "@/lib/client";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOffset(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

function formatMonth(year: number, month: number): string {
  return new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export function CalendarSheet({
  selectedDate,
  onSelectDate,
  onDismiss,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onDismiss: () => void;
}) {
  const initYear = selectedDate.getFullYear();
  const initMonth = selectedDate.getMonth();

  const { data: calendarData } = useQuery({
    ...getCalendarV1JournalCalendarGetOptions({
      client,
      query: { year: initYear, month: initMonth + 1 },
    }),
  });

  const { data: streakData } = useQuery({
    ...getStreakV1JournalStreakGetOptions({ client }),
  });

  const entryDays = new Map<number, { hasMorning: boolean; hasAudit: boolean }>();
  if (calendarData?.days) {
    for (const day of calendarData.days) {
      const d = new Date(String(day.entry_date));
      entryDays.set(d.getDate(), { hasMorning: day.has_morning, hasAudit: day.has_audit });
    }
  }

  const totalDays = daysInMonth(initYear, initMonth);
  const offset = firstDayOffset(initYear, initMonth);

  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <BottomSheet onDismiss={onDismiss}>
      <View className="pb-8">
        <Text className="text-center text-foreground font-semibold mb-5" style={{ fontSize: 17 }}>
          {formatMonth(initYear, initMonth)}
        </Text>

        <View className="flex-row mb-2">
          {WEEKDAYS.map((d) => (
            <View key={d} className="flex-1 items-center">
              <Text className="text-muted-foreground font-medium" style={{ fontSize: 12 }}>{d}</Text>
            </View>
          ))}
        </View>

        <View className="flex-row flex-wrap">
          {cells.map((day, i) => {
            if (day === null) {
              return <View key={`e-${i}`} style={{ width: "14.28%", height: 44 }} />;
            }

            const cellDate = new Date(initYear, initMonth, day);
            const isSelected = isSameDay(cellDate, selectedDate);
            const isTodayCell = isToday(cellDate);
            const entry = entryDays.get(day);

            return (
              <Pressable
                key={day}
                onPress={() => {
                  onSelectDate(cellDate);
                  onDismiss();
                }}
                style={{ width: "14.28%", height: 44 }}
                className="items-center justify-center"
              >
                <View
                  className={`w-9 h-9 items-center justify-center rounded-xl ${
                    isSelected ? "bg-foreground" : isTodayCell ? "bg-zinc-800" : ""
                  }`}
                >
                  <Text
                    className={isSelected ? "font-semibold text-background" : "text-foreground"}
                    style={{ fontSize: 15 }}
                  >
                    {day}
                  </Text>
                  {entry && !isSelected && (
                    <View className="absolute bottom-0.5 flex-row gap-0.5">
                      {entry.hasMorning && (
                        <View className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                      )}
                      {entry.hasAudit && (
                        <View className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                      )}
                      {!entry.hasMorning && !entry.hasAudit && (
                        <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#52525b" }} />
                      )}
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {streakData && (
          <View className="mt-5 flex-row gap-2">
            <View className="flex-1 items-center rounded-xl bg-zinc-800 py-3.5">
              <View className="flex-row items-center gap-1.5">
                <Flame size={16} color="#f97316" />
                <Text className="text-orange-500 font-bold" style={{ fontSize: 20 }}>
                  {streakData.current_streak}
                </Text>
              </View>
              <Text className="text-muted-foreground mt-0.5" style={{ fontSize: 12 }}>Current</Text>
            </View>
            <View className="flex-1 items-center rounded-xl bg-zinc-800 py-3.5">
              <Text className="text-foreground font-bold" style={{ fontSize: 20 }}>
                {streakData.longest_streak}
              </Text>
              <Text className="text-muted-foreground mt-0.5" style={{ fontSize: 12 }}>Longest</Text>
            </View>
            <View className="flex-1 items-center rounded-xl bg-zinc-800 py-3.5">
              <Text className="text-foreground font-bold" style={{ fontSize: 20 }}>
                {streakData.total_entries}
              </Text>
              <Text className="text-muted-foreground mt-0.5" style={{ fontSize: 12 }}>Entries</Text>
            </View>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
