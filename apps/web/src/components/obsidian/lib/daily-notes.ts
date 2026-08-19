import type { DailyNotesConfig } from "../vault-types";

const MONTHS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const MONTHS_SHORT = MONTHS_FULL.map((m) => m.slice(0, 3));

const DAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const DAYS_SHORT = DAYS_FULL.map((d) => d.slice(0, 3));

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// Longer/more specific tokens are listed before shorter ones that share a
// prefix (MMMM before MM before M, DD/Do before D, …) so the alternation
// picks the greediest match at each position; unmatched characters (and
// `[escaped]` runs) pass through untouched.
const TOKEN_RE =
  /\[[^\]]*\]|YYYY|YY|MMMM|MMM|MM|M|DD|Do|D|dddd|ddd|HH|H|hh|h|mm|ss|A|a/g;

/**
 * Formats `date` with an Obsidian/moment.js format string ("YYYY-MM-DD",
 * "YYYY/MM/YYYY-MM-DD", "dddd, MMMM Do YYYY", …). Unsupported tokens are left
 * as-is so the caller can still show something sensible.
 */
export function formatDailyNoteName(format: string, date: Date): string {
  return format.replace(TOKEN_RE, (token) => {
    if (token.startsWith("[")) return token.slice(1, -1);
    switch (token) {
      case "YYYY":
        return String(date.getFullYear());
      case "YY":
        return pad(date.getFullYear() % 100);
      case "MMMM":
        return MONTHS_FULL[date.getMonth()];
      case "MMM":
        return MONTHS_SHORT[date.getMonth()];
      case "MM":
        return pad(date.getMonth() + 1);
      case "M":
        return String(date.getMonth() + 1);
      case "DD":
        return pad(date.getDate());
      case "Do":
        return ordinal(date.getDate());
      case "D":
        return String(date.getDate());
      case "dddd":
        return DAYS_FULL[date.getDay()];
      case "ddd":
        return DAYS_SHORT[date.getDay()];
      case "HH":
        return pad(date.getHours());
      case "H":
        return String(date.getHours());
      case "hh":
        return pad(((date.getHours() + 11) % 12) + 1);
      case "h":
        return String(((date.getHours() + 11) % 12) + 1);
      case "mm":
        return pad(date.getMinutes());
      case "ss":
        return pad(date.getSeconds());
      case "A":
        return date.getHours() < 12 ? "AM" : "PM";
      case "a":
        return date.getHours() < 12 ? "am" : "pm";
      default:
        return token;
    }
  });
}

/** Vault-relative path of the daily note for `date`, e.g. "Journal/2026-08-19.md". */
export function dailyNoteRel(config: DailyNotesConfig, date: Date): string {
  const name = formatDailyNoteName(config.format || "YYYY-MM-DD", date);
  const folder = config.folder.replace(/^\/|\/$/g, "");
  return folder ? `${folder}/${name}.md` : `${name}.md`;
}

/** Rel of the template note (Obsidian stores it without ".md"), or null. */
export function dailyNoteTemplateRel(config: DailyNotesConfig): string | null {
  if (!config.template) return null;
  const t = config.template.replace(/^\/|\/$/g, "");
  return /\.md$/i.test(t) ? t : `${t}.md`;
}

/**
 * Expands the template variables Obsidian's core Templates plugin supports:
 * `{{date}}`, `{{time}}`, `{{title}}`, plus `{{date:FORMAT}}` / `{{time:FORMAT}}`.
 */
export function applyTemplate(
  template: string,
  vars: { title: string; date: Date },
): string {
  return template
    .replace(/\{\{date(?::([^}]+))?\}\}/g, (_, fmt?: string) =>
      formatDailyNoteName(fmt ?? "YYYY-MM-DD", vars.date),
    )
    .replace(/\{\{time(?::([^}]+))?\}\}/g, (_, fmt?: string) =>
      formatDailyNoteName(fmt ?? "HH:mm", vars.date),
    )
    .replace(/\{\{title\}\}/g, vars.title);
}
