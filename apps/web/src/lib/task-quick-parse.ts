// Parses a one-line task like "Essay draft fri #uni !" into its parts.
//
// Words are matched standalone (whitespace-separated), so "Monday meeting"
// does set the task due Monday — the trade-off for typing dates anywhere.

export type QuickTokenKind = "due" | "project" | "priority";

export interface QuickToken {
  kind: QuickTokenKind;
  /** The text as typed, removed from the title. */
  text: string;
  /** Friendly label for a chip: "Today", "Fri", "Oct 5", "Uni", "High". */
  label: string;
}

export interface ParsedQuickTask {
  title: string;
  dueDate: Date | null;
  project: string | null;
  priority: number;
  tokens: QuickToken[];
}

const WEEKDAYS = [
  ["sunday", "sun"],
  ["monday", "mon"],
  ["tuesday", "tue", "tues"],
  ["wednesday", "wed"],
  ["thursday", "thu", "thur", "thurs"],
  ["friday", "fri"],
  ["saturday", "sat"],
];

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "oct", "octo", "october" — at least three letters of a month name. */
function monthIndex(word: string): number {
  const w = word.toLowerCase();
  if (w.length < 3) return -1;
  return MONTH_NAMES.findIndex((m) => m.startsWith(w));
}

function weekdayIndex(word: string): number {
  const w = word.toLowerCase();
  return WEEKDAYS.findIndex((names) => names.includes(w));
}

/** A calendar date on or after today; rolls into next year when past. */
function upcomingDate(today: Date, month: number, day: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  let d = new Date(today.getFullYear(), month, day);
  if (d.getMonth() !== month) return null;
  if (d < today) d = new Date(today.getFullYear() + 1, month, day);
  return d.getMonth() === month ? d : null;
}

export function dueLabel(due: Date, now = new Date()): string {
  const today = startOfDay(now);
  const diff = Math.round(
    (startOfDay(due).getTime() - today.getTime()) / 86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return SHORT_DAY[due.getDay()];
  const month = MONTH_NAMES[due.getMonth()];
  return `${month[0].toUpperCase()}${month.slice(1, 3)} ${due.getDate()}`;
}

type Match = { length: number; date: Date };

/** Tries to read a due date starting at words[i]; returns how many words it used. */
function matchDue(words: string[], i: number, today: Date): Match | null {
  const w = words[i].toLowerCase();
  const next = words[i + 1]?.toLowerCase();

  if (w === "today" || w === "tod" || w === "tonight")
    return { length: 1, date: today };
  if (w === "tomorrow" || w === "tmr" || w === "tmrw")
    return { length: 1, date: addDays(today, 1) };

  if (w === "next" && next === "week") {
    const toMonday = (8 - today.getDay()) % 7 || 7;
    return { length: 2, date: addDays(today, toMonday) };
  }

  if (w === "in" && next && /^\d{1,3}$/.test(next)) {
    const unit = words[i + 2]?.toLowerCase();
    if (unit === "days" || unit === "day" || unit === "d")
      return { length: 3, date: addDays(today, Number(next)) };
    if (unit === "weeks" || unit === "week" || unit === "w")
      return { length: 3, date: addDays(today, Number(next) * 7) };
  }

  const weekday = weekdayIndex(w);
  if (weekday >= 0) {
    const ahead = (weekday - today.getDay() + 7) % 7 || 7;
    return { length: 1, date: addDays(today, ahead) };
  }

  const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(w);
  if (slash) {
    const date = upcomingDate(today, Number(slash[2]) - 1, Number(slash[1]));
    if (date) return { length: 1, date };
  }

  if (/^\d{1,2}$/.test(w) && next) {
    const date = upcomingDate(today, monthIndex(next), Number(w));
    if (date) return { length: 2, date };
  }
  const month = monthIndex(w);
  if (month >= 0 && next && /^\d{1,2}$/.test(next)) {
    const date = upcomingDate(today, month, Number(next));
    if (date) return { length: 2, date };
  }
  return null;
}

function matchProject(word: string, projects: string[]): string | null {
  if (!word.startsWith("#") || word.length < 2) return null;
  const query = word.slice(1).toLowerCase();
  const exact = projects.find((p) => p.toLowerCase() === query);
  if (exact) return exact;
  const prefixed = projects.filter((p) => p.toLowerCase().startsWith(query));
  return prefixed.length === 1 ? prefixed[0] : null;
}

const PRIORITY_LABEL: Record<number, string> = { 3: "High", 4: "Urgent" };

export function parseQuickTask(
  input: string,
  projects: string[],
  now = new Date(),
): ParsedQuickTask {
  const today = startOfDay(now);
  const words = input.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  const tokens: QuickToken[] = [];
  let dueDate: Date | null = null;
  let project: string | null = null;
  let priority = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (/^!{1,3}$/.test(word) && priority === 0) {
      priority = word.length === 3 ? 4 : 3;
      tokens.push({
        kind: "priority",
        text: word,
        label: PRIORITY_LABEL[priority],
      });
      continue;
    }
    // "Call mum!!" — trailing bangs on the last word. A single trailing "!"
    // is ordinary punctuation, so only a standalone "!" counts.
    const trailing = /^(.*[^!])(!{2,3})$/.exec(word);
    if (trailing && i === words.length - 1 && priority === 0) {
      priority = trailing[2].length === 3 ? 4 : 3;
      tokens.push({
        kind: "priority",
        text: trailing[2],
        label: PRIORITY_LABEL[priority],
      });
      kept.push(trailing[1]);
      continue;
    }

    if (project === null) {
      const matched = matchProject(word, projects);
      if (matched) {
        project = matched;
        tokens.push({ kind: "project", text: word, label: matched });
        continue;
      }
    }

    if (dueDate === null) {
      const due = matchDue(words, i, today);
      if (due) {
        dueDate = due.date;
        tokens.push({
          kind: "due",
          text: words.slice(i, i + due.length).join(" "),
          label: dueLabel(due.date, now),
        });
        i += due.length - 1;
        continue;
      }
    }

    kept.push(word);
  }

  const title = kept.join(" ").trim();
  return {
    title: title || input.trim(),
    dueDate,
    project,
    priority,
    tokens,
  };
}
