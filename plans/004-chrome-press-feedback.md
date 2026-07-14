# 004 — Add the house press feedback to chrome buttons

- **Status**: DONE
- **Commit**: 98344f3
- **Severity**: MEDIUM
- **Category**: Physicality & origin (cohesion)
- **Estimated scope**: 4 files, 8 class strings

## Problem

The app's convention for pressable elements is a subtle press-scale with a reduced-motion guard — `Button` (`packages/ui/src/components/button.tsx:12`, `active:scale-[0.97]`), dock buttons (`canvas-dock.tsx:56,141`, `active:scale-95`), task cards (`-task-card.tsx:86,92`). But the frequently-pressed topbar/switcher chrome buttons have hover color feedback only and no press response, so the chrome feels dead compared to the dock one row below it.

Current code at every affected site:

```tsx
// apps/web/src/components/canvas/canvas-topbar.tsx:97 (logs button) — current
"flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70",

// apps/web/src/components/canvas/canvas-topbar.tsx:108 (settings button) — current
"flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70",

// apps/web/src/components/canvas/canvas-topbar.tsx:121 (close button) — current
className="flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-red-400"

// apps/web/src/components/canvas/avatar-menu.tsx:25 — current
className="flex items-center justify-center rounded p-0.5 text-white/40 transition-colors hover:text-white/70"

// apps/web/src/components/canvas/notification-bell.tsx:59 — current
<button className="relative flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70">

// apps/web/src/components/canvas/workspace-switcher.tsx:44 (workspace pill) — current
"flex h-6 min-w-6 items-center justify-center rounded text-xs font-medium transition-colors duration-150",

// apps/web/src/components/canvas/workspace-switcher.tsx:68 (new-workspace + trigger) — current
className="flex h-6 w-6 items-center justify-center rounded text-white/25 transition-colors hover:bg-white/[0.08] hover:text-white/60"

// apps/web/src/components/canvas/workspace-switcher.tsx:139 (align button) — current
className="flex h-6 w-6 items-center justify-center rounded text-white/25 transition-colors hover:bg-white/[0.08] hover:text-white/60"
```

## Target

Every site gains `active:scale-95 motion-reduce:active:scale-100`, and its `transition-colors` widens to an explicit list including `transform`. Exact replacements:

```tsx
// canvas-topbar.tsx:97 and :108 — target
"flex items-center justify-center rounded p-1 text-white/40 transition-[color,transform] duration-150 hover:text-white/70 active:scale-95 motion-reduce:active:scale-100",

// canvas-topbar.tsx:121 — target
className="flex items-center justify-center rounded p-1 text-white/40 transition-[color,transform] duration-150 hover:text-red-400 active:scale-95 motion-reduce:active:scale-100"

// avatar-menu.tsx:25 — target
className="flex items-center justify-center rounded p-0.5 text-white/40 transition-[color,transform] duration-150 hover:text-white/70 active:scale-95 motion-reduce:active:scale-100"

// notification-bell.tsx:59 — target
<button className="relative flex items-center justify-center rounded p-1 text-white/40 transition-[color,transform] duration-150 hover:text-white/70 active:scale-95 motion-reduce:active:scale-100">

// workspace-switcher.tsx:44 — target
"flex h-6 min-w-6 items-center justify-center rounded text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-95 motion-reduce:active:scale-100",

// workspace-switcher.tsx:68 and :139 — target
className="flex h-6 w-6 items-center justify-center rounded text-white/25 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.08] hover:text-white/60 active:scale-95 motion-reduce:active:scale-100"
```

Values: scale `0.95` (matches the dock, the closest sibling chrome), duration `150`, default easing (no easing class — press feedback at this size doesn't need one).

## Repo conventions to follow

- Exemplar to imitate exactly: `apps/web/src/components/canvas/canvas-dock.tsx:141` — `transition-[background-color,color,transform] duration-150 active:scale-95 motion-reduce:active:scale-100`.
- Every press-scale in this repo carries `motion-reduce:active:scale-100`; never add one without it.
- Explicit `transition-[...]` property lists, never `transition-all`.

## Steps

1. `apps/web/src/components/canvas/canvas-topbar.tsx`: apply the target strings at lines 97, 108, and 121.
2. `apps/web/src/components/canvas/avatar-menu.tsx`: apply the target string at line 25.
3. `apps/web/src/components/canvas/notification-bell.tsx`: apply the target string at line 59.
4. `apps/web/src/components/canvas/workspace-switcher.tsx`: apply the target strings at lines 44, 68, and 139.

## Boundaries

- Do NOT touch popover/menu *rows* (e.g. `workspace-switcher.tsx:84+`, dropdown items) — hover-highlight without press-scale is correct for list rows.
- Do NOT change markup, handlers, or any non-class code.
- Do NOT modify `button.tsx` or `canvas-dock.tsx` (they are already correct).
- If a class string doesn't match its excerpt (drift since commit 98344f3), STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && pnpm build` succeeds.
- **Feel check** (run `pnpm dev`, http://127.0.0.1:3001):
  - Press and hold each edited button (settings, logs, avatar, bell, workspace pills, `+`, align): it compresses slightly (~5%) while held and springs back on release — same feel as pressing a dock button.
  - The scale must feel subtle; if any button visibly "jumps", the wrong scale value was applied.
  - Toggle `prefers-reduced-motion` (DevTools Rendering panel): pressing no longer scales, but hover color feedback remains.
- **Done when**: all 8 sites press-compress identically to the dock exemplar and the reduced-motion guard verifiably disables the scale.
