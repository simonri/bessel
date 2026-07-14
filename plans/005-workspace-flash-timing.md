# 005 — Tighten and coordinate the workspace-flash pulse

- **Status**: DONE
- **Commit**: 98344f3
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 3 files, ~15 lines
- **Depends on**: 001 (uses `var(--ease-out)`)

## Problem

When a window is moved to another workspace, the target workspace pill flashes to show where it went (`window-manager.tsx:658`). The pulse is purposeful, but its timing is sloppy three ways:

1. The animation runs 700ms — more than 2× anything else in this crisp app (the pill's own state transition is `duration-150`).
2. The JS timer that clears the flash marker is 900ms — uncoordinated with the 700ms animation, so the class lingers 200ms dead.
3. Moving a second window to the same workspace while a flash is active does **not** re-flash: the state value doesn't change, so React never re-renders and the CSS animation never restarts.

```css
/* apps/web/src/styles.css:32-40 — current */
@keyframes workspace-flash {
  0% { box-shadow: 0 0 0 0 oklch(0.7 0.15 260 / 70%); }
  70% { box-shadow: 0 0 0 8px oklch(0.7 0.15 260 / 0%); }
  100% { box-shadow: 0 0 0 0 oklch(0.7 0.15 260 / 0%); }
}

.animate-workspace-flash {
  animation: workspace-flash 0.7s ease-out;
}
```

```tsx
// apps/web/src/components/canvas/window-manager.tsx:118-119 — current
  /** Workspace a window was just moved into, briefly set so the UI can flash it. */
  flashWorkspaceId: string | null;

// window-manager.tsx:378 — current
  const [flashWorkspaceId, setFlashWorkspaceId] = useState<string | null>(null);

// window-manager.tsx:465-469 — current
    if (!flashWorkspaceId) return;
    const t = setTimeout(() => setFlashWorkspaceId(null), 900);

// window-manager.tsx:658 — current
      setFlashWorkspaceId(targetWorkspaceId);
```

```tsx
// apps/web/src/components/canvas/workspace-switcher.tsx:189-193 — current
          <div key={ws.id} className="relative">
            <WorkspacePill
              index={i}
              isActive={isActive}
              isFlashing={flashWorkspaceId === ws.id}
```

## Target

- Animation: `animation: workspace-flash 0.5s var(--ease-out);` (500ms; `var(--ease-out)` = `cubic-bezier(0.23, 1, 0.32, 1)` from plan 001).
- Clear timer: `600` ms (animation + small margin — no dead lingering).
- Flash state carries a sequence number so repeat moves re-trigger: `{ id: string; seq: number } | null`. The pill remounts on each new `seq` (React `key`), which restarts the CSS animation from zero — correct for a one-shot attention pulse.

```tsx
// window-manager.tsx — target state shape (rename flashWorkspaceId → flashWorkspace)
  /** Workspace a window was just moved into, briefly set so the UI can flash it.
      seq increments per move so a repeat flash on the same pill restarts. */
  flashWorkspace: { id: string; seq: number } | null;

// setter at the move-to-workspace site (was line 658):
      setFlashWorkspace((prev) => ({
        id: targetWorkspaceId,
        seq: (prev?.seq ?? 0) + 1,
      }));

// clear effect (was lines 465-469):
    if (!flashWorkspace) return;
    const t = setTimeout(() => setFlashWorkspace(null), 600);
    return () => clearTimeout(t);
  }, [flashWorkspace]);
```

```tsx
// workspace-switcher.tsx — target usage
  const flashWorkspace = useFlashWorkspace();
  ...
          <div key={ws.id} className="relative">
            <WorkspacePill
              key={flashWorkspace?.id === ws.id ? `flash-${flashWorkspace.seq}` : "pill"}
              index={i}
              isActive={isActive}
              isFlashing={flashWorkspace?.id === ws.id}
```

(The outer `div` keeps `key={ws.id}`; the extra `key` on `WorkspacePill` only forces the button itself to remount per flash.)

## Repo conventions to follow

- `useFlashWorkspace()` is the consumer hook exported from `window-manager.tsx` (context provided at line 796, also spread into meta around lines 854-856). Rename the value consistently; TypeScript will surface every reference — there are only two consumer files (`window-manager.tsx` itself and `workspace-switcher.tsx`).
- Custom keyframes live in `apps/web/src/styles.css` next to their `.animate-*` class — keep them there.

## Steps

1. `apps/web/src/styles.css:39`: change `animation: workspace-flash 0.7s ease-out;` to `animation: workspace-flash 0.5s var(--ease-out);`. Leave the keyframes untouched.
2. `apps/web/src/components/canvas/window-manager.tsx`: change the state to `{ id: string; seq: number } | null` named `flashWorkspace` (state declaration at line 378, interface/comment at lines 118-119, provider at line 796, meta spread near lines 854-856), update the setter at line 658 to the increment form shown above, and change the clear timeout from `900` to `600`.
3. `apps/web/src/components/canvas/workspace-switcher.tsx`: update `useFlashWorkspace()` usage (line 181) and the pill props (line 193) per the target, adding the flash-seq `key` on `WorkspacePill`.
4. Fix any remaining TypeScript references the rename surfaces — mechanical renames only.

## Boundaries

- Do NOT change the keyframe shape/colors or the pill's other classes.
- Do NOT change when the flash fires (only the move-to-workspace site sets it).
- Do NOT touch `switchWorkspace` or workspace switching behavior.
- If line numbers have drifted from commit 98344f3 such that the excerpts can't be located, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && pnpm build` succeeds with no TypeScript errors.
- **Feel check** (run `pnpm dev`, http://127.0.0.1:3001, two workspaces):
  - Move a window to workspace 2 (via its title-bar context/menu action): pill 2 pulses once, and the pulse now reads as a quick ping rather than a slow bloom.
  - Immediately move a second window to workspace 2 while the first pulse is still visible: the pulse restarts (this was broken before).
  - Toggle `prefers-reduced-motion`: the pulse is effectively instant/invisible (global collapse covers it) but nothing errors.
- **Done when**: pulse duration is 500ms, the marker clears at 600ms, and back-to-back moves each produce a visible restart.
