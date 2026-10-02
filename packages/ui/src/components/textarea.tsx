import * as React from "react";

import { cn } from "@bessel/ui/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-white/10 placeholder:text-white/25 hover:border-white/15 focus-visible:border-primary-500/50 focus-visible:bg-white/[0.06] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-lg border bg-white/[0.04] px-3 py-2 text-13 text-white/85 transition-colors duration-150 outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
