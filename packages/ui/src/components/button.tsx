import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@metron/ui/lib/utils";

const buttonVariants = cva(
  [
    "box-border relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-md",
    "disabled:pointer-events-none disabled:opacity-50",
    "selection:text-current",
    "transition-colors duration-150",
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
          "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        outline:
          "ring-1 ring-inset ring-border bg-transparent text-foreground hover:bg-accent",
        ghost:
          "bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent",
        link: "bg-transparent text-muted-foreground hover:text-foreground",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
      },
      size: {
        default: "h-9 px-4 font-medium text-sm [&_svg:not([class*='size-'])]:size-4",
        md: "h-8 px-3 font-medium text-sm [&_svg:not([class*='size-'])]:size-3.5",
        mdDense: "h-8 px-2 font-medium text-sm [&_svg:not([class*='size-'])]:size-3.5 gap-1",
        lg: "h-10 px-4 font-medium text-base [&_svg:not([class*='size-'])]:size-4",
        sm: "h-7 px-3 font-medium text-sm [&_svg:not([class*='size-'])]:size-3",
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
      className={cn(buttonVariants({ align, variant, size, colorVariant, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
