import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@bessel/ui/components/table";
import {
  flexRender,
  type OnChangeFn,
  type RowData,
  type RowSelectionState,
  useTable,
} from "@tanstack/react-table";
import { DataTableHeader } from "@/components/data-table-header";
import { type DataColumnDef, dataTableFeatures } from "@/lib/data-table";

interface DataTableProps<TData extends RowData> {
  columns: DataColumnDef<TData>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  activeRowId?: string;
  emptyMessage?: string;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  rowSelection,
  onRowSelectionChange,
  activeRowId,
  emptyMessage = "No results.",
}: DataTableProps<TData>) {
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
                {row.getAllCells().map((cell) => (
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
