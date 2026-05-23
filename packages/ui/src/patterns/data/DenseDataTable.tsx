import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type Table as TanStackTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useMemo, useState, type ReactNode } from "react";

/**
 * DenseDataTable — TanStack Table 8-backed dense data view
 * (spec §7, §8.3). Operator-desk-binding behaviors:
 *
 *   - density modes 28 / 32 / 36 (compact / standard / comfortable)
 *   - faceted filters (per-column unique values)
 *   - saved views (consumer-supplied; persistence belongs to the
 *     `admin-saved-views` backend service)
 *   - column manager (toggle column visibility)
 *   - bulk action bar with a `renderBulkActionConfirm` render-prop
 *     slot so the admin-app can compose `HighRiskActionGuard` into
 *     the slot without `patterns/data` importing
 *     `patterns/governance` (binding decision 1b).
 *   - peek + open-as-pane via `onPeek` / `onOpenAsPane`.
 *   - keyboard map: Enter opens, Space toggles selection.
 *   - export hook via `onExport` (the actual export call is owned by
 *     the consumer so audit + permission stay backend-owned).
 *
 * Spacing: row heights stay on the 28 / 32 / 36 ladder per spec §12;
 * no padding sum between adjacent surfaces exceeds 10px.
 */
export type DenseDataTableDensity = "compact" | "standard" | "comfortable";

const densityRowHeight: Record<DenseDataTableDensity, number> = {
  compact: 28,
  standard: 32,
  comfortable: 36,
};

export type DenseDataTableBulkAction<TRow> = {
  readonly id: string;
  readonly label: ReactNode;
  /**
   * Whether the action requires a confirmation step. When true the
   * `renderBulkActionConfirm` slot is invoked before
   * `onActivate` fires.
   */
  readonly requiresConfirm?: boolean;
  readonly onActivate: (rows: readonly TRow[]) => void;
};

export type DenseDataTableSavedView = {
  readonly id: string;
  readonly label: ReactNode;
};

export type DenseDataTableBulkActionConfirmRenderArgs<TRow> = {
  readonly action: DenseDataTableBulkAction<TRow>;
  readonly selection: readonly TRow[];
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

export type DenseDataTableProps<TRow> = {
  readonly columns: ReadonlyArray<ColumnDef<TRow, unknown>>;
  readonly data: readonly TRow[];
  readonly getRowId: (row: TRow, index: number) => string;
  readonly density?: DenseDataTableDensity;
  readonly onDensityChange?: (density: DenseDataTableDensity) => void;
  readonly bulkActions?: ReadonlyArray<DenseDataTableBulkAction<TRow>>;
  readonly renderBulkActionConfirm?: (
    args: DenseDataTableBulkActionConfirmRenderArgs<TRow>,
  ) => ReactNode;
  readonly savedViews?: ReadonlyArray<DenseDataTableSavedView>;
  readonly activeSavedViewId?: string;
  readonly onSavedViewSelect?: (viewId: string) => void;
  readonly onPeek?: (row: TRow) => void;
  readonly onOpenAsPane?: (row: TRow) => void;
  readonly onExport?: (rows: readonly TRow[]) => void;
  readonly ariaLabel?: string;
  readonly emptyState?: ReactNode;
};

type PendingConfirm<TRow> = {
  readonly action: DenseDataTableBulkAction<TRow>;
  readonly selection: readonly TRow[];
};

export function DenseDataTable<TRow>({
  columns,
  data,
  getRowId,
  density = "standard",
  onDensityChange,
  bulkActions,
  renderBulkActionConfirm,
  savedViews,
  activeSavedViewId,
  onSavedViewSelect,
  onPeek,
  onOpenAsPane,
  onExport,
  ariaLabel = "Data table",
  emptyState,
}: DenseDataTableProps<TRow>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pendingConfirm, setPendingConfirm] =
    useState<PendingConfirm<TRow> | null>(null);

  const mutableColumns = useMemo(() => [...columns], [columns]);
  const mutableData = useMemo(() => [...data], [data]);

  const table: TanStackTable<TRow> = useReactTable<TRow>({
    data: mutableData,
    columns: mutableColumns,
    state: { sorting, columnFilters, columnVisibility, rowSelection },
    getRowId: (row, index) => getRowId(row, index),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: bulkActions !== undefined && bulkActions.length > 0,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const rowHeight = densityRowHeight[density];
  const selectedRows = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);
  const allRows = table.getRowModel().rows;
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const allLeafColumns = table.getAllLeafColumns();
  const showSelection = bulkActions !== undefined && bulkActions.length > 0;

  const activateAction = (action: DenseDataTableBulkAction<TRow>): void => {
    if (
      action.requiresConfirm === true &&
      renderBulkActionConfirm !== undefined
    ) {
      setPendingConfirm({ action, selection: selectedRows });
      return;
    }
    action.onActivate(selectedRows);
  };

  return (
    <section
      role="region"
      aria-label={ariaLabel}
      data-pattern="dense-data-table"
      data-density={density}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 0,
        background: "color-mix(in oklab, var(--canvas-850) 60%, transparent)",
        border: "1px solid color-mix(in oklab, white 6%, transparent)",
        borderRadius: 8,
        padding: 6,
      }}
    >
      <div
        data-table-toolbar
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {savedViews !== undefined && savedViews.length > 0 ? (
          <div
            role="tablist"
            aria-label="Saved views"
            data-saved-views
            style={{ display: "inline-flex", gap: 4 }}
          >
            {savedViews.map((view) => {
              const active = view.id === activeSavedViewId;
              return (
                <button
                  key={view.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-saved-view={view.id}
                  data-saved-view-active={active ? "true" : "false"}
                  onClick={() => onSavedViewSelect?.(view.id)}
                  disabled={onSavedViewSelect === undefined}
                  style={{
                    height: 28,
                    paddingInline: 6,
                    background: active
                      ? "color-mix(in oklab, white 8%, transparent)"
                      : "transparent",
                    border:
                      "1px solid color-mix(in oklab, white 8%, transparent)",
                    borderRadius: 4,
                    color: "var(--fg-default)",
                    cursor:
                      onSavedViewSelect === undefined ? "default" : "pointer",
                    font: "inherit",
                    fontSize: "0.75rem",
                  }}
                >
                  {view.label}
                </button>
              );
            })}
          </div>
        ) : null}
        <div style={{ flex: 1 }} />
        {onDensityChange !== undefined ? (
          <label
            data-density-select-wrapper
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: "0.75rem",
              color: "var(--fg-muted)",
            }}
          >
            density
            <select
              data-testid="density-select"
              value={density}
              onChange={(event) => {
                const next = event.target.value as DenseDataTableDensity;
                onDensityChange(next);
              }}
              style={{
                height: 28,
                background:
                  "color-mix(in oklab, var(--slate-800) 55%, transparent)",
                border: "1px solid color-mix(in oklab, white 8%, transparent)",
                borderRadius: 4,
                color: "var(--fg-default)",
                font: "inherit",
                paddingInline: 4,
              }}
            >
              <option value="compact">compact</option>
              <option value="standard">standard</option>
              <option value="comfortable">comfortable</option>
            </select>
          </label>
        ) : null}
        <details
          data-column-manager
          style={{ position: "relative", fontSize: "0.75rem" }}
        >
          <summary
            style={{
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              paddingInline: 8,
              border: "1px solid color-mix(in oklab, white 8%, transparent)",
              borderRadius: 4,
              color: "var(--fg-default)",
              cursor: "pointer",
              listStyle: "none",
            }}
          >
            columns
          </summary>
          <div
            role="group"
            aria-label="Column visibility"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 4px)",
              padding: 6,
              background: "var(--canvas-850)",
              border: "1px solid color-mix(in oklab, white 8%, transparent)",
              borderRadius: 8,
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              minWidth: 160,
            }}
          >
            {allLeafColumns.map((column) => (
              <label
                key={column.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--fg-default)",
                }}
              >
                <input
                  type="checkbox"
                  data-column-toggle={column.id}
                  checked={column.getIsVisible()}
                  onChange={(event) =>
                    column.toggleVisibility(event.target.checked)
                  }
                />
                <span>{column.id}</span>
              </label>
            ))}
          </div>
        </details>
        {onExport !== undefined ? (
          <button
            type="button"
            data-testid="export-button"
            onClick={() => onExport(allRows.map((row) => row.original))}
            style={{
              height: 28,
              paddingInline: 8,
              background: "transparent",
              border: "1px solid color-mix(in oklab, white 8%, transparent)",
              borderRadius: 4,
              color: "var(--fg-default)",
              cursor: "pointer",
              font: "inherit",
              fontSize: "0.75rem",
            }}
          >
            export
          </button>
        ) : null}
      </div>
      {showSelection && selectedRows.length > 0 ? (
        <div
          data-bulk-action-bar
          role="toolbar"
          aria-label="Bulk actions"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: 4,
            background:
              "color-mix(in oklab, var(--canvas-900) 40%, transparent)",
            border: "1px solid color-mix(in oklab, white 6%, transparent)",
            borderRadius: 4,
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}>
            {selectedRows.length} selected
          </span>
          <div style={{ flex: 1 }} />
          {bulkActions?.map((action) => (
            <button
              key={action.id}
              type="button"
              data-bulk-action={action.id}
              onClick={() => activateAction(action)}
              style={{
                height: 28,
                paddingInline: 8,
                background: "transparent",
                border: "1px solid color-mix(in oklab, white 8%, transparent)",
                borderRadius: 4,
                color: "var(--fg-default)",
                cursor: "pointer",
                font: "inherit",
                fontSize: "0.75rem",
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      <div
        style={{
          overflow: "auto",
          minHeight: 0,
          border: "1px solid color-mix(in oklab, white 6%, transparent)",
          borderRadius: 4,
        }}
      >
        <table
          data-table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: "0.8125rem",
          }}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {showSelection ? (
                  <th
                    scope="col"
                    style={{
                      width: 28,
                      padding: 4,
                      background: "var(--canvas-900)",
                      borderBottom:
                        "1px solid color-mix(in oklab, white 6%, transparent)",
                    }}
                  >
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      data-testid="select-all"
                      checked={table.getIsAllRowsSelected()}
                      ref={(node) => {
                        if (node !== null) {
                          node.indeterminate = table.getIsSomeRowsSelected();
                        }
                      }}
                      onChange={table.getToggleAllRowsSelectedHandler()}
                    />
                  </th>
                ) : null}
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    data-header-id={header.id}
                    style={{
                      textAlign: "left",
                      padding: 4,
                      background: "var(--canvas-900)",
                      borderBottom:
                        "1px solid color-mix(in oklab, white 6%, transparent)",
                      color: "var(--fg-secondary)",
                      fontWeight: 600,
                      fontSize: "0.6875rem",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {allRows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleLeafColumns.length + (showSelection ? 1 : 0)}
                  data-table-empty
                  style={{
                    padding: 10,
                    textAlign: "center",
                    color: "var(--fg-muted)",
                  }}
                >
                  {emptyState ?? "No rows."}
                </td>
              </tr>
            ) : (
              allRows.map((row) => (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  data-row-selected={row.getIsSelected() ? "true" : "false"}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onOpenAsPane?.(row.original);
                    } else if (event.key === " ") {
                      event.preventDefault();
                      row.toggleSelected(!row.getIsSelected());
                    }
                  }}
                  onClick={() => onPeek?.(row.original)}
                  onDoubleClick={() => onOpenAsPane?.(row.original)}
                  style={{
                    height: rowHeight,
                    cursor:
                      onPeek === undefined && onOpenAsPane === undefined
                        ? "default"
                        : "pointer",
                  }}
                >
                  {showSelection ? (
                    <td style={{ padding: 4, width: 28 }}>
                      <input
                        type="checkbox"
                        aria-label={`Select row ${row.id}`}
                        data-row-select={row.id}
                        checked={row.getIsSelected()}
                        onChange={row.getToggleSelectedHandler()}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                  ) : null}
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{
                        padding: 4,
                        borderBottom:
                          "1px solid color-mix(in oklab, white 4%, transparent)",
                        color: "var(--fg-default)",
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pendingConfirm !== null && renderBulkActionConfirm !== undefined
        ? renderBulkActionConfirm({
            action: pendingConfirm.action,
            selection: pendingConfirm.selection,
            onConfirm: () => {
              pendingConfirm.action.onActivate(pendingConfirm.selection);
              setPendingConfirm(null);
            },
            onCancel: () => setPendingConfirm(null),
          })
        : null}
    </section>
  );
}
