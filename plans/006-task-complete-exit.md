# 006 — Give task completion an exit beat

- **Status**: DONE
- **Commit**: 98344f3
- **Severity**: LOW (additive — missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file, ~25 lines

## Problem

Completing a task is one of the few genuinely rewarding moments in the app, and today it renders as a glitch: clicking the circle fires `onComplete()`, the optimistic cache patch flips the task to `done` (`tasks.tsx:197-213`), and the card blinks out of `tasks.map` (`-board-column.tsx:44-51`) with zero transition — no acknowledgment, no exit.

```tsx
// apps/web/src/routes/_app/-task-card.tsx:80-99 — current (abridged)
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-lg border border-white/10 bg-white/5 p-2.5 transition-[background-color,border-color,transform] duration-150 cursor-grab active:cursor-grabbing active:scale-[0.98] motion-reduce:active:scale-100 pointer-fine:hover:bg-white/10 pointer-fine:hover:border-white/20 last:mb-3 ${priorityConfig.border} ${isDragging ? "opacity-30" : ""}`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          className="mt-0.5 shrink-0 text-white/25 pointer-fine:hover:text-emerald-400 transition-[color,transform] duration-150 active:scale-90 motion-reduce:active:scale-100"
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
        >
          <Circle className="size-4" />
        </button>
```

## Target

Two-beat exit, all local to `TaskCard`:

1. **Instant acknowledgment**: on click, the circle icon swaps to a filled check in emerald (`CircleCheck`, `text-emerald-400`) — zero delay, this is the reward.
2. **Brief exit**: the card fades and compresses (`opacity-0 scale-[0.98]`, 180ms, `ease-out`), then `onComplete()` fires and the optimistic removal happens off-screen.

Exact values: exit duration `180ms`, easing `ease-out` utility (strong curve via plan 001, acceptable without it), scale `0.98`, delay-before-mutation `180`ms via `setTimeout`.

```tsx
// target — inside TaskCard
  const [isCompleting, setIsCompleting] = useState(false);
  const completeTimer = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // If the card unmounts while the exit is playing (filter change, refetch),
  // still deliver the completion — never lose the click.
  useEffect(
    () => () => {
      if (completeTimer.current != null) {
        window.clearTimeout(completeTimer.current);
        onCompleteRef.current();
      }
    },
    [],
  );

  const handleComplete = () => {
    if (isCompleting) return;
    setIsCompleting(true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onComplete();
      return;
    }
    completeTimer.current = window.setTimeout(() => {
      completeTimer.current = null;
      onComplete();
    }, 180);
  };
```

```tsx
// target — card wrapper className gains a conditional exit state
      className={`rounded-lg border border-white/10 bg-white/5 p-2.5 transition-[background-color,border-color,transform] duration-150 cursor-grab active:cursor-grabbing active:scale-[0.98] motion-reduce:active:scale-100 pointer-fine:hover:bg-white/10 pointer-fine:hover:border-white/20 last:mb-3 ${priorityConfig.border} ${isDragging ? "opacity-30" : ""} ${isCompleting ? "pointer-events-none opacity-0 scale-[0.98] transition-[opacity,transform] duration-[180ms] ease-out" : ""}`}
```

```tsx
// target — the complete button
        <button
          type="button"
          className="mt-0.5 shrink-0 text-white/25 pointer-fine:hover:text-emerald-400 transition-[color,transform] duration-150 active:scale-90 motion-reduce:active:scale-100"
          onClick={(e) => {
            e.stopPropagation();
            handleComplete();
          }}
        >
          {isCompleting ? (
            <CircleCheck className="size-4 text-emerald-400" />
          ) : (
            <Circle className="size-4" />
          )}
        </button>
```

Imports to add in `-task-card.tsx`: `useEffect, useRef, useState` from `react`; `CircleCheck` added to the existing `lucide-react` import (line 4).

## Repo conventions to follow

- Reduced-motion: the repo guards motion both globally (`globals.css:211`) and per-element (`motion-reduce:` variants); the `matchMedia` early-return above keeps completion instant for reduced-motion users — matching that spirit in JS.
- Emerald as the completion color is already established: `pointer-fine:hover:text-emerald-400` on this exact button (`-task-card.tsx:92`).
- Icons come from `lucide-react` (see existing import at `-task-card.tsx:4`).

## Steps

1. In `apps/web/src/routes/_app/-task-card.tsx`, add the imports (`useEffect`, `useRef`, `useState`; `CircleCheck`).
2. Add the `isCompleting` state, refs, unmount-flush effect, and `handleComplete` shown under **Target** at the top of the `TaskCard` function body (after the `useSortable` destructure).
3. Append the `isCompleting` conditional to the card wrapper's template-literal className exactly as shown.
4. Replace the button's `onClick` body with `handleComplete()` and swap the icon per the conditional shown.

## Boundaries

- Do NOT touch `DragCard`, `TaskCardMeta`, `-board-column.tsx`, or `tasks.tsx` — the mutation/optimistic-update flow is out of scope.
- Do NOT animate the column reflow after removal (a FLIP pass is explicitly out of scope; the remaining cards may snap up).
- Do NOT animate reopen/uncomplete.
- Do NOT add new dependencies (no framer-motion, no AnimatePresence).
- If the code doesn't match the excerpts (drift since commit 98344f3), STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && pnpm build` succeeds.
- **Feel check** (run `pnpm dev`, http://127.0.0.1:3001, tasks board with several tasks):
  - Click a task's circle: the check fills green *instantly*, the card fades/settles out over ~180ms, then the list closes up. The green check must be visible before the fade reads — that ordering is the whole point.
  - Double-click the circle rapidly: exactly one completion fires (guard works).
  - In DevTools Animations panel at 10% speed: the card scales to 0.98 while fading — no movement-free "ghost blink".
  - Toggle `prefers-reduced-motion`: completion is immediate with no 180ms delay.
  - Complete a task and immediately switch board filters: the task still lands in Done (unmount-flush works).
- **Done when**: completion shows the green-check beat, exits in 180ms, never double-fires, and never loses a completion.
