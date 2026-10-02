import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@bessel/ui/lib/utils";

const buttonVariants = cva(
  [
    "box-border relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-md",
    "disabled:pointer-events-none disabled:opacity-50",
    "selection:text-current",
    "transition-[background-color,color] duration-150",
    "focus:outline-none",
    "motion-reduce:transition-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      align: {
        center: "justify-center",
        start: "justify-start",
      },
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-white/[0.06] disabled:text-white/35 disabled:opacity-100",
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-white/[0.06] disabled:text-white/35 disabled:opacity-100",
        secondary:
          "bg-white/[0.06] text-white/80 hover:bg-white/[0.1] hover:text-white/90",
        outline:
          "ring-1 ring-inset ring-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.06] hover:text-white/90",
        ghost:
          "bg-transparent text-white/55 hover:text-white/85 hover:bg-white/[0.06]",
        link: "bg-transparent text-white/55 hover:text-white/85",
        destructive: "bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/25 hover:bg-red-500/25 hover:text-red-200",
        contrast: "bg-foreground text-background hover:bg-foreground/90",
      },
      size: {
        default: "h-8 px-3.5 font-medium text-13 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-10 px-4 font-medium text-base [&_svg:not([class*='size-'])]:size-4",
        sm: "h-7 px-2.5 font-medium text-12 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-6 px-2 font-medium text-xs [&_svg:not([class*='size-'])]:size-3",
        icon: "size-8 p-0 [&_svg:not([class*='size-'])]:size-4",
        iconSm: "size-5 p-0 [&_svg:not([class*='size-'])]:size-3.5",
        iconMd: "size-7 p-0 [&_svg:not([class*='size-'])]:size-4",
        // Backward compat
        "icon-xs": "size-6 p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 p-0 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-10 p-0 [&_svg:not([class*='size-'])]:size-5",
      },
      colorVariant: {
        default: "",
        success: "",
        warning: "",
        error: "",
      },
      shape: {
        default: "",
        pill: "rounded-full",
      },
    },
    compoundVariants: [
      {
        variant: "ghost",
        size: "icon",
        className: "text-muted-foreground hover:text-foreground",
      },
      {
        variant: "ghost",
        size: "iconSm",
        className: "text-muted-foreground hover:text-foreground",
      },
      {
        variant: "ghost",
        size: "iconMd",
        className: "text-muted-foreground hover:text-foreground",
      },
      {
        variant: "outline",
        colorVariant: "success",
        className:
          "ring-green-500/40 text-green-600 hover:ring-green-500 hover:bg-green-500/10 dark:text-green-400",
      },
      {
        variant: "outline",
        colorVariant: "warning",
        className:
          "ring-amber-500/40 text-amber-600 hover:ring-amber-500 hover:bg-amber-500/10 dark:text-amber-400",
      },
      {
        variant: "outline",
        colorVariant: "error",
        className:
          "ring-red-500/40 text-red-600 hover:ring-red-500 hover:bg-red-500/10 dark:text-red-400",
      },
      {
        variant: "secondary",
        colorVariant: "success",
        className: "bg-green-500/15 text-green-600 hover:bg-green-500/25 dark:text-green-400",
      },
    ],
    defaultVariants: {
      align: "center",
      variant: "default",
      size: "default",
      colorVariant: "default",
      shape: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({
  className,
  variant = "default",
  size = "default",
  align,
  colorVariant = "default",
  shape = "default",
  asChild = false,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      aria-disabled={disabled}
      disabled={disabled}
      className={cn(
        buttonVariants({ align, variant, size, colorVariant, shape, className }),
      )}
      {...props}
    />
  );
}

export { Button, buttonVariants };
