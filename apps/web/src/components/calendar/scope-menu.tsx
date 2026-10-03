import type { EditScope } from "@bessel/client";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@bessel/ui/components/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@bessel/ui/components/popover";
import { useState } from "react";
import { SoftButton } from "@/components/ui-kit";

export const SCOPE_LABELS: Record<EditScope, string> = {
  this: "This event",
  following: "This and following events",
  all: "All events",
};

const ALL_SCOPES: EditScope[] = ["this", "following", "all"];

/** Scopes a change may use: repeat-rule changes can't target one occurrence,
 *  and calendar moves apply to the whole series. */
export function allowedScopes({
  changesRule,
  movesCalendar,
}: {
  changesRule?: boolean;
  movesCalendar?: boolean;
}): EditScope[] {
  if (movesCalendar) return ["all"];
  if (changesRule) return ["following", "all"];
  return ALL_SCOPES;
}

export function ScopeMenuItems({
  label,
  scopes = ALL_SCOPES,
  destructive,
  onSelect,
}: {
  label: string;
  scopes?: EditScope[];
  destructive?: boolean;
  onSelect: (scope: EditScope) => void;
}) {
  return (
    <>
      <DropdownMenuLabel className="text-11 font-normal text-white/45">
        {label}
      </DropdownMenuLabel>
      {scopes.map((scope) => (
        <DropdownMenuItem
          key={scope}
          variant={destructive ? "destructive" : "default"}
          onSelect={() => onSelect(scope)}
        >
          {SCOPE_LABELS[scope]}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** Whether a dropped event needs to ask anything before saving. */
export function moveNeedsPrompt({
  recurring,
  notifiesGuests,
}: {
  recurring: boolean;
  notifiesGuests: boolean;
}): boolean {
  return recurring || notifiesGuests;
}

const choiceClass =
  "rounded-md px-2 py-1.5 text-left text-13 text-white/80 outline-none transition-colors duration-150 hover:bg-white/[0.06] focus-visible:bg-white/[0.08]";

/** Asks what a drag-and-drop applies to before it's saved: which occurrences
 *  of a repeating event, and whether guests are emailed about the change. */
export function MovePrompt({
  anchor,
  recurring,
  hasGuests,
  onConfirm,
  onCancel,
}: {
  anchor: HTMLElement | null;
  recurring: boolean;
  hasGuests: boolean;
  onConfirm: (scope: EditScope, notifyGuests: boolean) => void;
  onCancel: () => void;
}) {
  const [notify, setNotify] = useState(true);
  return (
    <Popover
      open={anchor !== null}
      onOpenChange={(open) => !open && onCancel()}
    >
      {anchor && <PopoverAnchor virtualRef={{ current: anchor }} />}
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-64 rounded-xl border-white/10 p-2 shadow-2xl"
      >
        {recurring ? (
          <>
            <p className="px-2 pt-1 pb-2 text-12 text-white/55">
              Move this repeating event:
            </p>
            {hasGuests && (
              <label className="mx-2 mb-2 flex cursor-pointer items-center gap-1.5 text-12 text-white/60">
                <input
                  type="checkbox"
                  className="accent-primary-500"
                  checked={notify}
                  onChange={(e) => setNotify(e.target.checked)}
                />
                Email guests
              </label>
            )}
            <div className="flex flex-col gap-0.5">
              {ALL_SCOPES.map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => onConfirm(scope, hasGuests && notify)}
                  className={choiceClass}
                >
                  {SCOPE_LABELS[scope]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="px-2 pt-1 pb-2 text-12 text-white/55">
              Email guests about this change?
            </p>
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => onConfirm("this", true)}
                className={choiceClass}
              >
                Send update
              </button>
              <button
                type="button"
                onClick={() => onConfirm("this", false)}
                className={choiceClass}
              >
                Don't send
              </button>
            </div>
          </>
        )}
        <div className="mt-2 flex justify-end">
          <SoftButton onClick={onCancel}>Cancel</SoftButton>
        </div>
      </PopoverContent>
    </Popover>
  );
}
