import {
  GlassDialog,
  GlassDialogContent,
  GlassDialogDescription,
  GlassDialogTitle,
} from "@bessel/ui/components/glass-dialog";

const mod =
  typeof window !== "undefined" && window.electron?.platform === "darwin"
    ? "⌘"
    : "Ctrl";

const SHORTCUTS: { area: string; keys: { combo: string; does: string }[] }[] = [
  {
    area: "Everywhere",
    keys: [
      { combo: `${mod} K`, does: "Search, go to a page, add a task" },
      { combo: "?", does: "Show these shortcuts" },
      { combo: "Esc", does: "Close a dialog or the search" },
    ],
  },
  {
    area: "Search",
    keys: [
      { combo: "↑ ↓", does: "Move through results" },
      { combo: "Enter", does: "Open the selected result" },
    ],
  },
  {
    area: "Tasks",
    keys: [{ combo: "Enter", does: "Add the task typed in the quick add box" }],
  },
  {
    area: "Calendar",
    keys: [{ combo: "Delete", does: "Delete the selected event" }],
  },
  {
    area: "Notes",
    keys: [
      { combo: `${mod} N`, does: "New note" },
      { combo: `${mod} Shift F`, does: "Search notes" },
      { combo: `${mod} E`, does: "Switch between editing and reading" },
      { combo: `${mod} W`, does: "Close the note" },
    ],
  },
  {
    area: "Git",
    keys: [{ combo: `${mod} Enter`, does: "Commit" }],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent className="flex max-h-[80vh] w-full max-w-md flex-col gap-0 p-0">
        <div className="px-5 pt-4 pb-3">
          <GlassDialogTitle>Keyboard shortcuts</GlassDialogTitle>
          <GlassDialogDescription className="mt-1 text-13 text-white/50">
            Press ? anywhere outside a text field to see this again.
          </GlassDialogDescription>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
          {SHORTCUTS.map(({ area, keys }) => (
            <section key={area}>
              <h3 className="mb-1.5 text-12 font-medium text-white/45">
                {area}
              </h3>
              <dl className="space-y-1">
                {keys.map(({ combo, does }) => (
                  <div
                    key={combo + does}
                    className="flex items-center justify-between gap-4 text-13"
                  >
                    <dt className="text-white/75">{does}</dt>
                    <dd>
                      <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-11 text-white/70">
                        {combo}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </GlassDialogContent>
    </GlassDialog>
  );
}
