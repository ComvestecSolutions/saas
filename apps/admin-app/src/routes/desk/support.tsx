import { Schema } from "effect";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Badge,
  EmptyState,
  StateScreen,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";
import {
  supportOperationsBreakGlassIncidentStatus,
  supportOperationsCaseStatus,
  supportOperationsImpersonationSessionStatus,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import {
  buildAdminTenantTarget,
  buildAdminTenantWorkspacePath,
} from "../../lib/admin-tenant-target";
import {
  AlertIcon,
  ExternalIcon,
  FilterBar,
  KpiCard,
  Pagination,
  ScreenHeader,
  SortableTableHeader,
  Tabs,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import type {
  AdminSupportCasesInput,
  AdminSupportCasesRouteData,
} from "../../lib/support-cases-route-data";

/**
 * `/desk/support` — canonical Support & Incidents surface.
 *
 * The canonical support route now uses the denser tabbed support
 * operations model that previously only lived on the legacy
 * `/support-operations` page: searchable rosters for cases,
 * break-glass incidents, and impersonation sessions, plus posture
 * KPIs and quick pivots into tenant workspaces and incident detail.
 *
 * The route keeps the spec-canonical
 * `support-cases-{loader,route-data,route-server}` contract while
 * preserving URL-driven status filtering and selected-incident
 * focus state.
 */

const RawSearchSchema = Schema.Struct({
  caseStatus: Schema.optional(Schema.String),
  incidentStatus: Schema.optional(Schema.String),
  impersonationStatus: Schema.optional(Schema.String),
  selectedIncidentId: Schema.optional(Schema.String),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
type ReadyData = Extract<
  AdminSupportCasesRouteData,
  { readonly kind: "ready" }
>;
type Tab = "cases" | "incidents" | "impersonation";

const knownCaseStatuses = new Set<string>(
  Object.values(supportOperationsCaseStatus),
);
const knownIncidentStatuses = new Set<string>(
  Object.values(supportOperationsBreakGlassIncidentStatus),
);
const knownImpersonationStatuses = new Set<string>(
  Object.values(supportOperationsImpersonationSessionStatus),
);

const decodeLoaderInput = (raw: RawSearch): AdminSupportCasesInput => {
  const caseStatus: AdminSupportCasesInput["caseStatus"] =
    raw.caseStatus !== undefined && knownCaseStatuses.has(raw.caseStatus)
      ? (raw.caseStatus as NonNullable<AdminSupportCasesInput["caseStatus"]>)
      : undefined;
  const incidentStatus: AdminSupportCasesInput["incidentStatus"] =
    raw.incidentStatus !== undefined &&
    knownIncidentStatuses.has(raw.incidentStatus)
      ? (raw.incidentStatus as NonNullable<
          AdminSupportCasesInput["incidentStatus"]
        >)
      : undefined;
  const impersonationStatus: AdminSupportCasesInput["impersonationStatus"] =
    raw.impersonationStatus !== undefined &&
    knownImpersonationStatuses.has(raw.impersonationStatus)
      ? (raw.impersonationStatus as NonNullable<
          AdminSupportCasesInput["impersonationStatus"]
        >)
      : undefined;
  const selectedIncidentId =
    raw.selectedIncidentId !== undefined && raw.selectedIncidentId.length > 0
      ? raw.selectedIncidentId
      : undefined;

  return {
    ...(caseStatus === undefined ? {} : { caseStatus }),
    ...(incidentStatus === undefined ? {} : { incidentStatus }),
    ...(impersonationStatus === undefined ? {} : { impersonationStatus }),
    ...(selectedIncidentId === undefined ? {} : { selectedIncidentId }),
  };
};

const formatDate = (value: string): string =>
  value.slice(0, 16).replace("T", " ");

const computeMinutesUntil = (value: string): number | null => {
  const expiresAt = Date.parse(value);
  if (Number.isNaN(expiresAt)) return null;
  return Math.round((expiresAt - Date.now()) / 60_000);
};

export const Route = createAdminAppFileRoute("/desk/support")({
  validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    import("../../lib/support-cases-loader").then(
      ({ loadAdminSupportCasesLoaderData }) =>
        loadAdminSupportCasesLoaderData(decodeLoaderInput(deps.search)),
    ),
  component: SupportRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading support workspace…" />
  ),
});

function SupportRoute() {
  const data: AdminSupportCasesRouteData = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access the support workspace."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access the support workspace."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <StateScreen
        variant="denied"
        title="Access denied"
        description={data.reason}
      />
    );
  }
  if (data.kind === "error") {
    return (
      <StateScreen
        variant="5xx"
        title={data.title}
        description={data.description}
      />
    );
  }

  return <SupportReadyRoute data={data} />;
}

function SupportReadyRoute({ data }: { readonly data: ReadyData }) {
  const [tab, setTab] = useState<Tab>(
    data.selectedIncidentId === undefined ? "cases" : "incidents",
  );
  const casesState = useTableState<
    "caseId" | "tenant" | "status" | "priority" | "started" | "updated"
  >({
    initialPageSize: 25,
    initialSortKey: "updated",
    initialSortDir: "desc",
  });
  const incidentsState = useTableState<
    "caseId" | "status" | "reviewer" | "expires"
  >({
    initialPageSize: 25,
    initialSortKey: "expires",
    initialSortDir: "asc",
  });
  const sessionsState = useTableState<"caseId" | "status" | "started">({
    initialPageSize: 25,
    initialSortKey: "started",
    initialSortDir: "desc",
  });

  const openCases = useMemo(
    () =>
      data.cases.filter(
        (item) =>
          item.status === supportOperationsCaseStatus.open ||
          item.status === supportOperationsCaseStatus.escalated,
      ).length,
    [data.cases],
  );
  const escalatedCases = useMemo(
    () =>
      data.cases.filter(
        (item) => item.status === supportOperationsCaseStatus.escalated,
      ).length,
    [data.cases],
  );
  const pendingIncidents = useMemo(
    () =>
      data.incidents.filter(
        (item) =>
          item.status ===
          supportOperationsBreakGlassIncidentStatus.pendingReview,
      ).length,
    [data.incidents],
  );
  const expiringIncidents = useMemo(
    () =>
      data.incidents.filter((item) => {
        const minutes = computeMinutesUntil(item.expiresAt);
        return minutes !== null && minutes <= 1_440;
      }).length,
    [data.incidents],
  );
  const activeSessions = useMemo(
    () =>
      data.impersonationSessions.filter(
        (item) =>
          item.status === supportOperationsImpersonationSessionStatus.active,
      ).length,
    [data.impersonationSessions],
  );
  const revocationPendingSessions = useMemo(
    () =>
      data.impersonationSessions.filter(
        (item) =>
          item.status ===
          supportOperationsImpersonationSessionStatus.revocationPending,
      ).length,
    [data.impersonationSessions],
  );

  const selectedIncident = useMemo(
    () =>
      data.selectedIncidentId === undefined
        ? undefined
        : data.incidents.find(
            (item) => item.caseId === data.selectedIncidentId,
          ),
    [data.incidents, data.selectedIncidentId],
  );

  const casesView = applyTableState(data.cases, casesState, {
    searchOn: (item) =>
      `${item.caseId} ${item.tenantScope} ${item.tenantScopeId} ${item.summary} ${item.status} ${item.priority} ${item.supportAgent}`,
    sortOn: {
      caseId: (item) => item.caseId,
      tenant: (item) => `${item.tenantScope}:${item.tenantScopeId}`,
      status: (item) => item.status,
      priority: (item) => item.priority,
      started: (item) => item.startedAt,
      updated: (item) => item.lastUpdatedAt,
    },
  });
  const incidentsView = applyTableState(data.incidents, incidentsState, {
    searchOn: (item) =>
      `${item.caseId} ${item.status} ${item.approvedBy} ${item.reason}`,
    sortOn: {
      caseId: (item) => item.caseId,
      status: (item) => item.status,
      reviewer: (item) => item.approvedBy,
      expires: (item) => item.expiresAt,
    },
  });
  const sessionsView = applyTableState(
    data.impersonationSessions,
    sessionsState,
    {
      searchOn: (item) => `${item.caseId} ${item.status}`,
      sortOn: {
        caseId: (item) => item.caseId,
        status: (item) => item.status,
        started: (item) => item.startedAt,
      },
    },
  );

  return (
    <section
      className="ops-screen"
      data-testid="support-cases-ready"
      data-pattern="support-cases-v3"
    >
      <ScreenHeader
        icon={<SupportIcon />}
        title="Support & Incidents"
        breadcrumbs={[{ label: "Resources" }, { label: "Support" }]}
        subtitle="Cases, break-glass approvals, and impersonation posture in one operator workspace."
      />

      <div className="ops-bento" data-testid="support-cases-posture">
        <KpiCard
          label="Open cases"
          value={openCases}
          tone={openCases > 0 ? "accent" : "neutral"}
        />
        <KpiCard
          label="Escalations"
          value={escalatedCases}
          tone={escalatedCases > 0 ? "alert" : "neutral"}
          icon={escalatedCases > 0 ? <AlertIcon /> : undefined}
        />
        <KpiCard
          label="Pending break-glass"
          value={pendingIncidents}
          tone={pendingIncidents > 0 ? "warn" : "good"}
        />
        <KpiCard
          label="Active impersonation"
          value={activeSessions}
          tone={activeSessions > 0 ? "warn" : "neutral"}
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <section className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Attention queue</p>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <AttentionRow
              label="Escalated cases awaiting decisive action"
              value={`${escalatedCases}`}
              tone={escalatedCases > 0 ? "alert" : "neutral"}
            />
            <AttentionRow
              label="Break-glass grants expiring within 24 hours"
              value={`${expiringIncidents}`}
              tone={expiringIncidents > 0 ? "warn" : "neutral"}
            />
            <AttentionRow
              label="Impersonation sessions pending revocation"
              value={`${revocationPendingSessions}`}
              tone={revocationPendingSessions > 0 ? "warn" : "neutral"}
            />
          </div>
        </section>

        {selectedIncident === undefined ? (
          <section className="ops-card">
            <div className="ops-card-head">
              <p className="ops-card-head__title">Focused incident</p>
            </div>
            <p className="ops-text-muted">
              Open an incident from the break-glass roster to keep reviewer,
              expiry, and reason context within reach.
            </p>
          </section>
        ) : (
          <section className="ops-card">
            <div className="ops-card-head">
              <p className="ops-card-head__title">Focused incident</p>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="mono">{selectedIncident.caseId}</span>
                <StatusChip
                  status={selectedIncident.status}
                  variant={resolveStatusVariant(selectedIncident.status)}
                />
              </div>
              <p style={{ margin: 0 }}>{selectedIncident.reason}</p>
              <div style={{ display: "grid", gap: 4 }}>
                <span className="ops-text-muted">
                  Reviewer:{" "}
                  <span className="mono ops-redacted">
                    {selectedIncident.approvedBy}
                  </span>
                </span>
                <span className="ops-text-muted">
                  Expires:{" "}
                  <span className="mono">
                    {formatDate(selectedIncident.expiresAt)}
                  </span>
                </span>
              </div>
              <div>
                <Link
                  className="ops-btn ops-btn--xs"
                  to="/desk/incident/$incidentId"
                  params={{ incidentId: selectedIncident.caseId }}
                >
                  <ExternalIcon size={11} /> Open incident detail
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: "cases", label: "Support cases", count: data.cases.length },
          {
            value: "incidents",
            label: "Break-glass",
            count: data.incidents.length,
          },
          {
            value: "impersonation",
            label: "Impersonation",
            count: data.impersonationSessions.length,
          },
        ]}
      />

      {tab === "cases" ? (
        <section className="ops-card">
          <FilterBar
            searchValue={casesState.search}
            onSearchChange={casesState.setSearch}
            searchPlaceholder="Search case id, tenant, summary, or agent…"
          />
          {casesView.visible.length === 0 ? (
            <EmptyState
              title="No support cases"
              description="No cases match the current filters."
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
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(casesState, "updated")}
                      onToggle={() => casesState.toggleSort("updated")}
                    >
                      Updated
                    </SortableTableHeader>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {casesView.visible.map((item) => {
                    const target = buildAdminTenantTarget({
                      scope: item.tenantScope,
                      scopeId: item.tenantScopeId,
                    });

                    return (
                      <tr
                        key={item.caseId}
                        data-testid="support-cases-case-row"
                      >
                        <td className="mono">{item.caseId}</td>
                        <td>
                          <div style={{ display: "grid", gap: 2 }}>
                            <span>{item.tenantScope}</span>
                            <span className="mono ops-text-muted">
                              {item.tenantScopeId}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "grid", gap: 2 }}>
                            <span>{item.summary}</span>
                            <span className="ops-text-muted">
                              Agent:{" "}
                              <span className="mono ops-redacted">
                                {item.supportAgent}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <StatusChip
                            status={item.status}
                            variant={resolveStatusVariant(item.status)}
                          />
                        </td>
                        <td>
                          <Badge
                            variant={
                              item.priority === "high" ? "pending" : "neutral"
                            }
                          >
                            {item.priority}
                          </Badge>
                        </td>
                        <td className="mono">{formatDate(item.startedAt)}</td>
                        <td className="mono">
                          {formatDate(item.lastUpdatedAt)}
                        </td>
                        <td>
                          {target === undefined ? (
                            <span className="ops-text-muted">No pivot</span>
                          ) : (
                            <Link
                              className="ops-btn ops-btn--xs"
                              to={buildAdminTenantWorkspacePath(target)}
                            >
                              <ExternalIcon size={11} /> Workspace
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
        </section>
      ) : null}

      {tab === "incidents" ? (
        <section className="ops-card">
          <FilterBar
            searchValue={incidentsState.search}
            onSearchChange={incidentsState.setSearch}
            searchPlaceholder="Search incident id, reviewer, or reason…"
          />
          {incidentsView.visible.length === 0 ? (
            <EmptyState
              title="No break-glass incidents"
              description="No break-glass incidents match the current filters."
            />
          ) : (
            <div
              className="ops-table-wrapper"
              data-testid="support-cases-incidents-table"
            >
              <table className="ops-table">
                <thead>
                  <tr>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(incidentsState, "caseId")}
                      onToggle={() => incidentsState.toggleSort("caseId")}
                    >
                      Incident
                    </SortableTableHeader>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(incidentsState, "status")}
                      onToggle={() => incidentsState.toggleSort("status")}
                    >
                      Status
                    </SortableTableHeader>
                    <th>Reason</th>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(
                        incidentsState,
                        "reviewer",
                      )}
                      onToggle={() => incidentsState.toggleSort("reviewer")}
                    >
                      Reviewer
                    </SortableTableHeader>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(incidentsState, "expires")}
                      onToggle={() => incidentsState.toggleSort("expires")}
                    >
                      Expires
                    </SortableTableHeader>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {incidentsView.visible.map((item) => {
                    const isFocused = item.caseId === data.selectedIncidentId;

                    return (
                      <tr
                        key={item.caseId}
                        data-testid="support-cases-incident-row"
                        style={
                          isFocused
                            ? {
                                boxShadow:
                                  "inset 0 0 0 1px rgba(161, 170, 255, 0.45)",
                              }
                            : undefined
                        }
                      >
                        <td>
                          <div style={{ display: "grid", gap: 2 }}>
                            <span className="mono">{item.caseId}</span>
                            {isFocused ? (
                              <span className="ops-text-muted">
                                Focused incident
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <StatusChip
                            status={item.status}
                            variant={resolveStatusVariant(item.status)}
                          />
                        </td>
                        <td>{item.reason}</td>
                        <td className="mono ops-redacted">{item.approvedBy}</td>
                        <td className="mono">{formatDate(item.expiresAt)}</td>
                        <td>
                          <Link
                            className="ops-btn ops-btn--xs"
                            data-testid="support-cases-incident-link"
                            to="/desk/incident/$incidentId"
                            params={{ incidentId: item.caseId }}
                          >
                            <ExternalIcon size={11} /> Review
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
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
        </section>
      ) : null}

      {tab === "impersonation" ? (
        <section className="ops-card">
          <FilterBar
            searchValue={sessionsState.search}
            onSearchChange={sessionsState.setSearch}
            searchPlaceholder="Search impersonation sessions…"
          />
          {sessionsView.visible.length === 0 ? (
            <EmptyState
              title="No impersonation sessions"
              description="No impersonation sessions match the current filters."
            />
          ) : (
            <div className="ops-table-wrapper">
              <table className="ops-table">
                <thead>
                  <tr>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(sessionsState, "caseId")}
                      onToggle={() => sessionsState.toggleSort("caseId")}
                    >
                      Session case
                    </SortableTableHeader>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(sessionsState, "status")}
                      onToggle={() => sessionsState.toggleSort("status")}
                    >
                      Status
                    </SortableTableHeader>
                    <SortableTableHeader
                      ariaSort={resolveTableAriaSort(sessionsState, "started")}
                      onToggle={() => sessionsState.toggleSort("started")}
                    >
                      Started
                    </SortableTableHeader>
                  </tr>
                </thead>
                <tbody>
                  {sessionsView.visible.map((item) => (
                    <tr key={item.caseId}>
                      <td className="mono">{item.caseId}</td>
                      <td>
                        <StatusChip
                          status={item.status}
                          variant={resolveStatusVariant(item.status)}
                        />
                      </td>
                      <td className="mono">{formatDate(item.startedAt)}</td>
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
        </section>
      ) : null}
    </section>
  );
}

function AttentionRow({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
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
