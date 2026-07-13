# 002 — Grid reflow: transform-only transition with a strong curve

- **Status**: DONE
- **Commit**: 98344f3
- **Severity**: HIGH
- **Category**: Performance + Easing & duration
- **Estimated scope**: 1 file, ~5 lines changed
- **Depends on**: 001 (uses `var(--ease-in-out)`)

## Problem

The canvas grid reflow is the single most-seen motion in the app — it fires every time a widget window is dragged, resized, or pushed aside by a neighbor. It currently animates `width` and `height` (layout-triggering properties that force layout + paint + composite per frame, per widget, off-GPU) and uses bare `ease`, the weak built-in curve, for on-screen movement where a strong `ease-in-out` belongs.

```css
/* apps/web/src/components/canvas/canvas-grid.css:5-8 — current */
.react-grid-layout {
  position: relative;
  transition: height 200ms ease;
}

/* apps/web/src/components/canvas/canvas-grid.css:10-12 — current */
.react-grid-item {
  transition: transform 200ms ease, width 200ms ease, height 200ms ease;
}
```

Note: the container's `height` transition is nearly dead code anyway — `canvas-shell.tsx:191` pins the grid to a fixed `style={{ height }}`.

## Target

```css
/* target */
.react-grid-layout {
  position: relative;
}

.react-grid-item {
  transition: transform 200ms var(--ease-in-out);
}
```

- `transform` keeps the 200ms duration (within the movement budget) but gets the strong curve: `var(--ease-in-out)` = `cubic-bezier(0.77, 0, 0.175, 1)` (from plan 001).
- `width`/`height` are removed from the transition entirely: neighbor reflow only ever moves items (transform), so the only visible change is that the actively-resized item's box snaps to its final size on release — crisp, and consistent with the app's dashboard personality.

## Repo conventions to follow

- `var(--ease-in-out)` is emitted on `:root` by the `@theme` block added in plan 001 (`packages/ui/src/styles/globals.css`). If that token does not exist yet, STOP — plan 001 must run first.
- The during-drag/during-resize disables in the same file are correct and must stay untouched:
  ```css
  /* canvas-grid.css:14-19 — keep as-is */
  .react-grid-item.react-draggable-dragging { transition: none; ... }
  /* canvas-grid.css:21-24 — keep as-is */
  .react-grid-item.resizing { transition: none; ... }
  ```

## Steps

1. In `apps/web/src/components/canvas/canvas-grid.css`, delete the `transition: height 200ms ease;` line from `.react-grid-layout` (line 7).
2. In the same file, replace the `.react-grid-item` transition (line 11) with `transition: transform 200ms var(--ease-in-out);`.

## Boundaries

- Do NOT touch `.react-draggable-dragging`, `.resizing`, `.react-grid-placeholder`, or `.react-resizable-handle` rules.
- Do NOT change durations elsewhere or touch any `.tsx` file.
- Do NOT add new dependencies.
- If the current code doesn't match the excerpts above (drift since commit 98344f3), STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && pnpm build` succeeds.
- **Feel check** (run `pnpm dev`, http://127.0.0.1:3001, on a workspace with 3+ widgets):
  - Drag a widget across others: displaced neighbors glide aside with a confident start and soft landing (no lazy, symmetric drift), and the dropped widget settles the same way.
  - Resize a widget via its bottom-right handle: while dragging, tracking is live (no transition); on release, the resized widget's box snaps to its final size instantly while any displaced neighbors glide. If the snap-on-release reads as broken rather than crisp to the human reviewer, the approved fallback is re-adding `width 200ms var(--ease-in-out), height 200ms var(--ease-in-out)` as a documented exception — do not decide this yourself; flag it.
  - In DevTools Performance panel, record a drag-drop reflow: no layout thrash from the settle animation (transform-only compositing).
  - Toggle `prefers-reduced-motion` (DevTools Rendering panel): reflow settles effectively instantly (the global 0.01ms collapse in `globals.css:211` covers this — no per-rule work needed).
- **Done when**: both edits are in, the build passes, and drag/resize reflow visibly uses the new curve with no width/height tweening on neighbors.
