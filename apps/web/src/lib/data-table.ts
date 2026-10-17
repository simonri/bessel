import {
  type ColumnDef,
  columnSizingFeature,
  type RowData,
  rowSelectionFeature,
  type Table,
  tableFeatures,
} from "@tanstack/react-table";

/** What every data table here uses: selectable rows and fixed column widths. */
export const dataTableFeatures = tableFeatures({
  rowSelectionFeature,
  columnSizingFeature,
});

export type DataTableFeatures = typeof dataTableFeatures;
export type DataColumnDef<TData extends RowData> = ColumnDef<
  DataTableFeatures,
  TData
>;
export type DataTableInstance<TData extends RowData> = Table<
  DataTableFeatures,
  TData
>;
