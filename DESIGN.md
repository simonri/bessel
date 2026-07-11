# Design System

Reference for UI/design decisions. Check this before making visual changes.

---

## Principles

Apple's three design tenets apply here directly:

1. **Clarity.** Text is legible at every size. Icons are precise and unambiguous. Decoration that doesn't carry meaning is removed. The interface gets out of the way of the content.

2. **Deference.** The UI exists to present data, not to show off. Surfaces are quiet. Colour, weight, and motion are used sparingly so that when they do appear they carry signal.

3. **Depth.** Hierarchy is expressed through typography scale and whitespace — not through shadows, gradients, or nested containers. Every layer must justify its existence.

---

## Don't / Do

### Icon containers (the "fake avatar" problem)

```tsx
// DON'T
<div className="flex size-8 items-center justify-center rounded-full bg-muted">
  <span className="size-3 rounded-full" style={{ backgroundColor: cat.color }} />
</div>

// DO
<span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
```

### Status badges

```tsx
// DON'T
<span className="rounded-full px-2 py-0.5 text-xs bg-amber-500/10 text-amber-500">Want to go</span>

// DO
<span className="text-xs text-muted-foreground">Want to go</span>
```

### State toggles

```tsx
// DON'T — four visual layers for a binary state
<span className="border-primary/20 bg-primary/10 text-primary inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium">
  <Briefcase className="size-3" /> Business
</span>

// DO — icon colour change is sufficient
<Briefcase className="size-3.5 text-foreground" />       // active
<Briefcase className="size-3.5 text-muted-foreground/25" /> // inactive
```

### Card overuse

```tsx
// DON'T — every section in a Card creates "everything is a box"
<Card><CardHeader>…</CardHeader><CardContent><Chart /></CardContent></Card>
<Card><CardHeader>…</CardHeader><CardContent><List /></CardContent></Card>

// DO — sections that are not peers of each other flow on the page background
<section className="space-y-3">
  <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
    Recent transactions
  </h3>
  <List />
</section>
```

### Stats grids

```tsx
// DON'T — four identical cards with tiny label + big bold number
<div className="grid grid-cols-4 gap-4">
  <Card><p className="text-xs">Accounts</p><p className="text-2xl font-bold">4</p></Card>
  …
</div>

// DO — inline strip, no card chrome, only include stats that are actionable
<div className="flex gap-8">
  <div>
    <p className="text-xs uppercase tracking-widest text-muted-foreground">Net worth</p>
    <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">1 234 567 SEK</p>
  </div>
</div>
```

### Hardcoded colours

```tsx
// DON'T
className="text-green-600 dark:text-green-400"
color="oklch(0.72 0.17 142)"

// DO
className="text-[var(--color-income)]"
color="var(--color-income)"
```

---

## Loading states

**No skeleton loaders.** Skeletons are grey placeholders that communicate "there will be something here soon, but we don't know what" — they are a UI fidget spinner. They also pulse with animation, which adds motion where there is no content.

Instead:

- **Prefer fast.** Use React Query's `placeholderData: keepPreviousData` so paginating between pages shows the previous page while the next loads — zero visible loading state.
- **When data is absent, show nothing.** Let the layout render with its headings and structure; data slots fill in when ready.
- **When data arrives, fade it in.** Wrap data-dependent sections in `animate-in fade-in duration-150` so content appears gracefully rather than snapping in.
- **For initial page load only**, show a single centered `<Loader2 className="animate-spin size-4 text-muted-foreground" />` if the wait exceeds ~300ms. Hide it on arrival.

```tsx
// Pattern for a data section
<section className="space-y-3">
  <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
    Transactions
  </h3>
  {data && (
    <div className="animate-in fade-in duration-150">
      {/* content */}
    </div>
  )}
</section>
```

---

## Charts

**No charts.** A bar chart that conveys "you spent more in March than February" is worse than a sentence that says so. Charts optimised for dashboard aesthetics rarely earn the space they consume.

What to use instead:

- **A well-typeset number.** `−4 320 SEK` in `text-[var(--color-expense)]` at `text-2xl font-semibold` is more readable than a bar.
- **A single percentage.** `+12% vs last month` in muted text below the number gives trend without visual noise.
- **A sparkline** — if a directional trend is genuinely valuable, a minimal SVG path with no axes or labels is sufficient. No grid, no tooltip, no legend. See the Stocks app.
- **A plain list sorted by value.** For category spending, a sorted list of `Category — Amount` rows with a thin proportional bar (1–2px) below each row communicates the same information as a donut chart without the visual overhead.

If a chart is added in future, the standard applies: no grid lines, no axis labels unless essential, no legend, no tooltip chrome.

---

## Colour tokens

All colours via CSS variables in `packages/ui/src/styles/globals.css`. No Tailwind palette names, no raw `oklch()` in component files.

### Dark theme philosophy

The app is dark-mode only. The dark palette uses a **cool blue-grey hue (265°)** with very low chroma (0.006) throughout all surfaces. This makes the theme feel intentional rather than "grey default".

Key decisions, and why:
- **Background `oklch(0.162 0.006 265)`** — slightly lighter than pitch black. Pure black (`oklch(0.145)`) kills surface hierarchy and reads as a rendering error.
- **Foreground `oklch(0.93 0.005 265)`** — 93% lightness, not 99%. Near-white text on near-black is the single biggest cause of eye strain in dark UIs. The 6% reduction is imperceptible at a glance but makes sustained reading comfortable.
- **Card `oklch(0.215 0.006 265)`** — clear visible separation from background. The old value (0.205) was only 0.04 lightness away; cards were invisible.
- **Muted-foreground `oklch(0.60 0.004 265)`** — secondary text needs to be readable, not decorative. The old value (0.708) was fine; reduced slightly for contrast ratio.
- **Border `14% opacity`** — structure should be visible. 10% opacity borders disappear on most monitors.
- **Shared hue (265°)** — surfaces, text, and borders all lean the same cool-grey direction. Mix of different neutral hues (some warm, some cool) is what makes a dark theme look "off".

Do not "fix" the dark theme by raising contrast. Higher contrast is not better contrast.

### Core tokens

| Token | Use |
|-------|-----|
| `background` / `foreground` | Page background and default text |
| `card` / `card-foreground` | Card backgrounds |
| `muted` / `muted-foreground` | Subtle backgrounds, secondary text, timestamps |
| `border` | Dividers, input borders |
| `primary` / `primary-foreground` | Interactive states, active indicators |
| `destructive` | Delete, error — irreversible actions only |
| `chart-1` | Blue — first chart series, also used for categorical badges (e.g. Business) |

### Semantic tokens

```css
--income   /* credit, positive, gain — green */
--expense  /* debit, negative, loss  — orange-red */
```

Referenced via `text-income`, `text-expense` Tailwind utilities (wired through `@theme inline`).

**Colour means something here. Never break this mapping:**
- `--income` = money in
- `--expense` = money out
- `chart-1` = first categorical label / blue accent
- `primary` = interactive / selected — not for data encoding
- `destructive` = irreversible delete only
- No other semantic colour use. Nothing is "amber" or "violet" because it looks nice.

### Badges

Use filled badges (`bg-chart-1 text-white`) for categorical labels on data rows. Tinted/semi-transparent badges look washed out in dark mode.

```tsx
// DON'T — tinted, washes out in dark
<span className="bg-chart-1/10 text-chart-1 border border-chart-1/30">Business</span>

// DO — solid fill, readable in both modes
<span className="inline-flex items-center rounded bg-chart-1 px-1.5 py-px text-[10px] font-semibold text-white">
  Business
</span>
```

---

## Typography

Font: **Geist** (loaded in `__root.tsx`). Geist is to Bessel what San Francisco is to iOS — neutral, precise, designed for data.

### Scale

| Use | Class |
|-----|-------|
| Page title | `text-2xl font-semibold tracking-tight` |
| Section label | `text-xs font-medium uppercase tracking-widest text-muted-foreground` |
| Hero number (net worth) | `text-3xl font-semibold tracking-tight tabular-nums` |
| Data number (balance, amount) | `text-base font-medium tabular-nums` |
| Body / table cells | `text-sm` |
| Secondary text | `text-xs text-muted-foreground` |
| Monetary amounts | add `font-mono tabular-nums` |

The **section label** pattern — `text-xs uppercase tracking-widest text-muted-foreground` — is the closest thing to an iOS table section header. It creates clear visual rhythm without requiring a Card border.

`font-bold` is reserved for emphasis within a paragraph. For numerical data, `font-semibold` or `font-medium` at the right size is cleaner.

---

## Motion

Apple's guideline: motion should feel physical, purposeful, and quick. It should never draw attention to itself.

- **Fade in** on content arrival: `animate-in fade-in duration-150`
- **Transition on interactive elements**: `transition-colors duration-150` (buttons, links, rows)
- **No bounce, no spring, no decorative loops.** `ease-out` for entrances, `ease-in` for exits.
- **Never animate layout.** Height changes, reflows — let them be instant.
- No `animate-pulse` (skeleton pattern we don't use), no `animate-bounce`, no `animate-ping`.

---

## Spacing

Base unit: 4px.

| Context | Value |
|---------|-------|
| Between major page sections | `space-y-10` |
| Heading → content within a section | `space-y-3` |
| Between sibling cards in a grid | `gap-2` or `gap-3` |
| Table row vertical padding | `py-3` minimum — data needs room |
| Page padding | `p-4 md:p-6` |

Whitespace is not empty space. Density is an enemy of clarity. If something feels cramped, add space before adding visual chrome.

---

## Surfaces and depth

Depth is expressed through **typography scale and whitespace**, not shadows or borders.

- `shadow-none` on Cards unless the card floats above content (modal, popover)
- `border` on Cards: keep at default (`border-border`) — it's already subtle
- Never stack `border` + `shadow` + background colour change on the same element
- Popovers and dropdowns: `shadow-md` is the maximum
- No `backdrop-blur` inside page content — only on floating elements (mobile nav bar)

### When to use `<Card>`

Cards are for genuinely peer elements that benefit from visual grouping as a set — account balance tiles in a 2×4 grid, for example. Not for wrapping every section on a page.

---

## Components

### Empty states

No giant icon, no background container, no marketing copy. Text is sufficient.

```tsx
<Empty className="border">
  <EmptyMedia>
    <ArrowLeftRight className="size-8 text-muted-foreground/40" />
  </EmptyMedia>
  <EmptyHeader>
    <EmptyTitle>No transactions</EmptyTitle>
    <EmptyDescription>Import a bank export to get started.</EmptyDescription>
  </EmptyHeader>
</Empty>
```

Do **not** use `variant="icon"` on `EmptyMedia` — it wraps the icon in `bg-muted rounded-lg` (the fake-avatar pattern).

### Tables

- Rows: `py-3` minimum vertical padding — give data room
- Separators: `divide-y` — thin `border-border` lines, not full boxes per row
- Numbers: right-aligned, `font-mono tabular-nums`
- Empty cell: `—` (em-dash), not empty string, not `null`, not `N/A`

### Forms / inputs

- Labels above inputs, `text-sm font-medium`
- Inline validation only at the boundary (`onBlur`), not on every keystroke
- Auto-focus the first field when a dialog opens

### Icons

| Context | Size |
|---------|------|
| Navigation | `size-5` |
| Button | `size-4` |
| Inline / cell | `size-3` or `size-3.5` |
| Empty state | `size-8 text-muted-foreground/40` |

Icon-only buttons: always include `title` or `aria-label`. Never wrap icons in background containers — use colour to express state.

---

## What we never do

- Skeleton loaders (`animate-pulse` grey bars)
- Charts (Recharts, D3, or otherwise)
- `rounded-full` background containers around icons or dots
- Hardcoded Tailwind palette colours (`text-amber-500`, `bg-green-500/10`)
- Raw `oklch()` / hex literals in component files
- `shadow-lg` inside page content
- Four-card stat grids with tiny grey labels
- `<Card>` wrapping every content section
- `variant="icon"` on `EmptyMedia`
- `animate-bounce`, `animate-ping`, `animate-pulse`
- `font-bold` on numerical data
- Decorative motion (transitions that serve no informational purpose)
