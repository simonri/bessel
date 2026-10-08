import type { SearchResponse } from "@bessel/client";
import { format } from "date-fns";
import type { PageKey } from "@/components/pages";
import { userStorage } from "@/lib/user-storage";

export type HitKind = "task" | "event" | "recipe" | "place" | "note";

/** One search result, enough to show it and to open it later. */
export interface PaletteHit {
  kind: HitKind;
  id: string;
  label: string;
  sublabel?: string;
  /** When to open it: an instant or day for events, a line for notes. */
  at?: string;
}

export const HIT_SECTIONS: { kind: HitKind; title: string }[] = [
  { kind: "task", title: "Tasks" },
  { kind: "event", title: "Events" },
  { kind: "recipe", title: "Recipes" },
  { kind: "place", title: "Places" },
  { kind: "note", title: "Notes" },
];

/** The page a hit opens on (tasks open in a dialog instead). */
export const HIT_PAGE: Record<Exclude<HitKind, "task">, PageKey> = {
  event: "calendar",
  recipe: "recipes",
  place: "travel",
  note: "obsidian",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "Doing",
  in_review: "In review",
  done: "Done",
  cancelled: "Cancelled",
};

export function hitsFromSearch(
  response: SearchResponse | undefined,
): PaletteHit[] {
  if (!response) return [];
  return [
    ...response.tasks.map((t) => ({
      kind: "task" as const,
      id: t.id,
      label: t.title,
      sublabel: STATUS_LABEL[t.status] ?? t.status,
    })),
    ...response.events.flatMap((e) => {
      // All-day events open at noon that day, so no time zone moves them.
      const at = e.all_day
        ? e.start_date
          ? `${format(e.start_date, "yyyy-MM-dd")}T12:00:00`
          : undefined
        : e.start_at?.toISOString();
      if (!at) return [];
      const when = e.all_day
        ? format(new Date(at), "EEE d MMM yyyy")
        : format(new Date(at), "EEE d MMM yyyy, HH:mm");
      return [
        {
          kind: "event" as const,
          id: e.id,
          label: e.title || "(No title)",
          sublabel: when,
          at,
        },
      ];
    }),
    ...response.recipes.map((r) => ({
      kind: "recipe" as const,
      id: r.id,
      label: r.title,
    })),
    ...response.places.map((p) => ({
      kind: "place" as const,
      id: p.id,
      label: p.name,
      sublabel: p.address ?? undefined,
    })),
  ];
}

/** Vault search hits are lines; one row per note, at its first match. */
export function hitsFromNotes(
  lines: { rel: string; line: number; text: string }[],
  limit = 5,
): PaletteHit[] {
  const seen = new Set<string>();
  const hits: PaletteHit[] = [];
  for (const { rel, line, text } of lines) {
    if (seen.has(rel)) continue;
    seen.add(rel);
    hits.push({
      kind: "note",
      id: rel,
      label: rel.replace(/\.md$/, "").split("/").pop() ?? rel,
      sublabel: text.trim() || rel,
      at: String(line),
    });
    if (hits.length === limit) break;
  }
  return hits;
}

const RECENTS_KEY = "bessel:palette-recent";
const MAX_RECENTS = 6;

/** A command by id, or a search result as it looked when opened. */
export type RecentEntry =
  | { type: "command"; id: string }
  | { type: "hit"; hit: PaletteHit };

const recentKey = (entry: RecentEntry) =>
  entry.type === "command"
    ? `command:${entry.id}`
    : `${entry.hit.kind}:${entry.hit.id}`;

export function loadRecents(): RecentEntry[] {
  try {
    const parsed: unknown = JSON.parse(
      userStorage.getItem(RECENTS_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? (parsed as RecentEntry[]).slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
}

export function rememberRecent(entry: RecentEntry): void {
  const key = recentKey(entry);
  const next = [
    entry,
    ...loadRecents().filter((e) => recentKey(e) !== key),
  ].slice(0, MAX_RECENTS);
  userStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}
