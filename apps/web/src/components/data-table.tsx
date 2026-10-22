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
import {
  TABLE,
  TABLE_CELL,
  TABLE_EMPTY,
  TABLE_FRAME,
  TABLE_HEADER,
  TABLE_ROW,
} from "@/components/data-table-styles";
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
    <div className={TABLE_FRAME}>
      <Table className={TABLE}>
        <DataTableHeader table={table} className={TABLE_HEADER} />
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={TABLE_ROW}
                data-state={
                  row.getIsSelected()
                    ? "selected"
                    : activeRowId && row.id === activeRowId
                      ? "selected"
                      : undefined
                }
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className={TABLE_CELL}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className={TABLE_EMPTY}>
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
