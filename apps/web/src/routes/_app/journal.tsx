import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  getDaysInMonth,
  getDay,
  isSameDay,
  isToday,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  BookOpen,
  Plus,
  Trash2,
  Sparkles,
  Moon,
  Zap,
  Target,
  Brain,
  Trophy,
  AlertTriangle,
  Lightbulb,
  Heart,
  ArrowRight,
} from "lucide-react";
import type { JournalEntrySchema, JournalEntryUpsert } from "@metron/client";
import {
  getEntryV1JournalEntryDateGetOptions,
  getEntryV1JournalEntryDateGetQueryKey,
  getCalendarV1JournalCalendarGetOptions,
  getStreakV1JournalStreakGetOptions,
  getStreakV1JournalStreakGetQueryKey,
  upsertEntryV1JournalEntryDatePutMutation,
  deleteEntryV1JournalEntryDateDeleteMutation,
} from "@metron/client";
import { Button } from "@metron/ui/components/button";
import { TagInput } from "@/components/tag-input";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/journal")({
  component: Journal,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOOD_LABELS = ["", "Rough", "Low", "Okay", "Good", "Great"];
const ENERGY_LABELS = ["", "Drained", "Low", "Moderate", "High", "Wired"];
const FOCUS_LABELS = ["", "Scattered", "Distracted", "Decent", "Sharp", "Flow"];

const MOOD_COLORS = [
  "",
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
];

function formatDateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

// ---------------------------------------------------------------------------
// Metric Picker (1-5 scale)
// ---------------------------------------------------------------------------

function MetricPicker({
  icon: Icon,
  label,
  value,
  onChange,
  labels,
}: {
  icon: React.ElementType;
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  labels: string[];
}) {
  const current = value ?? 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        <span>{label}</span>
        {current > 0 && (
          <span className="ml-auto text-foreground font-medium">{labels[current]}</span>
        )}
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`h-7 flex-1 rounded-md text-xs font-medium transition-colors ${
              current === n
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            onClick={() => onChange(current === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sleep Input
// ---------------------------------------------------------------------------

function SleepInput({
  value,
  onChange,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Moon className="size-3.5" />
        <span>Sleep</span>
        {value != null && <span className="ml-auto text-foreground font-medium">{value}h</span>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={12}
          step={0.5}
          value={value ?? 0}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange(v === 0 ? null : v);
          }}
          className="flex-1 h-1.5 appearance-none rounded-full bg-muted accent-primary cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
        />
        <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
          {value ?? 0}h
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text Section (wins, blockers, learnings, gratitude, intention)
// ---------------------------------------------------------------------------

function TextSection({
  icon: Icon,
  label,
  placeholder,
  value,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision Log
// ---------------------------------------------------------------------------

type Decision = {
  [key: string]: unknown;
  decision: string;
  reasoning: string;
};

function DecisionLog({
  decisions,
  onChange,
}: {
  decisions: Decision[];
  onChange: (d: Decision[]) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newDecision, setNewDecision] = useState("");
  const [newReasoning, setNewReasoning] = useState("");

  const handleAdd = () => {
    if (!newDecision.trim()) return;
    onChange([...decisions, { decision: newDecision.trim(), reasoning: newReasoning.trim() }]);
    setNewDecision("");
    setNewReasoning("");
    setIsAdding(false);
  };

  const handleRemove = (index: number) => {
    onChange(decisions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Brain className="size-3.5" />
          <span>Decisions</span>
          {decisions.length > 0 && (
            <span className="bg-muted rounded-full px-1.5 text-[10px] tabular-nums">
              {decisions.length}
            </span>
          )}
        </div>
        {!isAdding && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="size-3" />
            Add
          </button>
        )}
      </div>

      {decisions.map((d, i) => (
        <div key={i} className="rounded-md border bg-muted/30 p-2.5 space-y-1 group">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug">{d.decision}</p>
            <button
              type="button"
              className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0 opacity-0 group-hover:opacity-100"
              onClick={() => handleRemove(i)}
            >
              <Trash2 className="size-3" />
            </button>
          </div>
          {d.reasoning && (
            <p className="text-xs text-muted-foreground leading-relaxed">{d.reasoning}</p>
          )}
        </div>
      ))}

      {isAdding && (
        <div className="rounded-md border p-2.5 space-y-2">
          <input
            type="text"
            value={newDecision}
            onChange={(e) => setNewDecision(e.target.value)}
            placeholder="What did you decide?"
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAdd();
              }
              if (e.key === "Escape") setIsAdding(false);
            }}
          />
          <input
            type="text"
            value={newReasoning}
            onChange={(e) => setNewReasoning(e.target.value)}
            placeholder="Why? (reasoning)"
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAdd();
              }
              if (e.key === "Escape") setIsAdding(false);
            }}
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 text-xs" onClick={handleAdd}>
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setIsAdding(false);
                setNewDecision("");
                setNewReasoning("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini Calendar
// ---------------------------------------------------------------------------

function MiniCalendar({
  selectedDate,
  onSelectDate,
  calendarMonth,
  onChangeMonth,
  entryDays,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  calendarMonth: Date;
  onChangeMonth: (d: Date) => void;
  entryDays: Map<number, { mood: number | null }>;
}) {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const daysInMonth = getDaysInMonth(calendarMonth);
  const firstDayOfWeek = (getDay(startOfMonth(calendarMonth)) + 6) % 7; // Monday = 0

  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = Array(firstDayOfWeek).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    currentWeek.push(d);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          onClick={() => onChangeMonth(subMonths(calendarMonth, 1))}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium">{format(calendarMonth, "MMMM yyyy")}</span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          onClick={() => onChangeMonth(addMonths(calendarMonth, 1))}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px text-center">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d} className="text-[10px] text-muted-foreground font-medium py-1">
            {d}
          </div>
        ))}

        {weeks.flat().map((day, i) => {
          if (day === null) {
            return <div key={`e-${i}`} />;
          }

          const cellDate = new Date(year, month, day);
          const isSelected = isSameDay(cellDate, selectedDate);
          const today = isToday(cellDate);
          const entry = entryDays.get(day);
          const hasMood = entry && entry.mood != null;
          const moodColor = hasMood ? MOOD_COLORS[entry.mood!] : "";

          return (
            <button
              key={day}
              type="button"
              className={`relative flex items-center justify-center size-8 rounded-md text-xs transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground font-medium"
                  : today
                    ? "bg-accent font-medium"
                    : "hover:bg-accent"
              }`}
              onClick={() => onSelectDate(cellDate)}
            >
              {day}
              {entry && !isSelected && (
                <span
                  className={`absolute bottom-0.5 size-1.5 rounded-full ${
                    hasMood ? moodColor : "bg-muted-foreground/40"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Journal Page
// ---------------------------------------------------------------------------

function Journal() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()));
  const queryClient = useQueryClient();

  const dateKey = formatDateKey(selectedDate);
  // The API expects a plain date string (yyyy-MM-dd), not a JS Date which serializes with timezone offset.
  const datePath = dateKey as unknown as Date;

  // Fetch entry for selected date
  const { data: entry, isLoading: entryLoading } = useQuery({
    ...getEntryV1JournalEntryDateGetOptions({
      client,
      path: { entry_date: datePath },
    }),
  });

  // Fetch calendar data for current month
  const { data: calendarData } = useQuery({
    ...getCalendarV1JournalCalendarGetOptions({
      client,
      query: {
        year: calendarMonth.getFullYear(),
        month: calendarMonth.getMonth() + 1,
      },
    }),
  });

  // Fetch streak
  const { data: streakData } = useQuery({
    ...getStreakV1JournalStreakGetOptions({ client }),
  });

  // Build entry days map for calendar
  const entryDays = new Map<number, { mood: number | null }>();
  if (calendarData?.days) {
    for (const day of calendarData.days) {
      const d = new Date(String(day.entry_date));
      entryDays.set(d.getDate(), { mood: day.mood ?? null });
    }
  }

  // Upsert mutation
  const upsertMutation = useMutation({
    ...upsertEntryV1JournalEntryDatePutMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: getEntryV1JournalEntryDateGetQueryKey({
          client,
          path: { entry_date: datePath },
        }),
      });
      void queryClient.invalidateQueries({
        queryKey: getStreakV1JournalStreakGetQueryKey({ client }),
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    ...deleteEntryV1JournalEntryDateDeleteMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: getEntryV1JournalEntryDateGetQueryKey({
          client,
          path: { entry_date: datePath },
        }),
      });
      void queryClient.invalidateQueries({
        queryKey: getStreakV1JournalStreakGetQueryKey({ client }),
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Local form state, synced from entry
  // ---------------------------------------------------------------------------

  const [body, setBody] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [wins, setWins] = useState("");
  const [blockers, setBlockers] = useState("");
  const [learnings, setLearnings] = useState("");
  const [gratitude, setGratitude] = useState("");
  const [intention, setIntention] = useState("");
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // Track which date we last synced from to avoid overwriting user edits
  const syncedDateRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  // Sync entry data into local state when entry or date changes
  useEffect(() => {
    if (syncedDateRef.current === dateKey && !entryLoading) return;
    if (entryLoading) return;

    syncedDateRef.current = dateKey;
    isDirtyRef.current = false;

    const e = entry as JournalEntrySchema | null | undefined;
    setBody(e?.body ?? "");
    setMood(e?.mood ?? null);
    setEnergy(e?.energy ?? null);
    setFocus(e?.focus ?? null);
    setSleepHours(e?.sleep_hours ?? null);
    setWins(e?.wins ?? "");
    setBlockers(e?.blockers ?? "");
    setLearnings(e?.learnings ?? "");
    setGratitude(e?.gratitude ?? "");
    setIntention(e?.intention ?? "");
    setDecisions((e?.decisions as Decision[] | null | undefined) ?? []);
    setTags(e?.tags ?? []);
  }, [entry, entryLoading, dateKey]);

  // ---------------------------------------------------------------------------
  // Auto-save with debounce - only saves when dirty
  // ---------------------------------------------------------------------------

  // Use a ref for the save function to avoid re-triggering the debounce effect
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => {
    if (!isDirtyRef.current) return;

    const hasContent =
      body.trim() ||
      mood != null ||
      energy != null ||
      focus != null ||
      sleepHours != null ||
      wins.trim() ||
      blockers.trim() ||
      learnings.trim() ||
      gratitude.trim() ||
      intention.trim() ||
      decisions.length > 0 ||
      tags.length > 0;

    if (!hasContent) return;

    isDirtyRef.current = false;

    const payload: JournalEntryUpsert = {
      body: body || null,
      mood: mood ?? null,
      energy: energy ?? null,
      focus: focus ?? null,
      sleep_hours: sleepHours ?? null,
      wins: wins || null,
      blockers: blockers || null,
      learnings: learnings || null,
      gratitude: gratitude || null,
      intention: intention || null,
      decisions: decisions.length > 0 ? decisions : null,
      tags: tags.length > 0 ? tags : null,
    };

    upsertMutation.mutate({
      client,
      path: { entry_date: datePath },
      body: payload,
    });
  };

  // Mark dirty and schedule save when any field changes (skip the initial sync)
  const changeCountRef = useRef(0);
  useEffect(() => {
    // Skip the first render (initial sync from server)
    changeCountRef.current += 1;
    if (changeCountRef.current <= 1) return;

    isDirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveRef.current(), 1000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    body,
    mood,
    energy,
    focus,
    sleepHours,
    wins,
    blockers,
    learnings,
    gratitude,
    intention,
    decisions,
    tags,
  ]);

  // Reset change counter when date changes so sync doesn't trigger save
  useEffect(() => {
    changeCountRef.current = 0;
  }, [dateKey]);

  // ---------------------------------------------------------------------------
  // Date navigation
  // ---------------------------------------------------------------------------

  const goToPrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
    if (
      prev.getMonth() !== calendarMonth.getMonth() ||
      prev.getFullYear() !== calendarMonth.getFullYear()
    ) {
      setCalendarMonth(startOfMonth(prev));
    }
  };

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
    if (
      next.getMonth() !== calendarMonth.getMonth() ||
      next.getFullYear() !== calendarMonth.getFullYear()
    ) {
      setCalendarMonth(startOfMonth(next));
    }
  };

  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setCalendarMonth(startOfMonth(today));
  };

  const handleSelectDate = (d: Date) => {
    setSelectedDate(d);
  };

  const handleChangeMonth = (d: Date) => {
    setCalendarMonth(d);
  };

  const handleDelete = () => {
    deleteMutation.mutate({
      client,
      path: { entry_date: datePath },
    });
  };

  const isTodaySelected = isToday(selectedDate);
  const todayLabel = isTodaySelected ? "Today" : format(selectedDate, "EEEE, MMM d, yyyy");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Journal</h2>
          {streakData && streakData.current_streak > 0 && (
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1 text-sm text-orange-500">
                <Flame className="size-4" />
                {streakData.current_streak} day streak
              </span>
              <span className="text-xs text-muted-foreground">
                {streakData.total_entries} total entries
              </span>
            </div>
          )}
        </div>
        {!isTodaySelected && (
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
        )}
      </div>

      {/* Main layout: sidebar + editor */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Left sidebar: calendar + stats */}
        <div className="w-full md:w-[260px] shrink-0 space-y-4">
          <div className="rounded-lg border bg-card p-3">
            <MiniCalendar
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              calendarMonth={calendarMonth}
              onChangeMonth={handleChangeMonth}
              entryDays={entryDays}
            />
          </div>

          {/* Streak stats */}
          {streakData && (
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <div className="text-xs text-muted-foreground font-medium">Stats</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center p-2 rounded-md bg-muted/50">
                  <div className="text-lg font-bold text-orange-500 tabular-nums">
                    {streakData.current_streak}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Current Streak</div>
                </div>
                <div className="text-center p-2 rounded-md bg-muted/50">
                  <div className="text-lg font-bold tabular-nums">{streakData.longest_streak}</div>
                  <div className="text-[10px] text-muted-foreground">Longest Streak</div>
                </div>
              </div>
              <div className="text-center p-2 rounded-md bg-muted/50">
                <div className="text-lg font-bold tabular-nums">{streakData.total_entries}</div>
                <div className="text-[10px] text-muted-foreground">Total Entries</div>
              </div>
            </div>
          )}
        </div>

        {/* Right: entry editor */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Date nav */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              onClick={goToPrevDay}
            >
              <ChevronLeft className="size-5" />
            </button>
            <h3 className="text-lg font-semibold">{todayLabel}</h3>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              onClick={goToNextDay}
            >
              <ChevronRight className="size-5" />
            </button>

            <div className="ml-auto flex items-center gap-2">
              {upsertMutation.isPending && (
                <span className="text-xs text-muted-foreground">Saving...</span>
              )}
              {!upsertMutation.isPending && entry && (
                <span className="text-xs text-muted-foreground/50">Saved</span>
              )}
              {entry && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Delete entry"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </div>

          {entryLoading ? (
            <div className="text-muted-foreground flex h-32 items-center justify-center">
              Loading...
            </div>
          ) : (
            <div className="space-y-5">
              {/* Metrics row */}
              <div className="rounded-lg border bg-card p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricPicker
                    icon={Sparkles}
                    label="Mood"
                    value={mood}
                    onChange={setMood}
                    labels={MOOD_LABELS}
                  />
                  <MetricPicker
                    icon={Zap}
                    label="Energy"
                    value={energy}
                    onChange={setEnergy}
                    labels={ENERGY_LABELS}
                  />
                  <MetricPicker
                    icon={Target}
                    label="Focus"
                    value={focus}
                    onChange={setFocus}
                    labels={FOCUS_LABELS}
                  />
                  <SleepInput value={sleepHours} onChange={setSleepHours} />
                </div>
              </div>

              {/* Free-form body */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <BookOpen className="size-3.5" />
                  <span>Journal</span>
                  {body && (
                    <span className="ml-auto tabular-nums">
                      {body.split(/\s+/).filter(Boolean).length} words
                    </span>
                  )}
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="What's on your mind today? Write freely..."
                  rows={6}
                  className="w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none leading-relaxed"
                />
              </div>

              {/* Structured reflection */}
              <div className="rounded-lg border bg-card p-4 space-y-4">
                <TextSection
                  icon={Trophy}
                  label="Wins"
                  placeholder="What went well today?"
                  value={wins}
                  onChange={setWins}
                />
                <TextSection
                  icon={AlertTriangle}
                  label="Blockers"
                  placeholder="What held you back?"
                  value={blockers}
                  onChange={setBlockers}
                />
                <TextSection
                  icon={Lightbulb}
                  label="Learnings"
                  placeholder="What did you learn?"
                  value={learnings}
                  onChange={setLearnings}
                />
                <TextSection
                  icon={Heart}
                  label="Gratitude"
                  placeholder="What are you grateful for?"
                  value={gratitude}
                  onChange={setGratitude}
                />
                <TextSection
                  icon={ArrowRight}
                  label="Intention for Tomorrow"
                  placeholder="What's the #1 thing to focus on?"
                  value={intention}
                  onChange={setIntention}
                />
              </div>

              {/* Decisions */}
              <div className="rounded-lg border bg-card p-4">
                <DecisionLog decisions={decisions} onChange={setDecisions} />
              </div>

              {/* Tags */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <span>Tags</span>
                </div>
                <TagInput tags={tags} onChange={setTags} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
