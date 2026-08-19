import { cn } from "@bessel/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { CopyImageContextMenu, copyImageWithFeedback } from "./copy-image";

export function MarkdownImage({
  src,
  alt,
  className,
  imageClassName,
}: {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
}) {
  const wrapperRef = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    if (!selected) return;
    const clearSelection = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setSelected(false);
      }
    };
    document.addEventListener("pointerdown", clearSelection);
    return () => document.removeEventListener("pointerdown", clearSelection);
  }, [selected]);

  const select = () => {
    setSelected(true);
    wrapperRef.current?.focus({ preventScroll: true });
  };

  return (
    <CopyImageContextMenu src={src}>
      <button
        type="button"
        ref={wrapperRef}
        data-selected={selected ? "true" : undefined}
        onPointerDown={select}
        onContextMenu={select}
        onKeyDown={(event) => {
          if (
            selected &&
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === "c"
          ) {
            event.preventDefault();
            void copyImageWithFeedback(src);
          }
        }}
        className={cn(
          "not-prose my-4 inline-block max-w-full rounded border-0 bg-transparent p-0 align-middle outline-none",
          className,
          selected &&
            "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          draggable={false}
          className={cn("max-w-full rounded", imageClassName)}
        />
      </button>
    </CopyImageContextMenu>
  );
}
