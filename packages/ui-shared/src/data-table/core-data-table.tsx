"use client";

import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrIncludesSome,
  filterFn_equalsString,
  filterFn_includesString,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type Column,
  type ColumnDef,
  type Row,
  type RowData,
  type Table as TanStackTable,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, SearchIcon, XIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { cn } from "../lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

/** Per-column presentation and toolbar-filter metadata, typed through the feature registry. */
export interface CoreColumnMeta {
  /** Label for the toolbar filter (defaults to the column id). */
  label?: string;
  align?: "start" | "end";
  /** Renders a toolbar control writing this column's filter value. */
  filter?: { kind: "text"; placeholder?: string } | { kind: "select"; options: readonly FilterOption[] };
}

/** The headless TanStack Table v9 feature set every `<CoreDataTable />` registers. */
export const coreTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime, text: sortFn_text },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString, equalsString: filterFn_equalsString, arrIncludesSome: filterFn_arrIncludesSome },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
  columnVisibilityFeature,
  columnMeta: metaHelper<CoreColumnMeta>(),
});

export type CoreTableFeatures = typeof coreTableFeatures;
export type CoreColumnDef<TData extends RowData, TValue = unknown> = ColumnDef<CoreTableFeatures, TData, TValue>;
export type CoreRow<TData extends RowData> = Row<CoreTableFeatures, TData>;
export type CoreTable<TData extends RowData> = TanStackTable<CoreTableFeatures, TData>;

/** Typed column helper bound to the core feature registry: `createCoreColumnHelper<Row>().accessor("id", …)`. */
export const createCoreColumnHelper = <TData extends RowData>() => createColumnHelper<CoreTableFeatures, TData>();

/** Leading checkbox column wired to the row-selection feature (Shift-click selects ranges). */
export function selectionColumn<TData extends RowData>(): CoreColumnDef<TData> {
  return createCoreColumnHelper<TData>().display({
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows on page"
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
        onClick={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onClick={row.getToggleSelectedHandler()}
      />
    ),
  });
}

export interface SelectionContext<TData extends RowData> {
  selectedRows: TData[];
  clearSelection: () => void;
}

export interface CoreDataTableProps<TData extends RowData, TValue> {
  /** Must be referentially stable (module scope or `useMemo`). */
  columns: CoreColumnDef<TData, TValue>[];
  /** Pass query data straight through; never mirror it into local state. */
  data: TData[];
  getRowId: (row: TData) => string;
  /** Adds a leading checkbox column and enables the selection toolbar. */
  enableRowSelection?: boolean | ((row: CoreRow<TData>) => boolean);
  searchPlaceholder?: string;
  pageSize?: number;
  emptyMessage?: string;
  /** Bulk actions rendered when one or more rows are selected. */
  renderSelectionActions?: (ctx: SelectionContext<TData>) => ReactNode;
  /** Extra toolbar content (right side). */
  toolbar?: ReactNode;
}

const PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * Column defs are invariant in `TValue` (accessors produce it, renderers consume it), but the
 * table instance only needs a homogeneous array; erase the per-column value type at this boundary.
 */
function toTableColumns<TData extends RowData, TValue>(columns: CoreColumnDef<TData, TValue>[]): CoreColumnDef<TData>[] {
  return columns as unknown as CoreColumnDef<TData>[];
}

/**
 * High-density generic data grid: shadcn/ui table markup driven by TanStack Table v9 headless
 * state, with client-side sorting, per-column + global filtering, pagination and row selection.
 */
export function CoreDataTable<TData extends RowData, TValue>({
  columns,
  data,
  getRowId,
  enableRowSelection = false,
  searchPlaceholder = "Search…",
  pageSize = 25,
  emptyMessage = "No results.",
  renderSelectionActions,
  toolbar,
}: CoreDataTableProps<TData, TValue>) {
  const allColumns = useMemo(
    () => (enableRowSelection ? [selectionColumn<TData>(), ...toTableColumns(columns)] : toTableColumns(columns)),
    [columns, enableRowSelection],
  );

  const table = useTable({
    features: coreTableFeatures,
    columns: allColumns,
    data,
    getRowId,
    enableRowSelection,
    globalFilterFn: "includesString",
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const filterColumns = table.getAllLeafColumns().filter((column) => column.columnDef.meta?.filter);
  const isFiltered = table.state.columnFilters.length > 0 || Boolean(table.state.globalFilter);
  const { pageIndex, pageSize: currentPageSize } = table.state.pagination;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const firstRow = filteredCount === 0 ? 0 : pageIndex * currentPageSize + 1;
  const lastRow = Math.min(filteredCount, (pageIndex + 1) * currentPageSize);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search all columns"
            placeholder={searchPlaceholder}
            value={typeof table.state.globalFilter === "string" ? table.state.globalFilter : ""}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            className="h-7 w-56 pl-7 text-xs"
          />
        </div>
        {filterColumns.map((column) => (
          <ColumnFilter key={column.id} column={column} />
        ))}
        {isFiltered ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              table.resetColumnFilters();
              table.setGlobalFilter("");
            }}
          >
            Reset <XIcon />
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {selectedRows.length > 0 && renderSelectionActions ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-0.5 text-xs">
              <span className="font-medium tabular-nums">{selectedRows.length} selected</span>
              {renderSelectionActions({ selectedRows, clearSelection: () => table.resetRowSelection() })}
            </div>
          ) : null}
          {toolbar}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(header.column.columnDef.meta?.align === "end" && "text-right")}
                    aria-sort={
                      header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase hover:bg-muted hover:text-foreground",
                          header.column.columnDef.meta?.align === "end" && "flex-row-reverse",
                        )}
                      >
                        <table.FlexRender header={header} />
                        <SortIcon direction={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(cell.column.columnDef.meta?.align === "end" && "text-right")}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={table.getAllLeafColumns().length} className="h-16 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="tabular-nums">
          {firstRow}–{lastRow} of {filteredCount}
          {filteredCount !== data.length ? ` (filtered from ${data.length})` : ""}
          {enableRowSelection ? ` · ${selectedRows.length} selected` : ""}
        </div>
        <div className="flex items-center gap-2">
          <span>Rows</span>
          <Select value={String(currentPageSize)} onValueChange={(value) => table.setPageSize(Number(value))}>
            <SelectTrigger size="sm" aria-label="Rows per page" className="h-7 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)} className="text-xs">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="tabular-nums">
            Page {pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
          </span>
          <div className="flex items-center gap-0.5">
            <Button variant="outline" size="icon-xs" aria-label="First page" onClick={() => table.firstPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronsLeftIcon />
            </Button>
            <Button variant="outline" size="icon-xs" aria-label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeftIcon />
            </Button>
            <Button variant="outline" size="icon-xs" aria-label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRightIcon />
            </Button>
            <Button variant="outline" size="icon-xs" aria-label="Last page" onClick={() => table.lastPage()} disabled={!table.getCanNextPage()}>
              <ChevronsRightIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc") return <ArrowUpIcon className="size-3" />;
  if (direction === "desc") return <ArrowDownIcon className="size-3" />;
  return <ArrowUpDownIcon className="size-3 opacity-40" />;
}

const ALL = "__all__";

function ColumnFilter<TData extends RowData>({ column }: { column: Column<CoreTableFeatures, TData, unknown> }) {
  const meta = column.columnDef.meta;
  const filter = meta?.filter;
  const value = column.getFilterValue();
  const label = meta?.label ?? column.id;
  if (!filter) return null;
  if (filter.kind === "text") {
    return (
      <Input
        aria-label={`Filter ${label}`}
        placeholder={filter.placeholder ?? label}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => column.setFilterValue(event.target.value || undefined)}
        className="h-7 w-40 text-xs"
      />
    );
  }
  return (
    <Select
      value={typeof value === "string" ? value : ALL}
      onValueChange={(next) => column.setFilterValue(next === ALL ? undefined : next)}
    >
      <SelectTrigger size="sm" aria-label={`Filter ${label}`} className="h-7 min-w-32 text-xs">
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} className="text-xs">
          All
        </SelectItem>
        {filter.options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-xs">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
