import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  DenseDataTable,
  EmptyState,
  HighRiskActionGuard,
  PermissionDeniedState,
  StatusChip,
  type DenseDataTableBulkAction,
  type DenseDataTableBulkActionConfirmRenderArgs,
  type StatusChipTone,
} from "@comvestec/ui";
import { AdminSessionRequiredState } from "./admin-session-required-state";
import { FilterBar, KpiCard, ScreenHeader, Tabs } from "./ui";
import { tenantBulkActionReasonsFixture } from "../desk/fixtures/tenants";
import type {
  AdminTenantsDirectoryRow,
  AdminTenantsDirectoryRowStatus,
  AdminTenantsDirectoryRouteData,
} from "../lib/tenants-directory-route-data";

const statusTone: Record<AdminTenantsDirectoryRowStatus, StatusChipTone> = {
  active: "nominal",
  pending: "pending",
  suspended: "error",
};

type TenantFilter = "all" | "needs-review" | "active" | "pending" | "suspended";

export function TenantsDirectoryScreen({
  data,
}: {
  readonly data: AdminTenantsDirectoryRouteData;
}) {
  const [filter, setFilter] = useState<TenantFilter>("all");
  const [search, setSearch] = useState("");

  const columns = useMemo<
    ReadonlyArray<ColumnDef<AdminTenantsDirectoryRow, unknown>>
  >(
    () => [
      {
        id: "displayName",
        header: "Tenant",
        accessorKey: "displayName",
        cell: ({ row }) => (
          <div style={{ display: "grid", gap: 2 }}>
            <span>{row.original.displayName}</span>
            <span className="mono" style={{ opacity: 0.7 }}>
              {row.original.target.scope}:{row.original.target.scopeId}
            </span>
          </div>
        ),
      },
      {
        id: "environment",
        header: "Environment",
        accessorKey: "environment",
        enableColumnFilter: true,
        cell: (info) => info.getValue<string>(),
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        enableColumnFilter: true,
        cell: (info) => {
          const value = info.getValue<AdminTenantsDirectoryRowStatus>();
          return <StatusChip tone={statusTone[value]}>{value}</StatusChip>;
        },
      },
      {
        id: "approvalsOpen",
        header: "Open approvals",
        accessorKey: "approvalsOpen",
        cell: (info) => (
          <span className="mono">{info.getValue<number>().toString()}</span>
        ),
      },
      {
        id: "workspace",
        header: "Workspace",
        cell: ({ row }) => (
          <Link
            to="/r/tenant/$tenantId"
            params={{ tenantId: row.original.target.scopeId }}
            search={{ scope: row.original.target.scope }}
            data-testid="tenants-directory-workspace-link"
          >
            Open
          </Link>
        ),
      },
    ],
    [],
  );

  const bulkActions = useMemo<
    ReadonlyArray<DenseDataTableBulkAction<AdminTenantsDirectoryRow>>
  >(
    () => [
      {
        id: "freeze",
        label: "Freeze tenants",
        requiresConfirm: true,
        onActivate: () => {},
      },
    ],
    [],
  );

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to inspect the tenant directory."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="The operator session could not be resolved. Please re-authenticate before continuing."
        stale
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }
  if (data.kind === "error") {
    return <EmptyState title={data.title} description={data.description} />;
  }

  const counts = data.rows.reduce<
    Record<AdminTenantsDirectoryRowStatus, number>
  >(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { active: 0, pending: 0, suspended: 0 },
  );
  const approvalsOpen = data.rows.reduce(
    (sum, row) => sum + row.approvalsOpen,
    0,
  );
  const filteredRows = data.rows.filter((row) => {
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "needs-review"
          ? row.approvalsOpen > 0 || row.status !== "active"
          : row.status === filter;
    const loweredSearch = search.trim().toLowerCase();
    const matchesSearch =
      loweredSearch.length === 0
        ? true
        : [
            row.displayName,
            row.environment,
            row.status,
            row.target.scope,
            row.target.scopeId,
          ]
            .join(" ")
            .toLowerCase()
            .includes(loweredSearch);
    return matchesFilter && matchesSearch;
  });
  const needsReview = data.rows.filter(
    (row) => row.approvalsOpen > 0 || row.status !== "active",
  ).length;
  const focusedTenant =
    data.rows.find((row) => row.status === "suspended") ??
    [...data.rows].sort(
      (left, right) => right.approvalsOpen - left.approvalsOpen,
    )[0];

  return (
    <section
      data-testid="tenants-directory-ready"
      data-pattern="tenants-directory-v3"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title="Tenant Directory"
        breadcrumbs={[{ label: "Resources" }, { label: "Tenants" }]}
        subtitle={
          <>
            {data.rows.length} tenants · approvals open{" "}
            <span className="mono">{approvalsOpen}</span>
          </>
        }
      />

      <div
        data-testid="tenants-directory-posture"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard label="Total tenants" value={data.rows.length} tone="accent" />
        <KpiCard
          label="Active"
          value={counts.active}
          tone={counts.active > 0 ? "good" : "neutral"}
        />
        <KpiCard
          label="Pending"
          value={counts.pending}
          tone={counts.pending > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Suspended"
          value={counts.suspended}
          tone={counts.suspended > 0 ? "alert" : "neutral"}
        />
        <KpiCard
          label="Open approvals"
          value={approvalsOpen}
          tone={approvalsOpen > 0 ? "warn" : "neutral"}
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <section
          style={{
            display: "grid",
            gap: 6,
            padding: 8,
            border: "1px solid var(--bg-2)",
            borderRadius: 8,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Review queue</p>
          <AttentionRow label="Needs review" value={needsReview} tone="warn" />
          <AttentionRow
            label="Suspended"
            value={counts.suspended}
            tone={counts.suspended > 0 ? "alert" : "neutral"}
          />
          <AttentionRow
            label="Pending"
            value={counts.pending}
            tone={counts.pending > 0 ? "warn" : "neutral"}
          />
        </section>

        <section
          data-testid="tenants-directory-focus"
          style={{
            display: "grid",
            gap: 6,
            padding: 8,
            border: "1px solid var(--bg-2)",
            borderRadius: 8,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Focused tenant</p>
          {focusedTenant === undefined ? (
            <p className="ops-text-muted" style={{ margin: 0 }}>
              No tenant records are currently available.
            </p>
          ) : (
            <>
              <span>{focusedTenant.displayName}</span>
              <span className="mono">
                {focusedTenant.target.scope}:{focusedTenant.target.scopeId}
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <StatusChip tone={statusTone[focusedTenant.status]}>
                  {focusedTenant.status}
                </StatusChip>
                <span className="ops-text-muted">
                  Approvals open:{" "}
                  <span className="mono">{focusedTenant.approvalsOpen}</span>
                </span>
              </div>
              <div>
                <Link
                  className="ops-btn ops-btn--xs"
                  to="/r/tenant/$tenantId"
                  params={{ tenantId: focusedTenant.target.scopeId }}
                  search={{ scope: focusedTenant.target.scope }}
                >
                  Open workspace
                </Link>
              </div>
            </>
          )}
        </section>
      </div>

      <Tabs<TenantFilter>
        value={filter}
        onChange={setFilter}
        items={[
          { value: "all", label: "All", count: data.rows.length },
          { value: "needs-review", label: "Needs review", count: needsReview },
          { value: "active", label: "Active", count: counts.active },
          { value: "pending", label: "Pending", count: counts.pending },
          { value: "suspended", label: "Suspended", count: counts.suspended },
        ]}
      />

      <section
        data-testid="tenants-directory-table"
        style={{ display: "grid", gap: 8 }}
      >
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search tenants, environments, or scope ids…"
        />
        <DenseDataTable<AdminTenantsDirectoryRow>
          columns={columns}
          data={filteredRows}
          getRowId={(row) => row.key}
          bulkActions={bulkActions}
          ariaLabel="Tenant directory"
          emptyState="No tenants match the current filters."
          renderBulkActionConfirm={(
            args: DenseDataTableBulkActionConfirmRenderArgs<AdminTenantsDirectoryRow>,
          ) => (
            <HighRiskActionGuard
              action={{ id: args.action.id, label: args.action.label }}
              selection={args.selection}
              reasons={tenantBulkActionReasonsFixture}
              requireNote
              onConfirm={() => args.onConfirm()}
              onCancel={() => args.onCancel()}
              renderSelectionSummary={(selection) =>
                `${selection.length} tenant${selection.length === 1 ? "" : "s"} selected.`
              }
            />
          )}
        />
      </section>
    </section>
  );
}

function AttentionRow({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone: "neutral" | "warn" | "alert";
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        padding: 6,
        borderRadius: 8,
        border:
          tone === "alert"
            ? "1px solid rgba(255, 122, 122, 0.35)"
            : tone === "warn"
              ? "1px solid rgba(255, 203, 107, 0.35)"
              : "1px solid rgba(255, 255, 255, 0.08)",
        background:
          tone === "alert"
            ? "rgba(96, 24, 24, 0.24)"
            : tone === "warn"
              ? "rgba(98, 70, 18, 0.2)"
              : "rgba(255, 255, 255, 0.02)",
      }}
    >
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}
