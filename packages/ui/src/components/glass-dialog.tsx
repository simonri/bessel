"use client";

import * as React from "react";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@bessel/ui/lib/utils";
import { glassSurface } from "@bessel/ui/lib/glass";

function GlassDialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="glass-dialog" {...props} />;
}

function GlassDialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="glass-dialog-portal" {...props} />;
}

function GlassDialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="glass-dialog-close" {...props} />;
}

function GlassDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="glass-dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  );
}

function GlassDialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  return (
    <GlassDialogPortal>
      <GlassDialogOverlay />
      <DialogPrimitive.Content
        data-slot="glass-dialog-content"
        className={cn(
          glassSurface({ weight: "medium" }),
          "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 shadow-2xl outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="glass-dialog-close"
            className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors pointer-fine:hover:bg-white/5 pointer-fine:hover:text-white/60"
          >
            <XIcon className="size-3.5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </GlassDialogPortal>
  );
}

function GlassDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="glass-dialog-title"
      className={cn("text-15 font-semibold text-white/90", className)}
      {...props}
    />
  );
}

function GlassDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="glass-dialog-description"
      className={cn("text-xs text-white/50", className)}
      {...props}
    />
  );
}

export {
  GlassDialog,
  GlassDialogClose,
  GlassDialogContent,
  GlassDialogDescription,
  GlassDialogOverlay,
  GlassDialogPortal,
  GlassDialogTitle,
};
