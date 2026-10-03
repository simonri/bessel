import { useLayoutEffect, useState } from "react";

export const PLACEMENT_GAP = 8;
export const VIEWPORT_PADDING = 12;

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Placement {
  side: "right" | "left";
  /** Offset of the popover's top from the anchor's top. */
  alignOffset: number;
}

/** Beside the anchor (right if it fits, else left), vertically centred on the
 *  anchor's visible part and kept inside the viewport. */
export function placeBeside(
  anchor: Box,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): Placement {
  const fitsRight =
    anchor.right + PLACEMENT_GAP + size.width <=
    viewport.width - VIEWPORT_PADDING;
  const fitsLeft = anchor.left - PLACEMENT_GAP - size.width >= VIEWPORT_PADDING;
  const side = fitsRight || !fitsLeft ? "right" : "left";

  const visibleTop = Math.max(anchor.top, 0);
  const visibleBottom = Math.min(anchor.bottom, viewport.height);
  const middle =
    visibleBottom > visibleTop
      ? (visibleTop + visibleBottom) / 2
      : (anchor.top + anchor.bottom) / 2;
  const lowest = viewport.height - VIEWPORT_PADDING - size.height;
  const top = Math.max(
    VIEWPORT_PADDING,
    Math.min(middle - size.height / 2, lowest),
  );
  return { side, alignOffset: Math.round(top - anchor.top) };
}

/** Placement worked out once per anchor and content size, so the popover
 *  then scrolls with its event instead of sliding to stay on screen. */
export function useFixedPlacement(
  anchor: HTMLElement | null,
  content: HTMLElement | null,
): Placement | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [placement, setPlacement] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    if (!content) return;
    const measure = () =>
      setSize((current) =>
        current?.width === content.offsetWidth &&
        current.height === content.offsetHeight
          ? current
          : { width: content.offsetWidth, height: content.offsetHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [content]);

  useLayoutEffect(() => {
    if (!anchor || !size) return;
    setPlacement(
      placeBeside(anchor.getBoundingClientRect(), size, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [anchor, size]);

  return placement;
}
