import { describe, expect, it, vi } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import {
  DenseDataTable,
  type DenseDataTableBulkAction,
} from "./DenseDataTable";
import { click, mount, press } from "../../testing/browser-test-utils";

type Row = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
};

const rows: readonly Row[] = [
  { id: "r1", name: "Acme", status: "active" },
  { id: "r2", name: "Globex", status: "drifted" },
];

const columns: ReadonlyArray<ColumnDef<Row, unknown>> = [
  { id: "name", header: "Name", accessorKey: "name" },
  { id: "status", header: "Status", accessorKey: "status" },
];

const getRowId = (row: Row): string => row.id;

describe("DenseDataTable", () => {
  it("renders rows in a region with the requested density data-attr", () => {
    const host = mount(
      <DenseDataTable
        columns={columns}
        data={rows}
        getRowId={getRowId}
        density="compact"
      />,
    );
    const region = host.querySelector("[data-pattern='dense-data-table']");
    expect(region?.getAttribute("data-density")).toBe("compact");
    expect(host.querySelectorAll("[data-row-id]")).toHaveLength(2);
  });

  it("renders the empty state when there are no rows", () => {
    const host = mount(
      <DenseDataTable columns={columns} data={[]} getRowId={getRowId} />,
    );
    expect(host.querySelector("[data-table-empty]")?.textContent).toContain(
      "No rows.",
    );
  });

  it("invokes onPeek on row click and onOpenAsPane on Enter", () => {
    const onPeek = vi.fn();
    const onOpenAsPane = vi.fn();
    const host = mount(
      <DenseDataTable
        columns={columns}
        data={rows}
        getRowId={getRowId}
        onPeek={onPeek}
        onOpenAsPane={onOpenAsPane}
      />,
    );
    const row = host.querySelector("[data-row-id='r1']") as HTMLElement;
    click(row);
    expect(onPeek).toHaveBeenCalledWith(rows[0]);
    press(row, "Enter");
    expect(onOpenAsPane).toHaveBeenCalledWith(rows[0]);
  });

  it("toggles selection with Space and surfaces the bulk action bar", () => {
    const bulkActions: ReadonlyArray<DenseDataTableBulkAction<Row>> = [
      {
        id: "archive",
        label: "Archive",
        requiresConfirm: false,
        onActivate: vi.fn(),
      },
    ];
    const host = mount(
      <DenseDataTable
        columns={columns}
        data={rows}
        getRowId={getRowId}
        bulkActions={bulkActions}
      />,
    );
    const row = host.querySelector("[data-row-id='r1']") as HTMLElement;
    press(row, " ");
    const bar = host.querySelector("[data-bulk-action-bar]");
    expect(bar?.textContent).toContain("1 selected");
  });

  it("routes confirmation-requiring bulk actions through renderBulkActionConfirm before invoking onActivate", () => {
    const onActivate = vi.fn();
    const bulkActions: ReadonlyArray<DenseDataTableBulkAction<Row>> = [
      {
        id: "purge",
        label: "Purge",
        requiresConfirm: true,
        onActivate,
      },
    ];
    const host = mount(
      <DenseDataTable
        columns={columns}
        data={rows}
        getRowId={getRowId}
        bulkActions={bulkActions}
        renderBulkActionConfirm={({
          onConfirm,
          onCancel,
          action,
          selection,
        }) => (
          <div data-testid="confirm-slot">
            <span data-testid="confirm-action">{action.id}</span>
            <span data-testid="confirm-count">{selection.length}</span>
            <button type="button" data-testid="confirm-yes" onClick={onConfirm}>
              yes
            </button>
            <button type="button" data-testid="confirm-no" onClick={onCancel}>
              no
            </button>
          </div>
        )}
      />,
    );
    const checkbox = host.querySelector(
      "[data-row-select='r1']",
    ) as HTMLInputElement;
    click(checkbox);
    const trigger = host.querySelector(
      "[data-bulk-action='purge']",
    ) as HTMLButtonElement;
    click(trigger);
    expect(host.querySelector("[data-testid='confirm-slot']")).not.toBeNull();
    expect(onActivate).not.toHaveBeenCalled();
    const confirm = host.querySelector(
      "[data-testid='confirm-yes']",
    ) as HTMLButtonElement;
    click(confirm);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]?.[0]).toEqual([rows[0]]);
  });

  it("exposes a density control and an export hook", () => {
    const onExport = vi.fn();
    const onDensityChange = vi.fn();
    const host = mount(
      <DenseDataTable
        columns={columns}
        data={rows}
        getRowId={getRowId}
        density="standard"
        onDensityChange={onDensityChange}
        onExport={onExport}
      />,
    );
    const exportButton = host.querySelector(
      "[data-testid='export-button']",
    ) as HTMLButtonElement;
    click(exportButton);
    expect(onExport).toHaveBeenCalledWith(rows);
  });
});
