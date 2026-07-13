# 001 — Introduce shared motion tokens (strong easing curves)

- **Status**: DONE
- **Commit**: 98344f3
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file, ~10 lines added

## Problem

The app has no shared motion tokens. Across `apps/web/src` and `packages/ui/src` there are six free-floating durations (100, 150, 200, 300, 700, 1000ms) and four keyword easings (bare `ease`, `ease-out`, `ease-in-out`, `linear`) with zero custom cubic-bezier curves anywhere. There is no single place to tune how the app feels, and every easing in use is a weak CSS built-in — too soft for deliberate UI motion.

```css
/* packages/ui/src/styles/globals.css — current: the @theme inline block (line 38)
   defines color/radius/font tokens only. No --ease-* or --duration-* tokens exist. */
@theme inline {
  --font-sans: "Geist", ui-sans-serif, system-ui, sans-serif, ...
```

## Target

Add strong custom curves as Tailwind v4 theme tokens in `packages/ui/src/styles/globals.css`. In Tailwind v4, defining `--ease-out` / `--ease-in-out` in a `@theme` block **overrides the built-in `ease-out` / `ease-in-out` utilities app-wide** and emits the values as CSS custom properties on `:root`, so raw CSS can use `var(--ease-out)` too. Current utility usage of `ease-out`/`ease-in-out` in shipped code is near-zero, so the override is safe.

```css
/* target — add AFTER the existing `@theme inline { ... }` block */

/* Motion tokens. Strong curves for deliberate UI motion; overriding the
   Tailwind defaults means `ease-out` / `ease-in-out` utilities pick these up.
   Duration convention (Tailwind numeric utilities are the scale):
   100–150ms press/hover · 150–250ms dropdowns · 200–300ms modals/windows.
   UI motion stays under 300ms. */
@theme {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
}
```

Exact values (do not approximate):
- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);` — entrances, exits, default
- `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);` — on-screen movement/morphing

## Repo conventions to follow

- Theme tokens live in `packages/ui/src/styles/globals.css`; app CSS (`apps/web/src/styles.css`) imports it on line 1. Add the new block in globals.css directly below the `@theme inline { ... }` block that ends at line 87.
- The repo already uses `@theme inline` for color tokens (globals.css:38) — the new block is a plain `@theme` (literal values, not var() references), which is the correct Tailwind v4 form for these.

## Steps

1. In `packages/ui/src/styles/globals.css`, insert the `@theme { ... }` block shown under **Target** (with its comment) between the closing `}` of `@theme inline` (line 87) and the `:root {` block (line 89).

## Boundaries

- Do NOT migrate any existing component classes or raw CSS in this plan — plans 002/005 consume these tokens.
- Do NOT add `--duration-*` theme keys; the numeric Tailwind utilities (`duration-150` etc.) remain the duration scale.
- Do NOT touch `apps/web/src/styles.css` or any `.tsx` file.
- If the file no longer matches the excerpts above (drift since commit 98344f3), STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && pnpm build` succeeds. In the built CSS (or DevTools on `pnpm dev`, http://127.0.0.1:3001), `:root` exposes `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.
- **Feel check**: none — this plan is definitional; no rendered motion should change yet (verify no visual diff on the dashboard).
- **Done when**: the two custom properties resolve on `:root` in the running app and the build passes with no other CSS diff.
