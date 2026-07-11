import { View, Pressable } from "react-native";
import { Text } from "@/components/shared/text";
import { useQuery } from "@tanstack/react-query";
import {
  getCalendarV1JournalCalendarGetOptions,
  getStreakV1JournalStreakGetOptions,
} from "@bessel/client";
import { Flame } from "lucide-react-native";
import { BottomSheet } from "@/components/shared/sheet";
import { client } from "@/lib/client";
import { useTheme } from "@/design-system";

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
  const theme = useTheme();
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
      <View>
        <Text style={{ textAlign: "center", color: theme.colors.text, fontFamily: "Inter-SemiBold", marginBottom: 20, fontSize: 17 }}>
          {formatMonth(initYear, initMonth)}
        </Text>

        <View style={{ flexDirection: "row", marginBottom: 8 }}>
          {WEEKDAYS.map((d) => (
            <View key={d} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: "Inter-Medium", fontSize: 12 }}>{d}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
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
                style={{ width: "14.28%", height: 44, alignItems: "center", justifyContent: "center" }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    backgroundColor: isSelected ? theme.colors.text : isTodayCell ? theme.colors.surfaceRaised : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily: isSelected ? "Inter-SemiBold" : undefined,
                      color: isSelected ? theme.colors.background : theme.colors.text,
                    }}
                  >
                    {day}
                  </Text>
                  {entry && !isSelected && (
                    <View style={{ position: "absolute", bottom: 2, flexDirection: "row", gap: 2 }}>
                      {entry.hasMorning && (
                        <View style={{ height: 6, width: 6, borderRadius: 9999, backgroundColor: theme.colors.statusYellow }} />
                      )}
                      {entry.hasAudit && (
                        <View style={{ height: 6, width: 6, borderRadius: 9999, backgroundColor: theme.colors.statusPurple }} />
                      )}
                      {!entry.hasMorning && !entry.hasAudit && (
                        <View style={{ height: 6, width: 6, borderRadius: 9999, backgroundColor: theme.colors.textMuted }} />
                      )}
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {streakData && (
          <View style={{ marginTop: 20, flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, alignItems: "center", borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, paddingVertical: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Flame size={16} color={theme.colors.warning} />
                <Text style={{ color: theme.colors.warning, fontFamily: "Inter-Bold", fontSize: 20 }}>
                  {streakData.current_streak}
                </Text>
              </View>
              <Text style={{ color: theme.colors.textMuted, marginTop: 2, fontSize: 12 }}>Current</Text>
            </View>
            <View style={{ flex: 1, alignItems: "center", borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, paddingVertical: 14 }}>
              <Text style={{ color: theme.colors.text, fontFamily: "Inter-Bold", fontSize: 20 }}>
                {streakData.longest_streak}
              </Text>
              <Text style={{ color: theme.colors.textMuted, marginTop: 2, fontSize: 12 }}>Longest</Text>
            </View>
            <View style={{ flex: 1, alignItems: "center", borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, paddingVertical: 14 }}>
              <Text style={{ color: theme.colors.text, fontFamily: "Inter-Bold", fontSize: 20 }}>
                {streakData.total_entries}
              </Text>
              <Text style={{ color: theme.colors.textMuted, marginTop: 2, fontSize: 12 }}>Entries</Text>
            </View>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
