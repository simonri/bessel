import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@metron/ui/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@metron/ui/components/table";

interface VirtualDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  emptyMessage?: string;
  /** Called when the user scrolls near the bottom */
  onEndReached?: () => void;
  /** Whether more data is currently being fetched */
  isFetchingMore?: boolean;
  /** Whether there are more pages to load */
  hasMore?: boolean;
  /** Estimated height of each row in px */
  estimateRowHeight?: number;
  /** Called on long-press (touch hold) of a row */
  onRowLongPress?: (row: TData) => void;
}

const OVERSCAN = 10;
const END_REACHED_THRESHOLD = 5;

export function VirtualDataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  rowSelection,
  onRowSelectionChange,
  emptyMessage = "No results.",
  onEndReached,
  isFetchingMore,
  hasMore,
  estimateRowHeight = 41,
  onRowLongPress,
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: OVERSCAN,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Trigger onEndReached when scrolling near the bottom
  const handleEndReached = useCallback(() => {
    if (!onEndReached || !hasMore || isFetchingMore) return;
    onEndReached();
  }, [onEndReached, hasMore, isFetchingMore]);

  useEffect(() => {
    const lastVirtualRow = virtualRows[virtualRows.length - 1];
    if (!lastVirtualRow) return;
    if (lastVirtualRow.index >= rows.length - END_REACHED_THRESHOLD) {
      handleEndReached();
    }
  }, [virtualRows, rows.length, handleEndReached]);

  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  return (
    <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto rounded-md border">
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
                    : flexRender(header.column.columnDef.header, header.getContext())}
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
            <>
              {paddingTop > 0 && (
                <tr>
                  <td style={{ height: paddingTop, padding: 0, border: 0 }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <LongPressRow
                    key={row.id}
                    row={row}
                    virtualRow={virtualRow}
                    measureElement={virtualizer.measureElement}
                    onLongPress={onRowLongPress ? () => onRowLongPress(row.original) : undefined}
                  />
                );
              })}
              {paddingBottom > 0 && (
                <tr>
                  <td style={{ height: paddingBottom, padding: 0, border: 0 }} />
                </tr>
              )}
              {isFetchingMore && (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="text-muted-foreground h-10 text-center text-sm"
                  >
                    Loading more...
                  </TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function LongPressRow<TData>({
  row,
  virtualRow,
  measureElement,
  onLongPress,
}: {
  row: ReturnType<ReturnType<typeof useReactTable<TData>>["getRowModel"]>["rows"][number];
  virtualRow: { index: number };
  measureElement: (el: HTMLElement | null) => void;
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
      ref={measureElement}
      data-index={virtualRow.index}
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
