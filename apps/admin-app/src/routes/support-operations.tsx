import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { createAdminAppFileRoute } from "../file-route";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
  Badge,
} from "@comvestec/ui";
import { AdminSessionRequiredState } from "../components/admin-session-required-state";
import {
  buildAdminTenantTarget,
  buildAdminTenantWorkspacePath,
} from "../lib/admin-tenant-target";
import {
  ScreenHeader,
  KpiCard,
  Tabs,
  FilterBar,
  Pagination,
  SortableTableHeader,
  useTableState,
  applyTableState,
  AlertIcon,
  ExternalIcon,
  resolveTableAriaSort,
} from "../components/ui";

const SupportIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M5.5 6a2.5 2.5 0 014.95.62c0 1.37-1.5 2.13-1.5 2.13M8 12v.5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

export const Route = createAdminAppFileRoute("/support-operations")({
  loader: () =>
    import("../lib/operational-loaders").then(
      ({ loadAdminSupportOperationsLoaderData }) =>
        loadAdminSupportOperationsLoaderData(),
    ),
  component: SupportOperations,
  pendingComponent: () => <LoadingState title="Loading support operations…" />,
});

type Tab = "cases" | "incidents" | "impersonation";

function SupportOperations() {
  const data = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>("cases");
  const casesState = useTableState<
    "caseId" | "tenant" | "status" | "priority" | "started"
  >({
    initialPageSize: 25,
    initialSortKey: "started",
    initialSortDir: "desc",
  });
  const incidentsState = useTableState<"caseId" | "status" | "expires">({
    initialPageSize: 25,
    initialSortKey: "expires",
    initialSortDir: "asc",
  });
  const sessionsState = useTableState<"caseId" | "status" | "started">({
    initialPageSize: 25,
    initialSortKey: "started",
    initialSortDir: "desc",
  });

  const cases = data.kind === "ready" ? data.cases : [];
  const incidents = data.kind === "ready" ? data.incidents : [];
  const sessions = data.kind === "ready" ? data.impersonationSessions : [];

  const openCases = useMemo(
    () =>
      cases.filter((c) => c.status === "open" || c.status === "escalated")
        .length,
    [cases],
  );
  const pendingIncidents = useMemo(
    () => incidents.filter((i) => i.status === "pending-review").length,
    [incidents],
  );
  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status === "active").length,
    [sessions],
  );

  const casesView = applyTableState(cases, casesState, {
    searchOn: (c) =>
      `${c.caseId} ${c.tenantScopeId} ${c.summary} ${c.status} ${c.priority}`,
    sortOn: {
      caseId: (c) => c.caseId,
      tenant: (c) => c.tenantScopeId,
      status: (c) => c.status,
      priority: (c) => c.priority,
      started: (c) => c.startedAt,
    },
  });
  const incidentsView = applyTableState(incidents, incidentsState, {
    searchOn: (i) => `${i.caseId} ${i.status} ${i.reason} ${i.approvedBy}`,
    sortOn: {
      caseId: (i) => i.caseId,
      status: (i) => i.status,
      expires: (i) => i.expiresAt,
    },
  });
  const sessionsView = applyTableState(sessions, sessionsState, {
    searchOn: (s) => `${s.caseId} ${s.status}`,
    sortOn: {
      caseId: (s) => s.caseId,
      status: (s) => s.status,
      started: (s) => s.startedAt,
    },
  });

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access support operations."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="Re-authenticate to access support operations."
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
        icon={<SupportIcon />}
        title="Support Operations"
        breadcrumbs={[{ label: "Operations" }, { label: "Support" }]}
        subtitle="Cases, break-glass incidents, and impersonation sessions across all tenants."
      />

      <div className="ops-bento">
        <KpiCard
          label="Open cases"
          value={openCases}
          tone={openCases > 0 ? "accent" : "neutral"}
        />
        <KpiCard
          label="Pending break-glass"
          value={pendingIncidents}
          tone={pendingIncidents > 0 ? "alert" : "good"}
          icon={pendingIncidents > 0 ? <AlertIcon /> : undefined}
        />
        <KpiCard
          label="Active impersonation"
          value={activeSessions}
          tone={activeSessions > 0 ? "warn" : "neutral"}
        />
        <KpiCard label="Total cases" value={cases.length} />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: "cases", label: "Support cases", count: cases.length },
          { value: "incidents", label: "Break-glass", count: incidents.length },
          {
            value: "impersonation",
            label: "Impersonation",
            count: sessions.length,
          },
        ]}
      />

      {tab === "cases" && (
        <div className="ops-card">
          <FilterBar
            searchValue={casesState.search}
            onSearchChange={casesState.setSearch}
            searchPlaceholder="Search by case id, tenant, or summary…"
          />
          {casesView.visible.length === 0 ? (
            <EmptyState
              title="No support cases"
              description="No support cases match the current filters."
            />
          ) : (
            <div className="ops-table-wrapper">
              <table className="ops-table">
                <thead>
                  <tr>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(casesState, "caseId")}
                      onToggle={() => casesState.toggleSort("caseId")}
                    >
                      Case ID
                    </SortableTableHeader>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(casesState, "tenant")}
                      onToggle={() => casesState.toggleSort("tenant")}
                    >
                      Tenant
                    </SortableTableHeader>
                    <th>Subject</th>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(casesState, "status")}
                      onToggle={() => casesState.toggleSort("status")}
                    >
                      Status
                    </SortableTableHeader>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(casesState, "priority")}
                      onToggle={() => casesState.toggleSort("priority")}
                    >
                      Priority
                    </SortableTableHeader>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(casesState, "started")}
                      onToggle={() => casesState.toggleSort("started")}
                    >
                      Created
                    </SortableTableHeader>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {casesView.visible.map((c) => (
                    <tr key={c.caseId}>
                      <td className="mono">{c.caseId}</td>
                      <td className="mono">
                        {c.tenantScope}:{c.tenantScopeId}
                      </td>
                      <td>{c.summary}</td>
                      <td>
                        <StatusChip
                          status={c.status}
                          variant={resolveStatusVariant(c.status)}
                        />
                      </td>
                      <td>
                        <Badge
                          variant={
                            c.priority === "high" ? "pending" : "neutral"
                          }
                        >
                          {c.priority}
                        </Badge>
                      </td>
                      <td className="mono">{c.startedAt.slice(0, 10)}</td>
                      <td>
                        {(() => {
                          const t = buildAdminTenantTarget({
                            scope: c.tenantScope,
                            scopeId: c.tenantScopeId,
                          });
                          return t === undefined ? (
                            <span className="ops-text-muted">—</span>
                          ) : (
                            <Link
                              className="ops-btn ops-btn--xs"
                              to={buildAdminTenantWorkspacePath(t)}
                            >
                              <ExternalIcon size={11} /> Open
                            </Link>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={casesState.page}
            pageSize={casesState.pageSize}
            total={casesView.total}
            onPageChange={casesState.setPage}
            onPageSizeChange={casesState.setPageSize}
          />
        </div>
      )}

      {tab === "incidents" && (
        <div className="ops-card">
          <FilterBar
            searchValue={incidentsState.search}
            onSearchChange={incidentsState.setSearch}
            searchPlaceholder="Search break-glass incidents…"
          />
          {incidentsView.visible.length === 0 ? (
            <EmptyState
              title="No break-glass incidents"
              description="No break-glass access has been recorded."
            />
          ) : (
            <div className="ops-table-wrapper">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Status</th>
                    <th>Approved by</th>
                    <th>Reason</th>
                    <th>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {incidentsView.visible.map((i) => (
                    <tr key={i.caseId}>
                      <td className="mono">{i.caseId}</td>
                      <td>
                        <StatusChip
                          status={i.status}
                          variant={resolveStatusVariant(i.status)}
                        />
                      </td>
                      <td className="mono ops-redacted">{i.approvedBy}</td>
                      <td>{i.reason}</td>
                      <td className="mono">
                        {i.expiresAt.slice(0, 19).replace("T", " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={incidentsState.page}
            pageSize={incidentsState.pageSize}
            total={incidentsView.total}
            onPageChange={incidentsState.setPage}
            onPageSizeChange={incidentsState.setPageSize}
          />
        </div>
      )}

      {tab === "impersonation" && (
        <div className="ops-card">
          <FilterBar
            searchValue={sessionsState.search}
            onSearchChange={sessionsState.setSearch}
            searchPlaceholder="Search impersonation sessions…"
          />
          {sessionsView.visible.length === 0 ? (
            <EmptyState
              title="No impersonation sessions"
              description="No operator impersonation sessions are recorded."
            />
          ) : (
            <div className="ops-table-wrapper">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Status</th>
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionsView.visible.map((s) => (
                    <tr key={s.caseId}>
                      <td className="mono">{s.caseId}</td>
                      <td>
                        <StatusChip
                          status={s.status}
                          variant={resolveStatusVariant(s.status)}
                        />
                      </td>
                      <td className="mono">
                        {s.startedAt.slice(0, 19).replace("T", " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={sessionsState.page}
            pageSize={sessionsState.pageSize}
            total={sessionsView.total}
            onPageChange={sessionsState.setPage}
            onPageSizeChange={sessionsState.setPageSize}
          />
        </div>
      )}
    </div>
  );
}
