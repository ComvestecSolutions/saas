import { useMemo, useState } from "react";
import { createAdminAppFileRoute } from "../file-route";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";
import { AdminSessionRequiredState } from "../components/admin-session-required-state";
import {
  ScreenHeader,
  KpiCard,
  FilterBar,
  SegmentedTabs,
  Pagination,
  SortableTableHeader,
  useTableState,
  applyTableState,
  AlertIcon,
  resolveTableAriaSort,
} from "../components/ui";
import { resolveAdminTenantTargetDisplayName } from "../lib/admin-tenant-target-display-name";

const BillingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect
      x="2"
      y="3"
      width="12"
      height="10"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <path d="M2 7h12M6 10h1M9 10h1" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

type StatusFilter = "all" | "active" | "completed" | "canceled" | "blocked";

export const Route = createAdminAppFileRoute("/billing")({
  loader: () =>
    import("../lib/operational-loaders").then(
      ({ loadAdminBillingLoaderData }) => loadAdminBillingLoaderData(),
    ),
  component: Billing,
  pendingComponent: () => <LoadingState title="Loading billing repair gaps…" />,
});

function Billing() {
  const data = Route.useLoaderData();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const tableState = useTableState<
    "job" | "tenant" | "status" | "attempts" | "scheduled"
  >({
    initialPageSize: 25,
    initialSortKey: "scheduled",
    initialSortDir: "desc",
  });

  const gaps = data.kind === "ready" ? data.gaps : [];

  const runningGaps = useMemo(
    () =>
      gaps.filter((g) => g.status === "running" || g.status === "scheduled")
        .length,
    [gaps],
  );
  const cancelledGaps = useMemo(
    () => gaps.filter((g) => g.status === "canceled").length,
    [gaps],
  );
  const repairedGaps = useMemo(
    () => gaps.filter((g) => g.status === "completed").length,
    [gaps],
  );
  const blockedGaps = useMemo(
    () => gaps.filter((g) => g.status === "blocked").length,
    [gaps],
  );

  const filtered = useMemo(() => {
    if (statusFilter === "all") return gaps;
    if (statusFilter === "active")
      return gaps.filter(
        (g) => g.status === "running" || g.status === "scheduled",
      );
    return gaps.filter((g) => g.status === statusFilter);
  }, [gaps, statusFilter]);

  const resolveGapDisplayName = (gap: (typeof gaps)[number]): string =>
    resolveAdminTenantTargetDisplayName({
      scope: gap.tenantScope,
      scopeId: gap.tenantScopeId,
    });

  const { visible, total } = applyTableState(filtered, tableState, {
    searchOn: (g) =>
      `${g.jobId} ${resolveGapDisplayName(g)} ${g.tenantScopeId} ${g.gapReason ?? ""} ${g.status}`,
    sortOn: {
      job: (g) => g.jobId,
      tenant: (g) => resolveGapDisplayName(g),
      status: (g) => g.status,
      attempts: (g) => g.attempts,
      scheduled: (g) => g.scheduledAt,
    },
  });

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator session to view billing repair gaps."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="Re-authenticate to view billing data."
        stale
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  return (
    <div className="ops-screen">
      <ScreenHeader
        icon={<BillingIcon />}
        title="Billing & Entitlements"
        breadcrumbs={[{ label: "Operations" }, { label: "Billing" }]}
        subtitle="Billing repair gap registry — read-only. Replay and cancel actions are issued from Repair Operations."
      />

      <div className="ops-bento">
        <KpiCard
          label="Active gaps"
          value={runningGaps}
          tone={runningGaps > 0 ? "alert" : "good"}
          icon={runningGaps > 0 ? <AlertIcon /> : undefined}
        />
        <KpiCard
          label="Blocked"
          value={blockedGaps}
          tone={blockedGaps > 0 ? "warn" : "neutral"}
        />
        <KpiCard label="Repaired" value={repairedGaps} tone="good" />
        <KpiCard label="Cancelled" value={cancelledGaps} />
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Repair gaps
            <span className="ops-card-head__count">{total}</span>
          </p>
        </div>

        <FilterBar
          searchValue={tableState.search}
          onSearchChange={tableState.setSearch}
          searchPlaceholder="Search by job id, tenant, or reason…"
          trailing={
            <SegmentedTabs<StatusFilter>
              ariaLabel="Status filter"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                tableState.setPage(1);
              }}
              items={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "blocked", label: "Blocked" },
                { value: "completed", label: "Repaired" },
                { value: "canceled", label: "Cancelled" },
              ]}
            />
          }
        />

        {visible.length === 0 ? (
          <EmptyState
            title="No repair gaps match"
            description="All billing events are in sync or filtered out."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  {(
                    [
                      ["job", "Job ID"],
                      ["tenant", "Tenant"],
                      ["status", "Status"],
                      ["attempts", "Attempts"],
                      ["scheduled", "Scheduled"],
                    ] as const
                  ).map(([k, label]) => (
                    <SortableTableHeader
                      key={k}
                      ariaSort={resolveTableAriaSort(tableState, k)}
                      onToggle={() => tableState.toggleSort(k)}
                      align={k === "attempts" ? "right" : undefined}
                    >
                      {label}
                    </SortableTableHeader>
                  ))}
                  <th>Gap reason</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((gap) => (
                  <tr key={gap.jobId}>
                    <td className="mono">{gap.jobId}</td>
                    <td>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="text-strong">
                          {resolveGapDisplayName(gap)}
                        </span>
                        <span
                          className="mono"
                          style={{ color: "var(--ops-text-secondary)" }}
                        >
                          {gap.tenantScopeId}
                        </span>
                      </div>
                    </td>
                    <td>
                      <StatusChip
                        status={gap.status}
                        variant={resolveStatusVariant(gap.status)}
                      />
                    </td>
                    <td className="num">{gap.attempts}</td>
                    <td className="mono">{gap.scheduledAt.slice(0, 10)}</td>
                    <td style={{ color: "var(--ops-text-secondary)" }}>
                      {gap.gapReason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={tableState.page}
          pageSize={tableState.pageSize}
          total={total}
          onPageChange={tableState.setPage}
          onPageSizeChange={tableState.setPageSize}
        />
      </div>
    </div>
  );
}
