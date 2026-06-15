# UX/UI Improvement Plan

Edit this file before asking Claude to start working. Remove items you don't want, reorder, add notes.
Items are grouped by tier (ROI order). Check off as done.

---

## Tier 1 — Quick fixes (clearly wrong right now)

- [x] **Remove dead "Reports" nav link** — replaced with a real Reports page (Tier 3 built).

- [x] **Add "Business" filter to filter popover** — added as a toggle button in the new inline filter bar. Also added `is_business` filter param to the backend list endpoint.

- [x] **Fix chart colors to use CSS variables** — defined `--color-income` and `--color-expense` in `globals.css`; dashboard and reports charts now reference `var(--color-income)` / `var(--color-expense)`.

---

## Tier 2 — Medium investment, high payoff

- [x] **Net worth hero on dashboard** — net worth computed per currency and shown as `text-4xl font-bold` above account cards. Account cards slimmed to a compact strip.

- [x] **Date grouping in transaction list** — `VirtualDataTable` upgraded to support mixed group-header / data rows via `getGroupLabel` prop. Transaction rows now grouped under "Today", "Yesterday", "Mon, May 12" sticky headers. Date column removed.

- [x] **Persist transaction filters to URL** — replaced `useState` with TanStack Router `validateSearch` + `useNavigate`. Filters survive navigation and browser back.

- [x] **Simplify filter UI to inline bar** — `TransactionFiltersBar` replaces the two-panel popover. Horizontal bar with: Search input, Account multi-select, Category multi-select, Direction 3-toggle, Business toggle, Date range dropdown.

- [x] **Fix empty states across all pages** — dashboard, transactions, investments (Holdings/Trades/Securities), and tasks now use the `Empty` component with icon + title + description + CTA. Loading states use shimmer `Skeleton` instead of "Loading..." text.

- [x] **Add category + account to dashboard recent transactions** — each row now shows: category color dot in a circle, category name (or "Uncategorized"), and the transaction description.

- [x] **Business badge: use semantic token instead of hardcoded blue** — `business-cell.tsx` now uses `bg-primary/10 text-primary border-primary/20`.

- [x] **Hide overflow columns on mobile in transaction table** — Account, Business, and Actions columns hidden at `sm:` breakpoint via `hidden sm:block / hidden sm:flex`.

- [x] **Portfolio allocation chart in Investments** — donut chart added above the Holdings table, grouped by `asset_type`. Shows legend with value per type. Uses `var(--chart-N)` CSS variables.

- [x] **Drag-and-drop in Tasks board** — `@dnd-kit/core` installed. `TaskCard` is draggable, `BoardColumn` is droppable. Dropping fires `PATCH /tasks/{id}` with updated status. Visual highlight on drop target.

---

## Tier 3 — Bigger rebuilds

- [x] **Reports page** — `/reports` route built. Shows: 4 quick-stat cards (accounts, total transactions, business count, personal count), 12-month Income & Expenses bar chart, spending-by-category donut + bar breakdown with month picker.

- [x] **Bulk re-categorize by selection** — "Categorize" popover added to bulk action bar in transactions. Fires `PATCH /v1/transactions/bulk`. Backend endpoint added.

- [x] **Consistent `formatMoney` utility** — `apps/web/src/lib/money.ts` created with `formatMoney(cents, currency)`, `formatAmount(cents)`, `formatQuantity(microUnits)`. Used in dashboard, transactions, and investments.
