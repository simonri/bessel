import { cn } from "@bessel/ui/lib/utils";
import type * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-white/85 placeholder:text-white/25 selection:bg-primary selection:text-primary-foreground h-8 w-full min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 text-13 text-white/85 transition-colors duration-150 outline-none hover:border-white/15 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-primary-500/50 focus-visible:bg-white/[0.06]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        type === "date" && "dark:[color-scheme:dark]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
