import { useState, type CSSProperties } from "react";
import { StateScreen, StatusChip, type StatusChipTone } from "@comvestec/ui";
import { adminOrganizationAuditAction } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import {
  FilterBar,
  KpiCard,
  Pagination,
  ScreenHeader,
  SegmentedTabs,
  ShieldIcon,
  SortableTableHeader,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import type { AdminAuditRouteData } from "../../lib/admin-audit-route-data";

/**
 * `/admin/audit` — spec-canonical admin-organization-scoped
 * audit feed surface shipped by Phase 7 admin-org screens
 * commit 7b-2-audit (admin-app implementation plan §11).
 * Consumes the `admin-audit-{loader,route-data,route-server}`
 * trio backed by the Phase 7a-1
 * `queryAdminOrganizationScopedAuditEventsFromEnvironment`
 * helper, which pins the underlying audit query to
 * `platformModuleId.adminOrganization` so the route cannot
 * widen scope.
 *
 * Distinct from `/r/audit` (the cross-module Audit Log v2
 * filter rail / live-tail surface) — this surface is
 * narrowly scoped to admin-organization activity (member
 * invites, invitation redemption, role changes, member
 * removal, owner seeding) so admin-org owners get a focused
 * review feed without having to filter the full audit stream.
 */
export const Route = createAdminAppFileRoute("/admin/audit")({
  loader: async () => {
    const { loadAdminAuditLoaderData } =
      await import("../../lib/admin-audit-loader");
    return loadAdminAuditLoaderData({});
  },
  component: AdminAuditRoute,
  pendingComponent: () => (
    <StateScreen
      variant="loading"
      title="Loading admin organization audit feed…"
    />
  ),
});

type ReadyAdminAuditRouteData = Extract<
  AdminAuditRouteData,
  { readonly kind: "ready" }
>;
type AdminAuditEvent = ReadyAdminAuditRouteData["events"][number];
type AdminAuditCorrelationFilter = "all" | "correlated" | "standalone";
type AdminAuditSortKey =
  | "recorded"
  | "action"
  | "target"
  | "actor"
  | "correlation";
type AdminAuditActionFilter = "all" | AdminAuditEvent["action"];

const buildAuditFilterButtonStyle = (active: boolean) =>
  ({
    padding: "4px 8px",
    borderRadius: 999,
    border: active
      ? "1px solid color-mix(in oklab, var(--ops-accent, #7dd3fc) 42%, transparent)"
      : "1px solid var(--ops-border, rgba(255,255,255,0.12))",
    background: active
      ? "color-mix(in oklab, var(--ops-accent, #7dd3fc) 16%, transparent)"
      : "color-mix(in oklab, var(--ops-surface-2, rgba(255,255,255,0.03)) 88%, transparent)",
    color: "var(--ops-text-primary, inherit)",
    cursor: "pointer",
    fontSize: "0.74rem",
    fontWeight: 700,
  }) satisfies CSSProperties;

const auditInsightCardStyle = {
  display: "grid",
  gap: 4,
  padding: 8,
  borderRadius: 12,
  border: "1px solid var(--ops-border, rgba(255,255,255,0.12))",
  background:
    "color-mix(in oklab, var(--ops-surface-2, rgba(255,255,255,0.03)) 88%, transparent)",
} satisfies CSSProperties;

const secondaryTextStyle = {
  color: "var(--ops-text-secondary, rgba(255,255,255,0.7))",
} satisfies CSSProperties;

const capitalizeWord = (value: string): string =>
  value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);

const humanizeToken = (value: string): string =>
  value
    .split(/[\s._:-]+/g)
    .filter((part) => part.length > 0)
    .map((part) => capitalizeWord(part))
    .join(" ");

const formatAuditTimestamp = (value: string): string =>
  value.slice(0, 16).replace("T", " ");

const pluralize = (
  count: number,
  singular: string,
  plural = `${singular}s`,
): string => (count === 1 ? singular : plural);

const resolveAuditActionLabel = (action: AdminAuditEvent["action"]): string => {
  switch (action) {
    case adminOrganizationAuditAction.memberInvited:
      return "Member invited";
    case adminOrganizationAuditAction.invitationRedeemed:
      return "Invitation redeemed";
    case adminOrganizationAuditAction.memberRoleChanged:
      return "Member role changed";
    case adminOrganizationAuditAction.memberRemoved:
      return "Member removed";
    case adminOrganizationAuditAction.ownerSeeded:
      return "Owner seeded";
    default:
      return humanizeToken(action.replace(/^admin-organization\./, ""));
  }
};

const resolveAuditActionTone = (
  action: AdminAuditEvent["action"],
): StatusChipTone => {
  switch (action) {
    case adminOrganizationAuditAction.memberInvited:
      return "success";
    case adminOrganizationAuditAction.invitationRedeemed:
      return "nominal";
    case adminOrganizationAuditAction.memberRoleChanged:
      return "pending";
    case adminOrganizationAuditAction.memberRemoved:
      return "error";
    case adminOrganizationAuditAction.ownerSeeded:
      return "drift";
    default:
      return "drift";
  }
};

const resolveAuditScopeLabel = (
  scope: AdminAuditEvent["tenantScope"],
): string => humanizeToken(scope);

function AdminAuditRoute() {
  const data: AdminAuditRouteData = Route.useLoaderData();
  const [correlationFilter, setCorrelationFilter] =
    useState<AdminAuditCorrelationFilter>("all");
  const [actionFilter, setActionFilter] =
    useState<AdminAuditActionFilter>("all");
  const tableState = useTableState<AdminAuditSortKey>({
    initialPageSize: 10,
    initialSortKey: "recorded",
    initialSortDir: "desc",
  });

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view the admin organization audit feed."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access the admin organization audit feed."
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

  const { events } = data;
  const uniqueActorCount = new Set(events.map((event) => event.actorId)).size;
  const uniqueTargetCount = new Set(events.map((event) => event.target)).size;
  const correlatedCount = events.filter(
    (event) => event.correlationId !== undefined,
  ).length;
  const reasonAttachedCount = events.filter(
    (event) => event.reason !== undefined,
  ).length;
  const missingCorrelationCount = events.length - correlatedCount;
  const missingReasonCount = events.length - reasonAttachedCount;
  const availableActions = Array.from(
    new Set(events.map((event) => event.action)),
  );
  const latestEvent = events.reduce<AdminAuditEvent | undefined>(
    (latest, event) =>
      latest === undefined || event.timestamp > latest.timestamp
        ? event
        : latest,
    undefined,
  );
  const actorCounts = new Map<string, number>();
  for (const event of events) {
    actorCounts.set(event.actorId, (actorCounts.get(event.actorId) ?? 0) + 1);
  }
  const busiestActor = Array.from(actorCounts.entries()).reduce<
    { readonly actorId: string; readonly count: number } | undefined
  >((current, [actorId, count]) => {
    if (current === undefined || count > current.count) {
      return { actorId, count };
    }
    return current;
  }, undefined);
  const targetCounts = new Map<
    string,
    {
      readonly target: string;
      readonly count: number;
      readonly tenantScope: AdminAuditEvent["tenantScope"];
      readonly tenantScopeId: string;
    }
  >();
  for (const event of events) {
    const existing = targetCounts.get(event.target);
    targetCounts.set(event.target, {
      target: event.target,
      count: (existing?.count ?? 0) + 1,
      tenantScope: event.tenantScope,
      tenantScopeId: event.tenantScopeId,
    });
  }
  const hottestTarget = Array.from(targetCounts.values()).reduce<
    | {
        readonly target: string;
        readonly count: number;
        readonly tenantScope: AdminAuditEvent["tenantScope"];
        readonly tenantScopeId: string;
      }
    | undefined
  >((current, target) => {
    if (current === undefined || target.count > current.count) {
      return target;
    }
    return current;
  }, undefined);
  const filteredEvents = events.filter((event) => {
    if (
      correlationFilter === "correlated" &&
      event.correlationId === undefined
    ) {
      return false;
    }
    if (
      correlationFilter === "standalone" &&
      event.correlationId !== undefined
    ) {
      return false;
    }
    if (actionFilter !== "all" && event.action !== actionFilter) {
      return false;
    }
    return true;
  });
  const { visible, total } = applyTableState(filteredEvents, tableState, {
    searchOn: (event) =>
      [
        resolveAuditActionLabel(event.action),
        event.action,
        event.actorId,
        event.target,
        event.tenantScope,
        event.tenantScopeId,
        event.correlationId ?? "",
        event.reason ?? "",
      ].join(" "),
    sortOn: {
      recorded: (event) => event.timestamp,
      action: (event) => resolveAuditActionLabel(event.action),
      target: (event) => event.target,
      actor: (event) => event.actorId,
      correlation: (event) => event.correlationId ?? event.eventId,
    },
  });

  return (
    <section
      data-testid="admin-audit-ready"
      data-pattern="admin-audit-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        icon={<ShieldIcon />}
        title="Admin organization audit feed"
        breadcrumbs={[
          { label: "Admin" },
          { label: "Audit", href: "/admin/audit" },
        ]}
        subtitle="Focused internal governance stream for admin-organization membership and ownership lifecycle activity."
      />

      <div
        data-testid="admin-audit-kpis"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard
          label="Recorded events"
          value={events.length}
          tone={events.length > 0 ? "good" : "neutral"}
        />
        <KpiCard
          label="Actors"
          value={uniqueActorCount}
          tone={uniqueActorCount > 1 ? "good" : "neutral"}
        />
        <KpiCard
          label="Correlated"
          value={correlatedCount}
          tone={missingCorrelationCount > 0 ? "warn" : "good"}
        />
        <KpiCard
          label="Reason attached"
          value={reasonAttachedCount}
          tone={missingReasonCount > 0 ? "warn" : "good"}
        />
        <KpiCard
          label="Targets touched"
          value={uniqueTargetCount}
          tone={uniqueTargetCount > 0 ? "neutral" : "warn"}
        />
      </div>

      {missingCorrelationCount > 0 || missingReasonCount > 0 ? (
        <div
          data-testid="admin-audit-quality-alert"
          style={{
            padding: 8,
            borderRadius: 12,
            border:
              "1px solid var(--status-pending-border, rgba(245,158,11,0.35))",
            background:
              "color-mix(in oklab, var(--status-pending-bg, rgba(245,158,11,0.16)) 80%, transparent)",
            color: "var(--ops-text-primary, inherit)",
          }}
        >
          {missingCorrelationCount > 0 ? (
            <>
              {missingCorrelationCount}{" "}
              {pluralize(missingCorrelationCount, "event")} missing a
              correlation id.
            </>
          ) : null}{" "}
          {missingReasonCount > 0 ? (
            <>
              {missingReasonCount} {pluralize(missingReasonCount, "event")}
              missing a reason attachment.
            </>
          ) : null}
        </div>
      ) : null}

      <div
        data-testid="admin-audit-focus"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 6,
        }}
      >
        <div style={auditInsightCardStyle}>
          <p className="ops-card-title">Latest event</p>
          <span className="text-strong">
            {latestEvent === undefined
              ? "No admin events"
              : resolveAuditActionLabel(latestEvent.action)}
          </span>
          <span style={secondaryTextStyle}>
            {latestEvent === undefined
              ? "Audit stream is currently empty."
              : latestEvent.target}
          </span>
          {latestEvent !== undefined ? (
            <span className="mono" style={secondaryTextStyle}>
              {formatAuditTimestamp(latestEvent.timestamp)}
            </span>
          ) : null}
        </div>

        <div style={auditInsightCardStyle}>
          <p className="ops-card-title">Primary actor</p>
          <span className="text-strong">
            {busiestActor === undefined
              ? "No actor activity"
              : busiestActor.actorId}
          </span>
          <span style={secondaryTextStyle}>
            {busiestActor === undefined
              ? "No actors recorded yet."
              : `${busiestActor.count} ${pluralize(busiestActor.count, "event")} authored`}
          </span>
        </div>

        <div style={auditInsightCardStyle}>
          <p className="ops-card-title">Hot target</p>
          <span className="text-strong">
            {hottestTarget === undefined
              ? "No targets touched"
              : hottestTarget.target}
          </span>
          <span style={secondaryTextStyle}>
            {hottestTarget === undefined
              ? "No admin member target activity yet."
              : `${resolveAuditScopeLabel(hottestTarget.tenantScope)} / ${hottestTarget.tenantScopeId}`}
          </span>
          {hottestTarget !== undefined ? (
            <span className="mono" style={secondaryTextStyle}>
              {hottestTarget.count} {pluralize(hottestTarget.count, "event")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Governance stream
            <span className="ops-card-head__count">{total}</span>
          </p>
        </div>

        <FilterBar
          searchValue={tableState.search}
          onSearchChange={tableState.setSearch}
          searchPlaceholder="Search actor, action, target, scope, or correlation…"
          trailing={
            <SegmentedTabs<AdminAuditCorrelationFilter>
              ariaLabel="Audit correlation filter"
              value={correlationFilter}
              onChange={(value) => {
                setCorrelationFilter(value);
                tableState.setPage(1);
              }}
              items={[
                { value: "all", label: "All" },
                { value: "correlated", label: "Correlated" },
                { value: "standalone", label: "Standalone" },
              ]}
            />
          }
        />

        <div
          data-testid="admin-audit-action-filter"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: "8px 10px",
            borderTop: "1px solid var(--ops-border, rgba(255,255,255,0.12))",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActionFilter("all");
              tableState.setPage(1);
            }}
            style={buildAuditFilterButtonStyle(actionFilter === "all")}
          >
            All actions
          </button>
          {availableActions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => {
                setActionFilter(action);
                tableState.setPage(1);
              }}
              style={buildAuditFilterButtonStyle(actionFilter === action)}
            >
              {resolveAuditActionLabel(action)}
            </button>
          ))}
        </div>

        <div className="ops-table-wrapper">
          <table className="ops-table" data-testid="admin-audit-table">
            <thead>
              <tr>
                <SortableTableHeader
                  ariaSort={resolveTableAriaSort(tableState, "recorded")}
                  onToggle={() => tableState.toggleSort("recorded")}
                >
                  Recorded
                </SortableTableHeader>
                <SortableTableHeader
                  ariaSort={resolveTableAriaSort(tableState, "action")}
                  onToggle={() => tableState.toggleSort("action")}
                >
                  Event
                </SortableTableHeader>
                <SortableTableHeader
                  ariaSort={resolveTableAriaSort(tableState, "target")}
                  onToggle={() => tableState.toggleSort("target")}
                >
                  Target
                </SortableTableHeader>
                <SortableTableHeader
                  ariaSort={resolveTableAriaSort(tableState, "actor")}
                  onToggle={() => tableState.toggleSort("actor")}
                >
                  Actor
                </SortableTableHeader>
                <SortableTableHeader
                  ariaSort={resolveTableAriaSort(tableState, "correlation")}
                  onToggle={() => tableState.toggleSort("correlation")}
                >
                  Correlation
                </SortableTableHeader>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    data-testid="admin-audit-empty"
                    style={{ padding: 6 }}
                  >
                    No admin organization audit events match the current
                    investigation view.
                  </td>
                </tr>
              ) : (
                visible.map((event) => (
                  <tr
                    key={event.eventId}
                    data-testid="admin-audit-row"
                    data-event-id={event.eventId}
                  >
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="mono">
                          {formatAuditTimestamp(event.timestamp)}
                        </span>
                        <span style={secondaryTextStyle}>
                          {event.reason ?? "Reason capture missing."}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 6,
                            alignItems: "center",
                          }}
                        >
                          <span className="text-strong">
                            {resolveAuditActionLabel(event.action)}
                          </span>
                          <StatusChip
                            tone={resolveAuditActionTone(event.action)}
                            size="sm"
                          >
                            {resolveAuditScopeLabel(event.tenantScope)}
                          </StatusChip>
                        </div>
                        <span className="mono" style={secondaryTextStyle}>
                          {event.action}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="text-strong">{event.target}</span>
                        <span style={secondaryTextStyle}>
                          {resolveAuditScopeLabel(event.tenantScope)} /{" "}
                          <span className="mono">{event.tenantScopeId}</span>
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="mono">{event.actorId}</span>
                        <span style={secondaryTextStyle}>
                          Admin organization actor
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <StatusChip
                          tone={
                            event.correlationId === undefined
                              ? "pending"
                              : "nominal"
                          }
                          size="sm"
                        >
                          {event.correlationId === undefined
                            ? "Standalone"
                            : "Correlated"}
                        </StatusChip>
                        <span className="mono" style={secondaryTextStyle}>
                          {event.correlationId ?? event.eventId}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={tableState.page}
          pageSize={tableState.pageSize}
          total={total}
          onPageChange={tableState.setPage}
          onPageSizeChange={tableState.setPageSize}
        />
      </div>
    </section>
  );
}
