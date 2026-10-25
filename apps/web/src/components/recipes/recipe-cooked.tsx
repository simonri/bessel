import { listRecipeCooksOptions, type RecipeSchema } from "@bessel/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { Check, ChefHat, History, X } from "lucide-react";
import { useState } from "react";
import { client } from "@/lib/client";
import { localIsoDay } from "@/lib/local-day";
import { apiDay, cookedLabel, lastCookedDay } from "./recipe-meta";

const HISTORY_SHOWN = 8;

function formatDay(day: string): string {
  return format(new Date(`${day}T12:00:00`), "EEE d MMM yyyy");
}

/** "Cooked 12 days ago - 6 times", opening the history: log another day or take one off. */
export function CookedMenu({
  recipe,
  today,
  onLog,
  onRemove,
}: {
  recipe: RecipeSchema;
  today: string;
  onLog: (day: string) => void;
  onRemove: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [otherDay, setOtherDay] = useState("");
  const last = lastCookedDay(recipe);
  const yesterday = localIsoDay(addDays(new Date(`${today}T12:00:00`), -1));
  const { data } = useQuery({
    ...listRecipeCooksOptions({ client, path: { recipe_id: recipe.id } }),
    enabled: open && recipe.cook_count > 0,
  });
  const days = (data?.days ?? []).map(apiDay);

  const log = (day: string) => {
    onLog(day);
    setOtherDay("");
    setOpen(false);
  };

  const quick = [
    { day: today, label: "Cooked today" },
    { day: yesterday, label: "Cooked yesterday" },
  ].filter(({ day }) => !days.includes(day) && day !== last);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 items-center gap-1 rounded-full bg-white/[0.06] px-2 text-11 text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white/85"
        >
          <History className="size-3" />
          {cookedLabel(last, today)}
          {recipe.cook_count > 1 && ` - ${recipe.cook_count} times`}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        {quick.map(({ day, label }) => (
          <button
            key={day}
            type="button"
            onClick={() => log(day)}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-13 text-white/80 hover:bg-white/[0.06]"
          >
            <ChefHat className="size-3.5 text-primary-300" />
            {label}
          </button>
        ))}
        <form
          className="flex items-center gap-1.5 px-2 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (otherDay) log(otherDay);
          }}
        >
          <input
            type="date"
            aria-label="Another day"
            max={today}
            value={otherDay}
            onChange={(e) => setOtherDay(e.target.value)}
            className="h-7 min-w-0 flex-1 rounded-md bg-white/[0.05] px-2 text-12 text-white/80 [color-scheme:dark]"
          />
          <button
            type="submit"
            disabled={!otherDay}
            className="h-7 rounded-md px-2 text-12 font-medium text-primary-300 hover:bg-white/[0.06] disabled:text-white/25 disabled:hover:bg-transparent"
          >
            Log
          </button>
        </form>
        {days.length > 0 && (
          <div className="mt-1 border-t border-white/[0.08] pt-1.5">
            <p className="px-2 pb-1 text-11 text-white/40">Cooked on</p>
            <ul>
              {days.slice(0, HISTORY_SHOWN).map((day) => (
                <li
                  key={day}
                  className="group flex h-7 items-center justify-between rounded-md px-2 text-12 text-white/70 hover:bg-white/[0.04]"
                >
                  {formatDay(day)}
                  <button
                    type="button"
                    aria-label={`Remove ${formatDay(day)}`}
                    onClick={() => onRemove(day)}
                    className="flex size-5 items-center justify-center rounded text-white/30 hover:bg-white/[0.08] hover:text-white/75"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
            {days.length > HISTORY_SHOWN && (
              <p className="px-2 pt-1 text-11 text-white/35">
                and {days.length - HISTORY_SHOWN} more
              </p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The end of cooking: one tap logs today. */
export function CookedButton({
  recipe,
  today,
  onLog,
  pending,
}: {
  recipe: RecipeSchema;
  today: string;
  onLog: (day: string) => void;
  pending: boolean;
}) {
  const done = lastCookedDay(recipe) === today;
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/[0.03] px-4 py-5 ring-1 ring-white/[0.06]">
      <button
        type="button"
        disabled={done || pending}
        onClick={() => onLog(today)}
        className="flex h-9 items-center gap-2 rounded-full bg-primary-500 px-5 text-13 font-medium text-white transition-[background-color,transform] duration-150 hover:bg-primary-400 active:scale-95 disabled:bg-white/[0.08] disabled:text-white/70 disabled:active:scale-100"
      >
        {done ? <Check className="size-4" /> : <ChefHat className="size-4" />}
        {done ? "Cooked today" : "I cooked this"}
      </button>
      <p className="text-11 text-white/40">
        {done
          ? "Logged - it shows up as cooked in your list"
          : "Keeps track of what you haven't made in a while"}
      </p>
    </div>
  );
}
