import { TableHead, TableHeader, TableRow } from "@bessel/ui/components/table";
import { flexRender, type RowData } from "@tanstack/react-table";
import type { DataTableInstance } from "@/lib/data-table";

interface DataTableHeaderProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  className?: string;
}

export function DataTableHeader<TData extends RowData>({
  table,
  className,
}: DataTableHeaderProps<TData>) {
  return (
    <TableHeader className={className}>
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
  );
}
