# Animation Improvement Plans

Written by the `improve-animations` audit at commit `98344f3` (2026-07-13). Each plan is self-contained — an executor needs no other context. Run one with `improve-animations execute <plan>` or hand it to any agent.

## Plans

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [Introduce shared motion tokens](001-motion-tokens.md) | MEDIUM | DONE |
| 002 | [Grid reflow: transform-only + strong curve](002-grid-reflow-transform-only.md) | HIGH | DONE |
| 003 | [Tighten window focus transition](003-window-focus-transition.md) | MEDIUM | DONE |
| 004 | [Chrome press feedback](004-chrome-press-feedback.md) | MEDIUM | DONE |
| 005 | [Workspace-flash timing](005-workspace-flash-timing.md) | LOW | DONE |
| 006 | [Task-complete exit beat](006-task-complete-exit.md) | LOW | DONE |
| 007 | [Dashboard fade-settle on arrival](007-login-fade-settle.md) | LOW | DONE |

## Recommended execution order

1. **001** — foundation; defines `--ease-out` / `--ease-in-out` tokens the others reference.
2. **002** — highest-leverage fix; requires 001 (`var(--ease-in-out)`).
3. **003, 004** — independent, small, safe in either order (or in parallel worktrees).
4. **005** — requires 001 (`var(--ease-out)`).
5. **006, 007** — additive polish; independent. Both benefit from 001's stronger `ease-out` utility but do not require it.

## Dependencies

- 002 → 001 (hard: uses `var(--ease-in-out)`; executor must STOP if token missing)
- 005 → 001 (hard: uses `var(--ease-out)`)
- 006, 007 → 001 (soft: `ease-out` utility gets the stronger curve once 001 lands)
- 003, 004 → none

## Audit notes (context for reviewers, not executors)

- Findings deliberately **not** planned: dnd-kit's default reorder-settle tween (LOW, library default), window open/close entrance motion (declined at selection), `transition-all`/keyframe issues in shadcn components the app never imports (accordion, switch, sidebar, navigation-menu, input-otp).
- Verified already correct, do not "fix": command palette has no open/close animation (intentional, Raycast-style); all Radix popovers scale from their trigger origin; the global `prefers-reduced-motion` collapse in `globals.css:211` is a documented deliberate choice; workspace *switching* is intentionally instant and must stay that way.
