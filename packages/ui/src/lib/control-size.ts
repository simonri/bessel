/**
 * The one height scale for interactive controls (buttons, selects, inputs).
 * Controls placed side by side line up when they share a size, so pick a
 * size and never pass a height class; `apps/web/src/design-system.test.ts`
 * enforces that for the shared controls.
 */
export const CONTROL_HEIGHT = {
  xs: "h-6",
  sm: "h-7",
  default: "h-8",
  lg: "h-10",
} as const;

/** Square controls (icon buttons) on the same scale. */
export const CONTROL_SQUARE = {
  xs: "size-6",
  sm: "size-7",
  default: "size-8",
  lg: "size-10",
} as const;

export type ControlSize = keyof typeof CONTROL_HEIGHT;
