# 003 — Tighten the canvas-window focus transition

- **Status**: DONE
- **Commit**: 98344f3
- **Severity**: MEDIUM
- **Category**: Easing & duration + Performance
- **Estimated scope**: 1 file, 1 line changed

## Problem

Focusing a canvas window (which happens on every pointer-down on any window — one of the highest-frequency interactions in the app) transitions its border color over 300ms. That's double the budget for a color/state change (~125–160ms), so the focus indicator lags the exact frame the user is watching. The transition list also includes `box-shadow` even though the shadow (`shadow-2xl`) never changes between focused and unfocused states — a paint-expensive property transitioned for nothing.

```tsx
// apps/web/src/components/canvas/canvas-window.tsx:150-154 — current
      className={cn(
        glassSurface({ weight: "medium" }),
        "relative flex h-full flex-col overflow-hidden rounded-2xl border shadow-2xl transition-[border-color,box-shadow] duration-300",
        isFocused ? "border-primary-500" : "border-white/10",
      )}
```

## Target

```tsx
// target — same location, only the middle class string changes
        "relative flex h-full flex-col overflow-hidden rounded-2xl border shadow-2xl transition-[border-color] duration-150",
```

- Transition property: `border-color` only (drop `box-shadow` — it is static).
- Duration: `150` (color-change band; matches the app's dominant `duration-150`).
- No easing class: the Tailwind default easing is correct for a color change; do not add `ease-out`/`ease-in-out` here.

## Repo conventions to follow

- `duration-150` is the house duration for interactive state feedback — exemplar: `packages/ui/src/components/button.tsx:12` (`transition-[background-color,color,transform] duration-150`).
- Explicit transition property lists (`transition-[...]`) over `transition-all`, as used throughout `apps/web/src/components/canvas/`.

## Steps

1. In `apps/web/src/components/canvas/canvas-window.tsx` line 152, replace `transition-[border-color,box-shadow] duration-300` with `transition-[border-color] duration-150`. Change nothing else in the class string.

## Boundaries

- Do NOT touch the `glassSurface` call, the focused/unfocused border colors, or the title-bar markup below.
- Do NOT change any other file.
- If line 152 doesn't match the excerpt above (drift since commit 98344f3), STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && pnpm build` succeeds.
- **Feel check** (run `pnpm dev`, http://127.0.0.1:3001, two+ widgets open):
  - Click back and forth between two windows: the accent border follows the click near-instantly (crisp, not fading in lazily).
  - Rapidly alternate clicks: the border transition retargets smoothly mid-fade (CSS transition — never restarts from zero).
- **Done when**: focus border responds within ~150ms of pointer-down and no `box-shadow` appears in the element's computed `transition-property`.
