import { Eye, EyeOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { IconButton } from "@/components/ui-kit";
import { formatKr } from "@/lib/money";
import { userStorage } from "@/lib/user-storage";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "bessel:hide-amounts";
const listeners = new Set<() => void>();
let hidden: boolean | null = null;

function read(): boolean {
  hidden ??= userStorage.getItem(STORAGE_KEY) === "1";
  return hidden;
}

export function setAmountsHidden(value: boolean): void {
  hidden = value;
  userStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether money is blurred on this device, for showing the app with someone looking. */
export function useAmountsHidden(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Test-only: forget the remembered choice. */
export function resetAmountsHiddenForTests() {
  hidden = null;
}

/** Stands in for an amount while hidden: same width, digits not the real ones. */
export function maskDigits(text: string): string {
  return text.replace(/\d/g, "8");
}

/** An amount in whole kronor that blurs while amounts are hidden. */
export function Amount({
  value,
  currency = "SEK",
  compact,
  sign,
  className,
}: {
  value: number;
  currency?: string;
  compact?: boolean;
  sign?: boolean;
  className?: string;
}) {
  const isHidden = useAmountsHidden();
  const text = formatKr(value, currency, { compact, sign });
  if (!isHidden) {
    return (
      <span className={cn("whitespace-nowrap tabular-nums", className)}>
        {text}
      </span>
    );
  }
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      <span className="sr-only">Amount hidden</span>
      <span aria-hidden className="blur-[5px] select-none">
        {maskDigits(text)}
      </span>
    </span>
  );
}

export function HideAmountsButton() {
  const isHidden = useAmountsHidden();
  return (
    <IconButton
      title={isHidden ? "Show amounts" : "Hide amounts"}
      aria-pressed={isHidden}
      onClick={() => setAmountsHidden(!isHidden)}
    >
      {isHidden ? <EyeOff /> : <Eye />}
    </IconButton>
  );
}
