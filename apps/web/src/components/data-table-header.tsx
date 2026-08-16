import { TableHead, TableHeader, TableRow } from "@bessel/ui/components/table";
import type { Table as TanstackTable } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";

interface DataTableHeaderProps<TData> {
  table: TanstackTable<TData>;
  className?: string;
}

export function DataTableHeader<TData>({
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
