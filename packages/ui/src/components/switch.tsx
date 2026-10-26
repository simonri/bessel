import { cn } from "@bessel/ui/lib/utils";
import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";

/**
 * A white knob on a grey track that fills with the accent when on.
 * Default is 36x20 with a 16px knob; sm is 28x16 with a 12px knob.
 */
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary-500 data-[state=unchecked]:bg-white/15 data-[state=unchecked]:hover:bg-white/20 data-[size=default]:h-5 data-[size=default]:w-9 data-[size=sm]:h-4 data-[size=sm]:w-7",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform duration-150 ease-out data-[state=unchecked]:translate-x-0 group-data-[size=default]/switch:size-4 group-data-[size=default]/switch:data-[state=checked]:translate-x-4 group-data-[size=sm]/switch:size-3 group-data-[size=sm]/switch:data-[state=checked]:translate-x-3"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
