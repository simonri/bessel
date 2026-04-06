import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JournalEntrySchema, JournalEntryUpsert } from "@metron/client";
import {
  getEntryV1JournalEntryDateGetOptions,
  getEntryV1JournalEntryDateGetQueryKey,
  getStreakV1JournalStreakGetOptions,
  getStreakV1JournalStreakGetQueryKey,
  upsertEntryV1JournalEntryDatePutMutation,
  deleteEntryV1JournalEntryDateDeleteMutation,
} from "@metron/client";
import { Flame, ChevronLeft, ChevronRight, Trash2 } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { client } from "@/lib/client";
import { schedulePriorityReminder } from "@/lib/notifications";
import { PhaseTabs, type Phase } from "@/components/journal/phase-tabs";
import { MorningPrime } from "@/components/journal/morning-prime";
import { Capture } from "@/components/journal/capture";
import { EveningAudit } from "@/components/journal/evening-audit";
import { DaySummary } from "@/components/journal/day-summary";
import { CalendarSheet } from "@/components/journal/calendar-sheet";

type CaptureItem = { text: string; timestamp: string };

function getDefaultPhase(): Phase {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 19) return "capture";
  return "audit";
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(d: Date): string {
  const today = new Date();
  if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()) {
    return "Today";
  }
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function JournalScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [phase, setPhase] = useState<Phase>(getDefaultPhase());
  const [showCalendar, setShowCalendar] = useState(false);

  const isToday = isSameDate(selectedDate, new Date());
  const dateKey = formatDateKey(selectedDate);
  const datePath = dateKey as unknown as Date;

  // Header: title row + date row + phase tabs (today) or just title + date (past)
  const headerHeight = isToday ? insets.top + 130 : insets.top + 90;

  // ---- Queries ----
  const { data: entry, isLoading: entryLoading } = useQuery({
    ...getEntryV1JournalEntryDateGetOptions({ client, path: { entry_date: datePath } }),
  });

  const { data: streakData } = useQuery({
    ...getStreakV1JournalStreakGetOptions({ client }),
  });

  // ---- Mutations ----
  const invalidateEntry = () => {
    void queryClient.invalidateQueries({ queryKey: getEntryV1JournalEntryDateGetQueryKey({ client, path: { entry_date: datePath } }) });
    void queryClient.invalidateQueries({ queryKey: getStreakV1JournalStreakGetQueryKey({ client }) });
  };

  const upsertMutation = useMutation({
    ...upsertEntryV1JournalEntryDatePutMutation({ client }),
    // Don't invalidate on auto-save — local state is source of truth while editing.
    // Only invalidate streak since it depends on whether an entry exists.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getStreakV1JournalStreakGetQueryKey({ client }) });
    },
  });

  const deleteMutation = useMutation({
    ...deleteEntryV1JournalEntryDateDeleteMutation({ client }),
    onSuccess: invalidateEntry,
  });

  // ---- Local form state ----
  const [priority, setPriority] = useState("");
  const [friction, setFriction] = useState("");
  const [gratitude1, setGratitude1] = useState("");
  const [gratitude2, setGratitude2] = useState("");
  const [gratitude3, setGratitude3] = useState("");
  const [morningCommitted, setMorningCommitted] = useState(false);
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [scorecard, setScorecard] = useState<number | null>(null);
  const [priorityDone, setPriorityDone] = useState<boolean | null>(null);
  const [insight, setInsight] = useState("");
  const [seed, setSeed] = useState("");

  // ---- Sync from server ----
  const syncedDateRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const changeCountRef = useRef(0);

  useEffect(() => {
    if (entryLoading) return;
    // Only sync from server when switching dates — never overwrite local edits
    // from a refetch on the same date
    if (syncedDateRef.current === dateKey) return;
    syncedDateRef.current = dateKey;
    isDirtyRef.current = false;
    changeCountRef.current = 0;
    const e = entry as JournalEntrySchema | null | undefined;
    setPriority(e?.priority ?? "");
    setFriction(e?.friction ?? "");
    setGratitude1(e?.gratitude_1 ?? "");
    setGratitude2(e?.gratitude_2 ?? "");
    setGratitude3(e?.gratitude_3 ?? "");
    setMorningCommitted(!!e?.morning_committed_at);
    setCaptures((e?.captures as CaptureItem[] | null | undefined) ?? []);
    setScorecard(e?.scorecard ?? null);
    setPriorityDone(e?.priority_done ?? null);
    setInsight(e?.insight ?? "");
    setSeed(e?.seed ?? "");
  }, [entry, entryLoading, dateKey]);

  useEffect(() => { changeCountRef.current = 0; }, [dateKey]);

  // ---- Auto-save ----
  const buildPayload = (): JournalEntryUpsert => ({
    priority: priority || null,
    friction: friction || null,
    gratitude_1: gratitude1 || null,
    gratitude_2: gratitude2 || null,
    gratitude_3: gratitude3 || null,
    morning_committed_at: morningCommitted ? (entry as any)?.morning_committed_at ?? new Date().toISOString() : null,
    captures: captures.length > 0 ? captures : null,
    scorecard: scorecard ?? null,
    priority_done: priorityDone ?? null,
    insight: insight || null,
    seed: seed || null,
  });

  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => {
    if (!isDirtyRef.current) return;
    isDirtyRef.current = false;
    upsertMutation.mutate({ client, path: { entry_date: datePath }, body: buildPayload() });
  };

  useEffect(() => {
    changeCountRef.current += 1;
    if (changeCountRef.current <= 1) return;
    isDirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveRef.current(), 1000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [priority, friction, gratitude1, gratitude2, gratitude3, scorecard, priorityDone, insight, seed]);

  // ---- Actions ----
  const handleCommitMorning = () => {
    setMorningCommitted(true);
    const payload = buildPayload();
    payload.morning_committed_at = new Date().toISOString() as any;
    upsertMutation.mutate({ client, path: { entry_date: datePath }, body: payload });
    if (priority.trim()) {
      schedulePriorityReminder(priority.trim());
    }
  };

  const handleAddCapture = (text: string) => {
    const newCaptures = [...captures, { text, timestamp: new Date().toISOString() }];
    setCaptures(newCaptures);
    const payload = buildPayload();
    payload.captures = newCaptures;
    upsertMutation.mutate({ client, path: { entry_date: datePath }, body: payload });
  };

  const handleDeleteCapture = (index: number) => {
    const newCaptures = captures.filter((_, i) => i !== index);
    setCaptures(newCaptures);
    const payload = buildPayload();
    payload.captures = newCaptures.length > 0 ? newCaptures : null;
    upsertMutation.mutate({ client, path: { entry_date: datePath }, body: payload });
  };

  const handleCloseDay = () => {
    isDirtyRef.current = false;
    upsertMutation.mutate({ client, path: { entry_date: datePath }, body: buildPayload() });
  };

  const handleDelete = () => {
    Alert.alert("Delete Entry", "Are you sure you want to delete this journal entry?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate({ client, path: { entry_date: datePath } }) },
    ]);
  };

  // ---- Navigation ----
  const goToPrevDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); };
  const goToNextDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); };
  const goToToday = () => { setSelectedDate(new Date()); setPhase(getDefaultPhase()); };

  const streakCount = streakData?.current_streak ?? 0;

  return (
    <View className="flex-1 bg-background">
      {entryLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#a1a1aa" />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
          >
            {isToday ? (
              <>
                {phase === "morning" && (
                  <MorningPrime
                    priority={priority}
                    friction={friction}
                    gratitude1={gratitude1}
                    gratitude2={gratitude2}
                    gratitude3={gratitude3}
                    isCommitted={morningCommitted}
                    isSaving={upsertMutation.isPending}
                    onChangePriority={setPriority}
                    onChangeFriction={setFriction}
                    onChangeGratitude1={setGratitude1}
                    onChangeGratitude2={setGratitude2}
                    onChangeGratitude3={setGratitude3}
                    onCommit={handleCommitMorning}
                  />
                )}
                {phase === "capture" && (
                  <Capture
                    priority={priority || null}
                    captures={captures}
                    onAddCapture={handleAddCapture}
                    onDeleteCapture={handleDeleteCapture}
                  />
                )}
                {phase === "audit" && (
                  <EveningAudit
                    priority={priority || null}
                    priorityDone={priorityDone}
                    scorecard={scorecard}
                    insight={insight}
                    seed={seed}
                    isSaving={upsertMutation.isPending}
                    onChangePriorityDone={setPriorityDone}
                    onChangeScorecard={setScorecard}
                    onChangeInsight={setInsight}
                    onChangeSeed={setSeed}
                    onClose={handleCloseDay}
                  />
                )}
              </>
            ) : (
              entry ? (
                <DaySummary entry={entry as JournalEntrySchema} />
              ) : (
                <View className="items-center py-16">
                  <Text style={{ fontSize: 15, color: "#3f3f46" }}>No entry for this day.</Text>
                </View>
              )
            )}

            {/* Save indicator (today only) */}
            {isToday && upsertMutation.isPending && (
              <View className="px-4 mt-4">
                <Text className="text-center text-muted-foreground" style={{ fontSize: 13 }}>Saving...</Text>
              </View>
            )}

            {/* Delete — past days only */}
            {!isToday && entry && (
              <View className="px-4 mt-5">
                <Pressable
                  onPress={handleDelete}
                  className="flex-row items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3.5"
                >
                  <Trash2 size={16} color="#ef4444" />
                  <Text className="font-medium text-red-500" style={{ fontSize: 15 }}>Delete entry</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Fixed header — solid bg + gradient fade */}
      <View pointerEvents="box-none" className="absolute top-0 left-0 right-0" style={{ height: headerHeight + 10 }}>
        <View pointerEvents="none" className="bg-background" style={{ height: headerHeight }} />
        <LinearGradient pointerEvents="none" colors={["#09090b", "transparent"]} style={{ height: 10 }} />
      </View>

      {/* Fixed header content */}
      <View className="absolute top-0 left-0 right-0" style={{ paddingTop: insets.top + 12 }}>
        {/* Row 1: Title + streak + today button */}
        <View className="px-4 flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-3xl font-bold text-foreground">Journal</Text>
            {streakCount > 0 && (
              <>
                <Flame size={16} color="#f97316" />
                <Text className="text-orange-500 font-semibold" style={{ fontSize: 15 }}>{streakCount}</Text>
              </>
            )}
          </View>
          {!isToday && (
            <Pressable onPress={goToToday} className="rounded-full bg-zinc-800 px-3.5 py-1.5">
              <Text className="text-foreground font-medium" style={{ fontSize: 14 }}>Today</Text>
            </Pressable>
          )}
        </View>

        {/* Row 2: Date nav — prev / date label / next */}
        <View className="flex-row items-center px-4 mb-3">
          <Pressable onPress={goToPrevDay} className="p-1" hitSlop={8}>
            <ChevronLeft size={20} color="#a1a1aa" />
          </Pressable>
          <Pressable onPress={() => setShowCalendar(true)} className="flex-1 items-center">
            <Text className="text-foreground font-semibold" style={{ fontSize: 16 }}>
              {formatDateLabel(selectedDate)}
            </Text>
          </Pressable>
          <Pressable onPress={goToNextDay} className="p-1" hitSlop={8}>
            <ChevronRight size={20} color="#a1a1aa" />
          </Pressable>
        </View>

        {/* Row 3: Phase tabs (today only) */}
        {isToday && <PhaseTabs active={phase} onChange={setPhase} />}
      </View>

      {showCalendar && (
        <CalendarSheet
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onDismiss={() => setShowCalendar(false)}
        />
      )}
    </View>
  );
}
