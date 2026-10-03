/** How Bessel draws each of Google's event colours. The seven offered in the
 *  menu use Notion's softer shades; the rest keep Google's. */
export const GOOGLE_EVENT_COLORS: Record<string, string> = {
  "1": "#7986cb",
  "2": "#33b679",
  "3": "#9b6bf2",
  "4": "#e67c73",
  "5": "#f2c14e",
  "6": "#f08c4a",
  "7": "#4a9ee0",
  "8": "#b4b4b4",
  "9": "#3f51b5",
  "10": "#5bbd84",
  "11": "#e5534b",
};

/** The colours offered in the event menu (Notion's set), as Google ids. */
export const MENU_COLORS: { id: string; label: string }[] = [
  { id: "11", label: "Red" },
  { id: "6", label: "Orange" },
  { id: "5", label: "Yellow" },
  { id: "10", label: "Green" },
  { id: "7", label: "Blue" },
  { id: "3", label: "Purple" },
  { id: "8", label: "Gray" },
];

/** The event's own colour, if it has one Bessel knows. */
export function eventColor(colorId: string | null | undefined): string | null {
  return colorId ? (GOOGLE_EVENT_COLORS[colorId] ?? null) : null;
}
