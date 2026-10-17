import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@bessel/ui/components/table";
import { cn } from "@bessel/ui/lib/utils";
import {
  flexRender,
  type OnChangeFn,
  type RowData,
  type RowSelectionState,
  useTable,
} from "@tanstack/react-table";
import { useMemo, useRef, useState } from "react";
import { DataTableHeader } from "@/components/data-table-header";
import {
  type DataColumnDef,
  type DataTableInstance,
  dataTableFeatures,
} from "@/lib/data-table";

// ─── Types ───────────────────────────────────────────────────────────────────

type GroupHeaderItem = { _kind: "group-header"; label: string };
type DataItem<TData> = { _kind: "data"; dataIndex: number; data: TData };
type RenderedItem<TData> = GroupHeaderItem | DataItem<TData>;

function buildRenderedItems<TData>(
  data: TData[],
  getGroupLabel?: (item: TData, prev: TData | undefined) => string | null,
): RenderedItem<TData>[] {
  if (!getGroupLabel) {
    return data.map((d, i) => ({ _kind: "data", dataIndex: i, data: d }));
  }
  const items: RenderedItem<TData>[] = [];
  for (let i = 0; i < data.length; i++) {
    const label = getGroupLabel(data[i], data[i - 1]);
    if (label !== null) items.push({ _kind: "group-header", label });
    items.push({ _kind: "data", dataIndex: i, data: data[i] });
  }
  return items;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface VirtualDataTableProps<TData extends RowData> {
  columns: DataColumnDef<TData>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  emptyMessage?: string;
  onRowLongPress?: (row: TData) => void;
  /**
   * When provided, a group header row is rendered before any data row where
   * this function returns a non-null string.
   */
  getGroupLabel?: (item: TData, prev: TData | undefined) => string | null;
  // Legacy props — no longer used, kept so callers don't break at runtime
  onEndReached?: () => void;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  estimateRowHeight?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VirtualDataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  rowSelection,
  onRowSelectionChange,
  emptyMessage = "No results.",
  onRowLongPress,
  getGroupLabel,
}: VirtualDataTableProps<TData>) {
  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId,
    onRowSelectionChange,
    state: {
      ...(rowSelection !== undefined && { rowSelection }),
    },
  });

  const { rows } = table.getRowModel();
  const renderedItems = useMemo(
    () => buildRenderedItems(data, getGroupLabel),
    [data, getGroupLabel],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]">
      <Table className="table-fixed text-13">
        <DataTableHeader
          table={table}
          className="bg-white/[0.02] [&_th]:h-9 [&_th]:px-3 [&_th]:text-11 [&_th]:font-medium [&_th]:text-white/45 [&_tr]:border-white/[0.07] [&_tr]:hover:bg-transparent"
        />
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-12 text-white/40"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            renderedItems.map((item) => {
              if (item._kind === "group-header") {
                return (
                  <tr key={`group-${item.label}`}>
                    <td
                      colSpan={columns.length}
                      className="border-b border-white/[0.05] bg-white/[0.015] px-3 pt-3 pb-1.5 text-11 font-semibold tracking-wide text-white/40"
                    >
                      {item.label}
                    </td>
                  </tr>
                );
              }

              const row = rows[item.dataIndex];
              if (!row) return null;
              return (
                <LongPressRow
                  key={row.id}
                  row={row}
                  onLongPress={
                    onRowLongPress
                      ? () => onRowLongPress(row.original)
                      : undefined
                  }
                />
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Long-press row ───────────────────────────────────────────────────────────

function LongPressRow<TData extends RowData>({
  row,
  onLongPress,
}: {
  row: ReturnType<DataTableInstance<TData>["getRowModel"]>["rows"][number];
  onLongPress?: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [pressing, setPressing] = useState(false);

  const handleTouchStart = () => {
    if (!onLongPress) return;
    setPressing(true);
    timerRef.current = setTimeout(() => {
      setPressing(false);
      onLongPress();
    }, 500);
  };

  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPressing(false);
  };

  return (
    <TableRow
      data-state={row.getIsSelected() ? "selected" : undefined}
      className={cn(
        "border-white/[0.05] text-white/80 transition-colors duration-150 hover:bg-white/[0.03] data-[state=selected]:bg-primary-500/[0.07]",
        pressing && "bg-white/[0.06]",
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      {row.getAllCells().map((cell) => (
        <TableCell key={cell.id} className="px-3 py-2">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
}
