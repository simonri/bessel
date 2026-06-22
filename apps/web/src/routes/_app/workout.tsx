import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus,
  Search,
  Trash2,
  Dumbbell,
  Trophy,
  ChevronDown,
  ChevronRight,
  Clock,
  X,
  Check,
  Loader2,
} from "lucide-react";
import type {
  ExerciseSchema,
  WorkoutLogSchema,
  WorkoutLogDetailSchema,
  WorkoutSetSchema,
  MuscleCategory,
} from "@metron/client";
import {
  listExercisesV1WorkoutsExercisesGetOptions,
  listRecentExercisesV1WorkoutsExercisesRecentGetOptions,
  listWorkoutsV1WorkoutsGetOptions,
  listWorkoutsV1WorkoutsGetQueryKey,
  getWorkoutV1WorkoutsWorkoutIdGetOptions,
  getWorkoutV1WorkoutsWorkoutIdGetQueryKey,
  createWorkoutV1WorkoutsPostMutation,
  updateWorkoutV1WorkoutsWorkoutIdPatchMutation,
  deleteWorkoutV1WorkoutsWorkoutIdDeleteMutation,
  createWorkoutSetV1WorkoutsWorkoutIdSetsPostMutation,
  updateWorkoutSetV1WorkoutsWorkoutIdSetsSetIdPatchMutation,
  deleteWorkoutSetV1WorkoutsWorkoutIdSetsSetIdDeleteMutation,
  getExercisePrsV1WorkoutsExercisesExerciseIdPrsGetOptions,
} from "@metron/client";
import { Button } from "@metron/ui/components/button";
import { Input } from "@metron/ui/components/input";
import { Badge } from "@metron/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@metron/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@metron/ui/components/tabs";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@metron/ui/components/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metron/ui/components/alert-dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@metron/ui/components/empty";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/workout")({
  component: Workout,
});

// --- Helpers ---

const CATEGORY_LABELS: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  core: "Core",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  cardio: "Cardio",
  olympic: "Olympic",
  other: "Other",
};

function useTimer(startedAt: string | null) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => {
      const diff = Math.floor((Date.now() - start) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(
        h > 0
          ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
          : `${m}:${String(s).padStart(2, "0")}`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// --- Main Component ---

export function Workout() {
  const [activeTab, setActiveTab] = useState("log");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-2xl font-bold tracking-tight">Workout</h2>
          <TabsList className="w-fit">
            <TabsTrigger value="log">Log</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="prs">PRs</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="log" className="min-h-0 flex-1 overflow-y-auto">
          <WorkoutSession />
        </TabsContent>
        <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto">
          <WorkoutHistory />
        </TabsContent>
        <TabsContent value="prs" className="min-h-0 flex-1 overflow-y-auto">
          <PRDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Workout Session (Log Tab) ---

function WorkoutSession() {
  const queryClient = useQueryClient();
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [exerciseDrawerOpen, setExerciseDrawerOpen] = useState(false);

  const { data: workoutDetail } = useQuery({
    ...getWorkoutV1WorkoutsWorkoutIdGetOptions({
      client,
      path: { workout_id: activeWorkoutId! },
    }),
    enabled: !!activeWorkoutId,
    refetchInterval: false,
  });

  const createWorkout = useMutation({
    ...createWorkoutV1WorkoutsPostMutation({ client }),
    onSuccess: (data) => {
      setActiveWorkoutId(data.id);
      void queryClient.invalidateQueries({
        queryKey: listWorkoutsV1WorkoutsGetQueryKey({ client }),
      });
    },
  });

  const finishWorkout = useMutation({
    ...updateWorkoutV1WorkoutsWorkoutIdPatchMutation({ client }),
    onSuccess: () => {
      setActiveWorkoutId(null);
      void queryClient.invalidateQueries({
        queryKey: listWorkoutsV1WorkoutsGetQueryKey({ client }),
      });
    },
  });

  const deleteWorkout = useMutation({
    ...deleteWorkoutV1WorkoutsWorkoutIdDeleteMutation({ client }),
    onSuccess: () => {
      setActiveWorkoutId(null);
      void queryClient.invalidateQueries({
        queryKey: listWorkoutsV1WorkoutsGetQueryKey({ client }),
      });
    },
  });

  const addSet = useMutation({
    ...createWorkoutSetV1WorkoutsWorkoutIdSetsPostMutation({ client }),
    onSuccess: () => {
      if (activeWorkoutId) {
        void queryClient.invalidateQueries({
          queryKey: getWorkoutV1WorkoutsWorkoutIdGetQueryKey({
            client,
            path: { workout_id: activeWorkoutId },
          }),
        });
      }
    },
  });

  const deleteSet = useMutation({
    ...deleteWorkoutSetV1WorkoutsWorkoutIdSetsSetIdDeleteMutation({ client }),
    onSuccess: () => {
      if (activeWorkoutId) {
        void queryClient.invalidateQueries({
          queryKey: getWorkoutV1WorkoutsWorkoutIdGetQueryKey({
            client,
            path: { workout_id: activeWorkoutId },
          }),
        });
      }
    },
  });

  const startedAtStr =
    activeWorkoutId && workoutDetail
      ? typeof workoutDetail.started_at === "string"
        ? workoutDetail.started_at
        : workoutDetail.started_at.toISOString()
      : null;
  const elapsed = useTimer(startedAtStr);

  const handleStartWorkout = () => {
    createWorkout.mutate({
      client,
      body: { started_at: new Date() },
    });
  };

  const handleFinishWorkout = () => {
    if (!activeWorkoutId) return;
    finishWorkout.mutate({
      client,
      path: { workout_id: activeWorkoutId },
      body: { completed_at: new Date() },
    });
  };

  const handleAddExercise = (exercise: ExerciseSchema) => {
    if (!activeWorkoutId) return;
    setExerciseDrawerOpen(false);

    const exerciseSets = workoutDetail?.sets?.filter((s) => s.exercise_id === exercise.id);
    const lastSet = exerciseSets?.length ? exerciseSets[exerciseSets.length - 1] : null;

    addSet.mutate({
      client,
      path: { workout_id: activeWorkoutId },
      body: {
        exercise_id: exercise.id,
        set_number: (exerciseSets?.length ?? 0) + 1,
        reps: lastSet?.reps ?? 0,
        weight: lastSet?.weight ?? 0,
        weight_unit: "kg",
      },
    });
  };

  if (!activeWorkoutId) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <Dumbbell className="size-10" />
            </EmptyMedia>
            <EmptyTitle>Ready to train?</EmptyTitle>
            <EmptyDescription>
              Start a workout to begin logging exercises and sets.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        <Button
          size="lg"
          className="mt-6"
          onClick={handleStartWorkout}
          disabled={createWorkout.isPending}
        >
          <Dumbbell className="size-4" />
          Start Workout
        </Button>
      </div>
    );
  }

  // Group sets by exercise
  const exerciseGroups = groupSetsByExercise(workoutDetail?.sets ?? []);

  return (
    <div className="space-y-4 pb-24">
      {/* Active workout header */}
      <Card className="py-4">
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {format(new Date(workoutDetail?.started_at ?? new Date()), "EEEE, MMM d")}
            </p>
            <p className="text-2xl font-bold tabular-nums">{elapsed}</p>
          </div>
          <div className="flex gap-2">
            <CancelWorkoutButton
              onConfirm={() =>
                deleteWorkout.mutate({
                  client,
                  path: { workout_id: activeWorkoutId },
                })
              }
            />
            <Button onClick={handleFinishWorkout} disabled={finishWorkout.isPending}>
              <Check className="size-4" />
              Finish
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Exercise groups */}
      {exerciseGroups.map((group) => (
        <ExerciseGroup
          key={group.exerciseId}
          group={group}
          workoutId={activeWorkoutId}
          onAddSet={() => {
            const lastSet = group.sets[group.sets.length - 1];
            addSet.mutate({
              client,
              path: { workout_id: activeWorkoutId },
              body: {
                exercise_id: group.exerciseId,
                set_number: group.sets.length + 1,
                reps: lastSet?.reps ?? 0,
                weight: lastSet?.weight ?? 0,
                weight_unit: "kg",
              },
            });
          }}
          onDeleteSet={(setId) => {
            deleteSet.mutate({
              client,
              path: { workout_id: activeWorkoutId, set_id: setId },
            });
          }}
        />
      ))}

      {/* Add exercise button */}
      <Button
        variant="outline"
        className="w-full border-dashed"
        onClick={() => setExerciseDrawerOpen(true)}
      >
        <Plus className="size-4" />
        Add Exercise
      </Button>

      {/* Exercise search drawer */}
      <ExerciseSearchDrawer
        open={exerciseDrawerOpen}
        onOpenChange={setExerciseDrawerOpen}
        onSelect={handleAddExercise}
      />
    </div>
  );
}

// --- Exercise Group ---

interface ExerciseGroupData {
  exerciseId: string;
  sets: WorkoutSetSchema[];
}

function groupSetsByExercise(sets: WorkoutSetSchema[]): ExerciseGroupData[] {
  const map = new Map<string, WorkoutSetSchema[]>();

  for (const set of sets) {
    if (!map.has(set.exercise_id)) {
      map.set(set.exercise_id, []);
    }
    map.get(set.exercise_id)!.push(set);
  }

  const groups: ExerciseGroupData[] = [];
  for (const [exerciseId, groupSets] of map) {
    groups.push({
      exerciseId,
      sets: groupSets.sort((a, b) => a.set_number - b.set_number),
    });
  }
  return groups;
}

function ExerciseGroup({
  group,
  workoutId,
  onAddSet,
  onDeleteSet,
}: {
  group: ExerciseGroupData;
  workoutId: string;
  onAddSet: () => void;
  onDeleteSet: (setId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const queryClient = useQueryClient();

  const { data: exerciseSearch } = useQuery({
    ...listExercisesV1WorkoutsExercisesGetOptions({
      client,
      query: { limit: 100, page: 1 },
    }),
    staleTime: Infinity,
  });

  const exerciseName = useMemo(() => {
    const ex = exerciseSearch?.items?.find((e) => e.id === group.exerciseId);
    return ex?.name ?? "Exercise";
  }, [exerciseSearch, group.exerciseId]);

  const updateSet = useMutation({
    ...updateWorkoutSetV1WorkoutsWorkoutIdSetsSetIdPatchMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: getWorkoutV1WorkoutsWorkoutIdGetQueryKey({
          client,
          path: { workout_id: workoutId },
        }),
      });
    },
  });

  return (
    <Card className="py-0 gap-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <span className="font-semibold">{exerciseName}</span>
          <Badge variant="secondary">
            {group.sets.length} {group.sets.length === 1 ? "set" : "sets"}
          </Badge>
        </div>
      </button>

      {expanded && (
        <CardContent className="border-t pt-3 pb-3">
          {/* Set header */}
          <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 py-2 text-xs font-medium text-muted-foreground">
            <span>Set</span>
            <span>Weight</span>
            <span>Reps</span>
            <span />
          </div>

          {/* Sets */}
          {group.sets.map((set) => (
            <SetRow
              key={set.id}
              set={set}
              onUpdate={(data) =>
                updateSet.mutate({
                  client,
                  path: { workout_id: workoutId, set_id: set.id },
                  body: data,
                })
              }
              onDelete={() => onDeleteSet(set.id)}
            />
          ))}

          {/* Add set */}
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={onAddSet}>
            <Plus className="size-3" />
            Add Set
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

// --- Set Row ---

function SetRow({
  set,
  onUpdate,
  onDelete,
}: {
  set: WorkoutSetSchema;
  onUpdate: (data: { weight?: number; reps?: number }) => void;
  onDelete: () => void;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (field: string, value: number) => {
    setEditingField(field);
    setEditValue(value.toString());
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    if (!editingField) return;
    const num = parseFloat(editValue);
    if (!isNaN(num)) {
      onUpdate({ [editingField]: num });
    }
    setEditingField(null);
  };

  return (
    <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 items-center py-1.5">
      <span className="text-xs font-medium text-muted-foreground text-center">
        {set.set_number}
      </span>

      {/* Weight */}
      {editingField === "weight" ? (
        <Input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => e.key === "Enter" && commitEdit()}
          className="h-8 text-sm tabular-nums"
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={() => startEdit("weight", set.weight)}
          className="h-8 rounded-md bg-muted px-2 text-left text-sm tabular-nums hover:bg-muted/80 transition-colors"
        >
          {set.weight} kg
        </button>
      )}

      {/* Reps */}
      {editingField === "reps" ? (
        <Input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => e.key === "Enter" && commitEdit()}
          className="h-8 text-sm tabular-nums"
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={() => startEdit("reps", set.reps)}
          className="h-8 rounded-md bg-muted px-2 text-left text-sm tabular-nums hover:bg-muted/80 transition-colors"
        >
          {set.reps}
        </button>
      )}

      {/* Delete */}
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        <X className="size-3.5" />
      </Button>

      {/* PR badge */}
      {set.is_pr && (
        <div className="col-span-4 flex items-center gap-1 pl-8">
          <Badge variant="outline" className="text-amber-500 border-amber-500/30 gap-1">
            <Trophy className="size-3" />
            Personal Record
          </Badge>
        </div>
      )}
    </div>
  );
}

// --- Exercise Search Drawer ---

function ExerciseSearchDrawer({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (exercise: ExerciseSchema) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  const { data: recentExercises } = useQuery({
    ...listRecentExercisesV1WorkoutsExercisesRecentGetOptions({
      client,
      query: { limit: 10 },
    }),
    enabled: open,
  });

  const { data: exerciseList, isFetching } = useQuery({
    ...listExercisesV1WorkoutsExercisesGetOptions({
      client,
      query: {
        limit: 200,
        page: 1,
        q: debouncedQuery || undefined,
        category: (selectedCategory as MuscleCategory) || undefined,
      },
    }),
    enabled: open,
    placeholderData: (prev) => prev,
  });

  // Reset state when drawer opens
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedCategory(null);
      setHighlightedIndex(-1);
      setSelectedId(null);
    }
  }, [open]);

  // Focus search input after drawer animation settles
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Build flat list for keyboard navigation
  const recentIds = useMemo(() => {
    return new Set((recentExercises ?? []).map((e) => e.id));
  }, [recentExercises]);

  const exercises = exerciseList?.items ?? [];

  const flatList = useMemo(() => {
    const showRecent =
      !debouncedQuery && !selectedCategory && recentExercises && recentExercises.length > 0;

    // Deduplicate: if an exercise is in recent, don't show it again in the main list
    const mainExercises = showRecent ? exercises.filter((ex) => !recentIds.has(ex.id)) : exercises;

    const items: ExerciseSchema[] = [];
    if (showRecent) {
      items.push(...recentExercises);
    }
    items.push(...mainExercises);
    return items;
  }, [exercises, recentExercises, recentIds, debouncedQuery, selectedCategory]);

  // Group for display (only when not searching)
  const grouped = useMemo(() => {
    if (debouncedQuery) return null;
    const mainExercises =
      !selectedCategory && recentExercises?.length
        ? exercises.filter((ex) => !recentIds.has(ex.id))
        : exercises;
    const map = new Map<string, ExerciseSchema[]>();
    for (const ex of mainExercises) {
      const cat = ex.category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(ex);
    }
    return map;
  }, [exercises, recentIds, recentExercises, debouncedQuery, selectedCategory]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [debouncedQuery, selectedCategory]);

  const handleSelect = useCallback(
    (exercise: ExerciseSchema) => {
      setSelectedId(exercise.id);
      // Brief highlight before closing
      setTimeout(() => {
        onSelect(exercise);
        setSelectedId(null);
      }, 120);
    },
    [onSelect],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && highlightedIndex >= 0 && highlightedIndex < flatList.length) {
        e.preventDefault();
        handleSelect(flatList[highlightedIndex]);
      } else if (e.key === "Escape") {
        if (searchQuery) {
          e.preventDefault();
          setSearchQuery("");
        }
      }
    },
    [flatList, highlightedIndex, handleSelect, searchQuery],
  );

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0) return;
    const el = listRef.current?.querySelector(`[data-index="${highlightedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const showRecent =
    !debouncedQuery && !selectedCategory && recentExercises && recentExercises.length > 0;
  const resultCount = exercises.length;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] flex flex-col">
        <DrawerHeader className="pb-2 shrink-0">
          <DrawerTitle>Add Exercise</DrawerTitle>
        </DrawerHeader>

        {/* Search input */}
        <div className="px-4 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search exercises..."
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Category chips — always visible */}
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 shrink-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <Badge
            variant={!selectedCategory ? "default" : "secondary"}
            className="cursor-pointer shrink-0"
            onClick={() => setSelectedCategory(null)}
          >
            All
          </Badge>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <Badge
              key={key}
              variant={selectedCategory === key ? "default" : "secondary"}
              className="cursor-pointer shrink-0"
              onClick={() => setSelectedCategory(key)}
            >
              {label}
            </Badge>
          ))}
        </div>

        {/* Result count + loading indicator */}
        {(debouncedQuery || selectedCategory) && (
          <div className="flex items-center gap-2 px-4 pb-2 shrink-0">
            <p className="text-xs text-muted-foreground">
              {resultCount} {resultCount === 1 ? "exercise" : "exercises"}
            </p>
            {isFetching && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          </div>
        )}

        {/* Exercise list */}
        <div ref={listRef} className="flex-1 overflow-y-auto min-h-0 px-4 pb-4">
          {/* Loading state on first load */}
          {!exerciseList && isFetching && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty state */}
          {exerciseList && flatList.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="size-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No exercises found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {debouncedQuery && selectedCategory
                  ? `No "${debouncedQuery}" exercises in ${CATEGORY_LABELS[selectedCategory]}`
                  : debouncedQuery
                    ? `No results for "${debouncedQuery}"`
                    : `No exercises in ${CATEGORY_LABELS[selectedCategory ?? ""]}`}
              </p>
            </div>
          )}

          {/* Search results — flat list */}
          {debouncedQuery && exerciseList && flatList.length > 0 && (
            <div className="space-y-0.5">
              {flatList.map((ex, i) => (
                <ExerciseRow
                  key={ex.id}
                  exercise={ex}
                  index={i}
                  highlighted={highlightedIndex === i}
                  selected={selectedId === ex.id}
                  onSelect={handleSelect}
                  onHover={setHighlightedIndex}
                />
              ))}
            </div>
          )}

          {/* Browse mode — grouped with sections */}
          {!debouncedQuery && exerciseList && (
            <>
              {/* Recent exercises */}
              {showRecent && (
                <ExerciseSection title="Recent">
                  {recentExercises.map((ex) => {
                    const i = flatList.indexOf(ex);
                    return (
                      <ExerciseRow
                        key={ex.id}
                        exercise={ex}
                        index={i}
                        highlighted={highlightedIndex === i}
                        selected={selectedId === ex.id}
                        onSelect={handleSelect}
                        onHover={setHighlightedIndex}
                      />
                    );
                  })}
                </ExerciseSection>
              )}

              {/* Grouped by category */}
              {grouped &&
                Array.from(grouped.entries()).map(([category, exs]) => (
                  <ExerciseSection key={category} title={CATEGORY_LABELS[category] ?? category}>
                    {exs.map((ex) => {
                      const i = flatList.indexOf(ex);
                      return (
                        <ExerciseRow
                          key={ex.id}
                          exercise={ex}
                          index={i}
                          highlighted={highlightedIndex === i}
                          selected={selectedId === ex.id}
                          onSelect={handleSelect}
                          onHover={setHighlightedIndex}
                        />
                      );
                    })}
                  </ExerciseSection>
                ))}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ExerciseSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="sticky top-0 z-10 bg-background pb-1.5 pt-1">
        <p className="text-xs font-medium text-muted-foreground">
          {title}
        </p>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ExerciseRow({
  exercise,
  index,
  highlighted,
  selected,
  onSelect,
  onHover,
}: {
  exercise: ExerciseSchema;
  index: number;
  highlighted: boolean;
  selected: boolean;
  onSelect: (exercise: ExerciseSchema) => void;
  onHover: (index: number) => void;
}) {
  return (
    <button
      type="button"
      data-index={index}
      onClick={() => onSelect(exercise)}
      onMouseEnter={() => onHover(index)}
      className={`flex w-full items-center gap-3 rounded-md p-2.5 text-left transition-colors
        ${selected ? "bg-primary/10 text-primary" : highlighted ? "bg-muted" : "hover:bg-muted active:bg-muted/80"}`}
    >
      <Dumbbell className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{exercise.name}</p>
      </div>
      <Badge variant="secondary" className="shrink-0 capitalize text-[10px]">
        {exercise.equipment}
      </Badge>
    </button>
  );
}

// --- Cancel Workout Button ---

function CancelWorkoutButton({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="icon" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard workout?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete the current workout and all logged sets.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep going</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// --- History Tab ---

function WorkoutHistory() {
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);

  const { data: workouts } = useQuery({
    ...listWorkoutsV1WorkoutsGetOptions({
      client,
      query: { limit: 50, page: 1, sorting: ["-started_at"] },
    }),
  });

  const { data: workoutDetail } = useQuery({
    ...getWorkoutV1WorkoutsWorkoutIdGetOptions({
      client,
      path: { workout_id: selectedWorkoutId! },
    }),
    enabled: !!selectedWorkoutId,
  });

  const { data: exerciseList } = useQuery({
    ...listExercisesV1WorkoutsExercisesGetOptions({
      client,
      query: { limit: 100, page: 1 },
    }),
    staleTime: Infinity,
  });

  const exerciseMap = useMemo(() => {
    const map = new Map<string, ExerciseSchema>();
    for (const ex of exerciseList?.items ?? []) {
      map.set(ex.id, ex);
    }
    return map;
  }, [exerciseList]);

  const items = workouts?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <Clock className="size-10" />
            </EmptyMedia>
            <EmptyTitle>No workouts yet</EmptyTitle>
            <EmptyDescription>Start logging workouts to see your history here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (selectedWorkoutId && workoutDetail) {
    return (
      <WorkoutDetailView
        workout={workoutDetail}
        exerciseMap={exerciseMap}
        onBack={() => setSelectedWorkoutId(null)}
      />
    );
  }

  // Group by date
  const grouped = new Map<string, WorkoutLogSchema[]>();
  for (const w of items) {
    const dateKey = format(new Date(w.started_at), "yyyy-MM-dd");
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(w);
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([dateKey, dayWorkouts]) => (
        <div key={dateKey}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {format(new Date(dateKey), "EEEE, MMM d")}
          </p>
          <div className="space-y-2">
            {dayWorkouts.map((w) => (
              <WorkoutCard key={w.id} workout={w} onClick={() => setSelectedWorkoutId(w.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkoutCard({ workout, onClick }: { workout: WorkoutLogSchema; onClick: () => void }) {
  const actualDuration = useMemo(() => {
    if (!workout.completed_at || !workout.started_at) return null;
    const start = new Date(workout.started_at).getTime();
    const end = new Date(workout.completed_at).getTime();
    const mins = Math.round((end - start) / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }, [workout.started_at, workout.completed_at]);

  return (
    <Card className="py-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={onClick}>
      <CardContent className="flex items-center justify-between">
        <p className="text-sm font-medium">{format(new Date(workout.started_at), "h:mm a")}</p>
        {actualDuration && (
          <Badge variant="secondary">
            <Clock className="size-3" />
            {actualDuration}
          </Badge>
        )}
      </CardContent>
      {workout.notes && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground truncate">{workout.notes}</p>
        </CardContent>
      )}
    </Card>
  );
}

function WorkoutDetailView({
  workout,
  exerciseMap,
  onBack,
}: {
  workout: WorkoutLogDetailSchema;
  exerciseMap: Map<string, ExerciseSchema>;
  onBack: () => void;
}) {
  const groups = groupSetsByExercise(workout.sets ?? []);

  const actualDuration = useMemo(() => {
    if (!workout.completed_at || !workout.started_at) return null;
    const start = new Date(workout.started_at).getTime();
    const end = new Date(workout.completed_at).getTime();
    const mins = Math.round((end - start) / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }, [workout.started_at, workout.completed_at]);

  const totalVolume = useMemo(() => {
    return (workout.sets ?? []).reduce((sum, s) => sum + s.weight * s.reps, 0);
  }, [workout.sets]);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        &larr; Back to history
      </Button>

      <Card className="py-4">
        <CardContent>
          <p className="font-medium">
            {format(new Date(workout.started_at), "EEEE, MMM d 'at' h:mm a")}
          </p>
          <div className="mt-2 flex gap-3">
            {actualDuration && (
              <Badge variant="secondary">
                <Clock className="size-3" />
                {actualDuration}
              </Badge>
            )}
            <Badge variant="secondary">{workout.sets?.length ?? 0} sets</Badge>
            <Badge variant="secondary">{Math.round(totalVolume).toLocaleString()} kg</Badge>
          </div>
        </CardContent>
      </Card>

      {groups.map((group) => {
        const exercise = exerciseMap.get(group.exerciseId);
        return (
          <Card key={group.exerciseId} className="py-4">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm">{exercise?.name ?? "Exercise"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 text-xs font-medium text-muted-foreground mb-2">
                <span>Set</span>
                <span>Weight</span>
                <span>Reps</span>
              </div>
              {group.sets.map((set) => (
                <div
                  key={set.id}
                  className="grid grid-cols-[2rem_1fr_1fr] gap-2 items-center py-1.5 text-sm"
                >
                  <span className="text-xs text-muted-foreground text-center">
                    {set.set_number}
                  </span>
                  <span className="tabular-nums">
                    {set.weight} kg
                    {set.is_pr && <Trophy className="size-3 inline ml-1 text-amber-500" />}
                  </span>
                  <span className="tabular-nums">{set.reps}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// --- PR Dashboard Tab ---

function PRDashboard() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: exerciseList } = useQuery({
    ...listExercisesV1WorkoutsExercisesGetOptions({
      client,
      query: { limit: 100, page: 1, q: searchQuery || undefined },
    }),
  });

  const exercises = exerciseList?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter exercises..."
          className="pl-9"
        />
      </div>

      {exercises.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <Trophy className="size-10" />
              </EmptyMedia>
              <EmptyTitle>No PRs yet</EmptyTitle>
              <EmptyDescription>
                Start logging workouts to track your personal records.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        exercises.map((ex) => <ExercisePRCard key={ex.id} exercise={ex} />)
      )}
    </div>
  );
}

function ExercisePRCard({ exercise }: { exercise: ExerciseSchema }) {
  const [expanded, setExpanded] = useState(false);

  const { data: prs } = useQuery({
    ...getExercisePrsV1WorkoutsExercisesExerciseIdPrsGetOptions({
      client,
      path: { exercise_id: exercise.id },
    }),
    enabled: expanded,
  });

  const prItems = prs?.items ?? [];

  if (!expanded) {
    return (
      <Card
        className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(true)}
      >
        <CardContent className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="size-4 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">{exercise.name}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {exercise.category} &middot; {exercise.equipment}
              </p>
            </div>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-4">
      <CardHeader>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-amber-500" />
            <CardTitle className="text-sm">{exercise.name}</CardTitle>
          </div>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </CardHeader>

      <CardContent>
        {prItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No records yet</p>
        ) : (
          <div className="space-y-2">
            {prItems.map((pr) => (
              <div
                key={`${pr.reps}`}
                className="flex items-center justify-between rounded-md bg-muted px-3 py-2"
              >
                <Badge variant="outline">{pr.reps}RM</Badge>
                <div className="text-right">
                  <span className="text-sm font-bold tabular-nums">{pr.weight} kg</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {format(new Date(pr.achieved_at), "MMM d")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
