import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@bessel/ui/components/table";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type OnChangeFn,
  type RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import { DataTableHeader } from "@/components/data-table-header";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  activeRowId?: string;
  emptyMessage?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  rowSelection,
  onRowSelectionChange,
  activeRowId,
  emptyMessage = "No results.",
}: DataTableProps<TData, TValue>) {
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

  return (
    <div className="rounded-md border">
      <Table className="table-fixed">
        <DataTableHeader table={table} />
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={
                  row.getIsSelected()
                    ? "selected"
                    : activeRowId && row.id === activeRowId
                      ? "selected"
                      : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
