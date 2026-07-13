# 007 — Fade-settle the dashboard on arrival

- **Status**: DONE
- **Commit**: 98344f3
- **Severity**: LOW (additive — missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file, 1 class string

## Problem

Arriving at the dashboard is a hard cut. After login, the spinner (`login.tsx:52`) is replaced by an instant route swap into the full canvas (`login.tsx:14-18` navigates to `/`), and the entire chrome — topbar, every widget window, dock — pops into existence in a single frame. A first-run/high-emotion moment gets none of its allowed delight budget, and every cold start of the app has the same jarring appearance.

```tsx
// apps/web/src/components/canvas/canvas-shell.tsx:295 — current
      <div className="relative flex h-full flex-col pt-12 pb-10">
```

This div wraps the workspace grids; the topbar/dock siblings render below it in the same `fixed inset-0` root (line 280), and the wallpaper (`VideoWallpaper` / `img`, lines 281-293) renders behind it.

## Target

A single fade-in on the canvas content when `CanvasShell` mounts, leaving the wallpaper static behind it (so there is never a black flash — the world is already there, the UI settles onto it):

```tsx
// target
      <div className="relative flex h-full flex-col pt-12 pb-10 animate-in fade-in duration-300 ease-out">
```

Exact values: `animate-in fade-in` (tw-animate-css, opacity 0 → 1), `duration-300`, `ease-out` (strong curve `cubic-bezier(0.23, 1, 0.32, 1)` once plan 001 lands; acceptable with the default curve before that). No translate/zoom — a crisp dashboard settles, it doesn't slide in.

`CanvasShell` mounts exactly once per app load, so this plays on login arrival and on reloads — both are moments where the settle is wanted. It does NOT replay on workspace switches (those toggle `display` inside an already-mounted shell).

## Repo conventions to follow

- `animate-in fade-in duration-*` is the established entrance idiom — exemplar: `apps/web/src/routes/_app/index.tsx` uses `animate-in fade-in duration-150` for page content.
- tw-animate-css is already imported globally (`packages/ui/src/styles/globals.css:2`); no new imports needed.

## Steps

1. In `apps/web/src/components/canvas/canvas-shell.tsx` line 295, append `animate-in fade-in duration-300 ease-out` to the class string. Change nothing else.

## Boundaries

- Do NOT animate the wallpaper container, the `fixed inset-0` root, or the topbar/dock individually — the single wrapper is the whole change.
- Do NOT add translate/zoom/slide classes.
- Do NOT touch `login.tsx`.
- If line 295 doesn't match the excerpt (drift since commit 98344f3), STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && pnpm build` succeeds.
- **Feel check** (run `pnpm dev`, http://127.0.0.1:3001):
  - Hard-reload the app: the wallpaper is present immediately; the topbar, widgets, and dock fade in together over ~300ms. No black flash, no element popping ahead of the others.
  - Log out and back in (or clear session): the same settle plays on arrival from `/login`.
  - Switch workspaces repeatedly: NO fade plays (the animation must not re-trigger inside the mounted shell).
  - Toggle `prefers-reduced-motion`: content appears effectively instantly (global collapse covers it).
- **Done when**: arrival reads as the UI settling onto the wallpaper, and workspace switching remains instant.
