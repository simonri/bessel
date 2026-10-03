import type { EditScope } from "@bessel/client";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "@bessel/ui/components/context-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@bessel/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@bessel/ui/components/tooltip";
import { Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { SoftButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { GOOGLE_EVENT_COLORS, MENU_COLORS } from "./event-colors";
import { SCOPE_LABELS } from "./scope-menu";

/** What the right-click menu offers for one event. */
export interface EventMenuOptions {
  /** Google events the account can change (colour is the viewer's own). */
  colors: boolean;
  /** Events the account organizes. */
  delete: boolean;
}

export function EventContextMenu({
  colorId,
  options,
  onColor,
  onDelete,
}: {
  colorId: string | null;
  options: EventMenuOptions;
  /** A new colour id, or null to go back to the calendar's colour. */
  onColor: (colorId: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <ContextMenuContent
      className="min-w-56 p-1"
      // Returning focus to the event would dismiss the delete prompt that
      // the Delete item opens.
      onCloseAutoFocus={(e) => e.preventDefault()}
    >
      {options.colors && (
        <div className="flex items-center gap-2 px-2.5 py-2">
          {MENU_COLORS.map(({ id, label }) => {
            const current = colorId === id;
            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <ContextMenuItem
                    aria-label={current ? `${label} (clear)` : label}
                    // Picking the current colour again goes back to the calendar's.
                    onSelect={() => onColor(current ? null : id)}
                    className="flex size-3.5 items-center justify-center rounded-[4px] p-0 transition-transform hover:scale-110 focus:scale-110 focus:ring-2 focus:ring-white/30"
                    style={{ background: GOOGLE_EVENT_COLORS[id] }}
                  >
                    {current && (
                      <Check className="size-2.5 text-white" strokeWidth={4} />
                    )}
                  </ContextMenuItem>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
      {options.colors && options.delete && <ContextMenuSeparator />}
      {options.delete && (
        <ContextMenuItem
          variant="destructive"
          onSelect={onDelete}
          className="gap-2.5 px-2.5"
        >
          <Trash2 />
          Delete
          <ContextMenuShortcut className="tracking-normal">
            delete
          </ContextMenuShortcut>
        </ContextMenuItem>
      )}
    </ContextMenuContent>
  );
}

const choiceClass =
  "rounded-md px-2 py-1.5 text-left text-13 text-white/80 outline-none transition-colors duration-150 hover:bg-white/[0.06] focus-visible:bg-white/[0.08]";

/** Confirms a delete started from the right-click menu: which occurrences of
 *  a repeating event, and whether guests are emailed. */
export function DeletePrompt({
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
  const scopes: EditScope[] = recurring ? ["this", "following", "all"] : [];
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
        // Opened from a closing menu; only a click elsewhere dismisses it.
        onFocusOutside={(e) => e.preventDefault()}
      >
        <p className="px-2 pt-1 pb-2 text-12 text-white/55">
          {recurring ? "Delete this repeating event:" : "Delete this event?"}
        </p>
        {hasGuests && (
          <label className="mx-2 mb-2 flex cursor-pointer items-center gap-1.5 text-12 text-white/60">
            <input
              type="checkbox"
              className="accent-primary-500"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
            />
            Email guests about the cancellation
          </label>
        )}
        {recurring ? (
          <div className="flex flex-col gap-0.5">
            {scopes.map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => onConfirm(scope, hasGuests && notify)}
                className={cn(choiceClass, "text-red-300")}
              >
                {SCOPE_LABELS[scope]}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex justify-end gap-1.5">
          <SoftButton onClick={onCancel}>Cancel</SoftButton>
          {!recurring && (
            <SoftButton
              autoFocus
              onClick={() => onConfirm("this", hasGuests && notify)}
              className="bg-red-500/15 text-red-200 hover:bg-red-500/25 hover:text-red-100"
            >
              Delete
            </SoftButton>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
