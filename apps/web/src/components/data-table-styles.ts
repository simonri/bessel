// One look for every table in the app, so a list of trades and a list of
// transactions read the same: 12px medium headers, 13px cells.
export const TABLE_FRAME =
  "overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]";
export const TABLE = "table-fixed text-13";
export const TABLE_HEADER =
  "bg-white/[0.02] [&_th]:h-9 [&_th]:px-3 [&_th]:type-label [&_th]:text-white/45 [&_tr]:border-white/[0.07] [&_tr]:hover:bg-transparent";
export const TABLE_ROW =
  "border-white/[0.05] text-white/80 transition-colors duration-150 hover:bg-white/[0.03] data-[state=selected]:bg-primary-500/[0.07]";
export const TABLE_CELL = "px-3 py-2";
export const TABLE_EMPTY = "h-24 text-center type-caption text-white/40";
export const TABLE_GROUP =
  "border-b border-white/[0.05] bg-white/[0.015] px-3 pt-3 pb-1.5 type-label text-white/50";
