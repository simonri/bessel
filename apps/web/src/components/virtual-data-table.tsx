import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@bessel/ui/components/table";
import { cn } from "@bessel/ui/lib/utils";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type OnChangeFn,
  type RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useRef, useState } from "react";

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

interface VirtualDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
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

export function VirtualDataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  rowSelection,
  onRowSelectionChange,
  emptyMessage = "No results.",
  onRowLongPress,
  getGroupLabel,
}: VirtualDataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
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
    <div className="rounded-md border">
      <Table className="table-fixed">
        <TableHeader className="bg-background sticky top-0 z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={
                    header.column.columnDef.size !== undefined
                      ? { width: header.column.columnDef.size }
                      : undefined
                  }
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            renderedItems.map((item, i) => {
              if (item._kind === "group-header") {
                return (
                  <tr key={`group-${i}`}>
                    <td
                      colSpan={columns.length}
                      className="text-muted-foreground border-b px-3 py-1.5 text-xs font-semibold"
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

function LongPressRow<TData>({
  row,
  onLongPress,
}: {
  row: ReturnType<
    ReturnType<typeof useReactTable<TData>>["getRowModel"]
  >["rows"][number];
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
      className={cn(pressing && "bg-accent")}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
}
