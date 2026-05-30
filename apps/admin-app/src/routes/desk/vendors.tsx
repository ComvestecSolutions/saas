import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { StateScreen, StatusChip, type StatusChipTone } from "@comvestec/ui";
import {
  platformAdapterServiceName,
  type PlatformAdapterServiceName,
  type VendorHealthAggregateEntryStatus,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import {
  FilterBar,
  KpiCard,
  Pagination,
  ScreenHeader,
  SegmentedTabs,
  SortableTableHeader,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import { formatAdminTimestamp } from "../../lib/timestamp-format";
import type { AdminVendorListRouteData } from "../../lib/vendor-list-route-data";

/**
 * `/desk/vendors` — spec-canonical Vendor Health v2 list surface
 * shipped by Phase 6 vendor + workflow operator screens commit
 * 6a (admin-app implementation plan §8.15 + §11). Consumes the
 * `vendor-list-{loader,route-data,route-server}.ts` trio gated
 * end-to-end through `resolveTrustedRequestContextFromSessionId`
 * and the `vendor-health-aggregator` platform service, and
 * renders the integrations posture keyed off the
 * `shell | stale-session | denied | error | ready`
 * discriminated union.
 *
 * The surface renders the posture KPIs (healthy / degraded /
 * unavailable counts) plus a dense per-vendor table linking out
 * to `/desk/vendor/$service` for each adapter row. Partial-failure
 * counts are surfaced as a fourth KPI tile so operators can see
 * aggregate v2 partial-failure noise without leaving the page.
 */

type VendorListStatusFilter = "all" | VendorHealthAggregateEntryStatus;
type VendorListSortKey = "service" | "status" | "latency" | "checked";

const toneByStatus: Record<VendorHealthAggregateEntryStatus, StatusChipTone> = {
  healthy: "nominal",
  degraded: "pending",
  unavailable: "error",
  unknown: "drift",
};

const kpiToneByStatus: Record<
  VendorHealthAggregateEntryStatus,
  "good" | "warn" | "alert" | "neutral"
> = {
  healthy: "good",
  degraded: "warn",
  unavailable: "alert",
  unknown: "neutral",
};

export const Route = createAdminAppFileRoute("/desk/vendors")({
  loader: () =>
    import("../../lib/vendor-list-loader").then(
      ({ loadAdminVendorListLoaderData }) => loadAdminVendorListLoaderData({}),
    ),
  component: VendorListRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading vendor posture…" />
  ),
});

function VendorListRoute() {
  const data: AdminVendorListRouteData = Route.useLoaderData();
  const [statusFilter, setStatusFilter] =
    useState<VendorListStatusFilter>("all");
  const tableState = useTableState<VendorListSortKey>({
    initialPageSize: 10,
    initialSortKey: "status",
    initialSortDir: "desc",
  });

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view vendor posture."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access vendor posture."
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

  const { aggregate } = data;
  const partialFailureByService = new Map(
    aggregate.partialFailures.map((failure) => [
      failure.serviceName,
      failure.reason,
    ]),
  );
  const counts = aggregate.entries.reduce(
    (acc, entry) => {
      acc[entry.status] += 1;
      return acc;
    },
    { healthy: 0, degraded: 0, unavailable: 0, unknown: 0 } as Record<
      VendorHealthAggregateEntryStatus,
      number
    >,
  );
  const slowVendors = aggregate.entries.filter(
    (entry) => entry.latencyMs >= 200,
  );
  const filteredEntries = aggregate.entries.filter((entry) =>
    statusFilter === "all" ? true : entry.status === statusFilter,
  );
  const { visible, total } = applyTableState(filteredEntries, tableState, {
    searchOn: (entry) =>
      [
        entry.serviceName,
        entry.status,
        entry.version ?? "",
        entry.message ?? "",
        partialFailureByService.get(entry.serviceName) ?? "",
      ].join(" "),
    sortOn: {
      service: (entry) => entry.serviceName,
      status: (entry) => entry.status,
      latency: (entry) => entry.latencyMs,
      checked: (entry) => entry.lastCheckedAt,
    },
  });
  const attentionVendor =
    aggregate.entries.find((entry) => entry.status === "unavailable") ??
    aggregate.entries.find((entry) => entry.status === "degraded") ??
    aggregate.entries[0];
  const slowestVendor = aggregate.entries.reduce<
    (typeof aggregate.entries)[number] | undefined
  >(
    (current, entry) =>
      current === undefined || entry.latencyMs > current.latencyMs
        ? entry
        : current,
    undefined,
  );
  const partialFailureLead = aggregate.partialFailures[0];

  return (
    <section
      data-testid="vendor-list-ready"
      data-pattern="vendor-list-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title="Vendor Health"
        breadcrumbs={[{ label: "Resources" }, { label: "Vendors" }]}
        subtitle={
          <>
            {aggregate.entries.length} adapters reported · correlation{" "}
            <span className="mono">{aggregate.correlationId}</span> · generated{" "}
            <span className="mono">
              {formatAdminTimestamp(aggregate.generatedAt)}
            </span>
          </>
        }
      />

      <div
        data-testid="vendor-list-posture"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard
          label="Healthy"
          value={counts.healthy.toString()}
          tone={kpiToneByStatus.healthy}
        />
        <KpiCard
          label="Degraded"
          value={counts.degraded.toString()}
          tone={counts.degraded > 0 ? kpiToneByStatus.degraded : "neutral"}
        />
        <KpiCard
          label="Unavailable"
          value={counts.unavailable.toString()}
          tone={
            counts.unavailable > 0 ? kpiToneByStatus.unavailable : "neutral"
          }
        />
        <KpiCard
          label="Partial failures"
          value={aggregate.partialFailures.length.toString()}
          tone={aggregate.partialFailures.length > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Slow vendors"
          value={slowVendors.length.toString()}
          tone={slowVendors.length > 0 ? "warn" : "neutral"}
        />
      </div>

      <div data-testid="vendor-list-watch" className="ops-insight-grid">
        <div className="ops-insight-card">
          <p className="ops-card-title">Attention vendor</p>
          <span className="text-strong">
            {attentionVendor?.serviceName ?? "All nominal"}
          </span>
          <span className="ops-secondary-text">
            {attentionVendor === undefined
              ? "No vendor entries reported."
              : `${attentionVendor.status} · ${attentionVendor.message ?? "No adapter message reported."}`}
          </span>
        </div>
        <div className="ops-insight-card">
          <p className="ops-card-title">Slowest adapter</p>
          <span className="text-strong">
            {slowestVendor?.serviceName ?? "No latency data"}
          </span>
          <span className="mono ops-secondary-text">
            {slowestVendor === undefined
              ? "n/a"
              : `${slowestVendor.latencyMs} ms p95`}
          </span>
        </div>
        <div className="ops-insight-card">
          <p className="ops-card-title">Partial failure lane</p>
          <span className="text-strong">
            {partialFailureLead?.serviceName ?? "None"}
          </span>
          <span className="ops-secondary-text">
            {partialFailureLead?.reason ??
              "No aggregate partial failures reported."}
          </span>
        </div>
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Adapter watchboard
            <span className="ops-card-head__count">{total}</span>
          </p>
        </div>

        <FilterBar
          searchValue={tableState.search}
          onSearchChange={tableState.setSearch}
          searchPlaceholder="Search services, status, message, or failure reason…"
          trailing={
            <SegmentedTabs<VendorListStatusFilter>
              ariaLabel="Vendor posture filter"
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                tableState.setPage(1);
              }}
              items={[
                { value: "all", label: "All" },
                { value: "healthy", label: "Healthy" },
                { value: "degraded", label: "Degraded" },
                { value: "unavailable", label: "Unavailable" },
                { value: "unknown", label: "Unknown" },
              ]}
            />
          }
        />

        {aggregate.entries.length === 0 ? (
          <div data-testid="vendor-list-entries-empty" style={{ padding: 10 }}>
            No vendor-health entries reported by the aggregator.
          </div>
        ) : (
          <div className="ops-table-wrapper">
            <table
              className="ops-table"
              data-testid="vendor-list-entries-table"
              data-pattern="dense-data-table"
            >
              <thead>
                <tr>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "service")}
                    onToggle={() => tableState.toggleSort("service")}
                  >
                    Service
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "status")}
                    onToggle={() => tableState.toggleSort("status")}
                  >
                    Posture
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "latency")}
                    onToggle={() => tableState.toggleSort("latency")}
                  >
                    Runtime
                  </SortableTableHeader>
                  <SortableTableHeader
                    ariaSort={resolveTableAriaSort(tableState, "checked")}
                    onToggle={() => tableState.toggleSort("checked")}
                  >
                    Last checked
                  </SortableTableHeader>
                  <th style={{ textAlign: "left", padding: 4 }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => {
                  const partialFailureReason = partialFailureByService.get(
                    entry.serviceName,
                  );

                  return (
                    <tr
                      key={entry.serviceName}
                      data-testid="vendor-list-entry-row"
                      data-service-name={entry.serviceName}
                      data-status={entry.status}
                    >
                      <td style={{ padding: 4 }}>
                        <div style={{ display: "grid", gap: 2 }}>
                          <span className="text-strong">
                            {entry.serviceName}
                          </span>
                          <span className="ops-secondary-text">
                            {entry.message ?? "No adapter message reported."}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: 4 }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <StatusChip
                            tone={toneByStatus[entry.status]}
                            size="sm"
                          >
                            {entry.status}
                          </StatusChip>
                          <span className="ops-secondary-text">
                            {partialFailureReason ??
                              "Aggregate clean for this service."}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: 4 }}>
                        <div style={{ display: "grid", gap: 2 }}>
                          <span className="mono">
                            {entry.version ?? "version n/a"}
                          </span>
                          <span className="mono ops-secondary-text">
                            {entry.latencyMs} ms p95
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: 4 }}>
                        <div style={{ display: "grid", gap: 2 }}>
                          <span className="mono">
                            {formatAdminTimestamp(entry.lastCheckedAt)}
                          </span>
                          <span className="mono ops-secondary-text">
                            Incident{" "}
                            {formatAdminTimestamp(entry.lastIncidentAt)}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: 4 }}>
                        <Link
                          className="ops-link-button"
                          to="/desk/vendor/$service"
                          params={{
                            service:
                              entry.serviceName satisfies PlatformAdapterServiceName,
                          }}
                          data-testid="vendor-list-entry-link"
                        >
                          Open detail
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
          page={tableState.page}
          pageSize={tableState.pageSize}
          total={total}
          onPageChange={tableState.setPage}
          onPageSizeChange={tableState.setPageSize}
        />
      </div>

      {aggregate.partialFailures.length > 0 ? (
        <section
          className="ops-card"
          data-testid="vendor-list-partial-failures"
        >
          <div className="ops-card-head">
            <p className="ops-card-head__title">
              Partial failures
              <span className="ops-card-head__count">
                {aggregate.partialFailures.length}
              </span>
            </p>
          </div>
          <div className="ops-activity-list">
            {aggregate.partialFailures.map((failure) => (
              <div
                key={failure.serviceName}
                className="ops-activity-item"
                data-testid="vendor-list-partial-failure-row"
                data-service-name={failure.serviceName}
              >
                <div>
                  <span className="ops-activity-module">
                    <span className="ops-dot ops-dot--error" />
                    {failure.serviceName}
                  </span>
                  <div className="ops-alert-detail">{failure.reason}</div>
                </div>
                <span className="mono">aggregate</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div
        data-testid="vendor-list-service-vocabulary"
        data-vocabulary={Object.values(platformAdapterServiceName).join(",")}
        hidden
      />
    </section>
  );
}
