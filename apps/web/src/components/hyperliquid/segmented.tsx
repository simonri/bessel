import { cn } from "@/lib/utils";

/** A soft pill of mutually exclusive options. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
}) {
  return (
    <fieldset
      aria-label={label}
      className="m-0 flex min-w-0 items-center rounded-full border-0 bg-white/[0.04] p-0.5 ring-1 ring-white/[0.06]"
    >
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "h-6 rounded-full px-2.5 text-xs font-medium tabular-nums transition-[background-color,color] duration-150",
            value === key
              ? "bg-white/[0.12] text-white/90 shadow-sm"
              : "text-white/45 hover:text-white/75",
          )}
        >
          {text}
        </button>
      ))}
    </fieldset>
  );
}
