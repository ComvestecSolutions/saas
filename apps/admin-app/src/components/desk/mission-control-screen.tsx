import { Link } from "@tanstack/react-router";
import {
  EmptyState,
  KpiTileV2,
  PermissionDeniedState,
  StatusChip,
  type StatusChipTone,
} from "@comvestec/ui";
import {
  adminNavigationKey,
  adminRoutePath,
  type AdminNavigationKey,
  type NavigationMapEntry,
} from "@comvestec/contracts";
import { AdminSessionRequiredState } from "../admin-session-required-state";
import {
  AlertIcon,
  ClockIcon,
  ExternalIcon,
  ScreenHeader,
  ShieldIcon,
} from "../ui";
import type { AdminDeskCenterLoaderData } from "../../lib/desk-center-loader";
import type {
  AdminOperationsHomeRouteKpi,
  AdminOperationsHomeRouteSnapshot,
} from "../../lib/operations-home-route-data";

const mapKpiTone = (kpi: AdminOperationsHomeRouteKpi): StatusChipTone => {
  switch (kpi.tone) {
    case "error":
      return "error";
    case "drift":
      return "drift";
    case "pending":
      return "pending";
    case "nominal":
    default:
      return "nominal";
  }
};

type NavigationCardDescriptor = {
  readonly label: string;
  readonly routePath: (typeof adminRoutePath)[keyof typeof adminRoutePath];
};

const navigationCardDescriptors: Partial<
  Record<AdminNavigationKey, NavigationCardDescriptor>
> = {
  [adminNavigationKey.operationsHome]: {
    label: "Operations Home",
    routePath: adminRoutePath.operationsHome,
  },
  [adminNavigationKey.tenantList]: {
    label: "Tenant Workspace",
    routePath: adminRoutePath.tenantWorkspaceDiscovery,
  },
  [adminNavigationKey.auditLog]: {
    label: "Audit Log",
    routePath: adminRoutePath.auditLog,
  },
  [adminNavigationKey.billingConsole]: {
    label: "Billing",
    routePath: adminRoutePath.billing,
  },
  [adminNavigationKey.webhooks]: {
    label: "Webhooks & API Access",
    routePath: adminRoutePath.webhooksApiAccess,
  },
  [adminNavigationKey.settings]: {
    label: "Runtime Config",
    routePath: adminRoutePath.runtimeConfig,
  },
};

const resolveNavigationCards = (
  entries: readonly NavigationMapEntry[],
): readonly (NavigationCardDescriptor & {
  readonly key: AdminNavigationKey;
  readonly requiresStepUp: boolean;
})[] =>
  entries.flatMap((entry) => {
    if (!entry.visible) {
      return [];
    }
    const descriptor = navigationCardDescriptors[entry.key];
    if (descriptor === undefined) {
      return [];
    }
    return [
      {
        key: entry.key,
        label: descriptor.label,
        routePath: descriptor.routePath,
        requiresStepUp: entry.requiresStepUp,
      },
    ];
  });

const hasAttention = (snapshot: AdminOperationsHomeRouteSnapshot): boolean =>
  snapshot.activeAlerts.length > 0 ||
  snapshot.pendingApprovals.length > 0 ||
  snapshot.partialFailures.length > 0 ||
  snapshot.kpis.some((kpi) => kpi.tone === "error" || kpi.tone === "drift");

type MissionControlSignal = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly note: string;
  readonly tone: "nominal" | "pending" | "drift" | "error";
};

type MissionControlDigestCard = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly note: string;
  readonly meta: string;
  readonly tone: StatusChipTone;
};

type MissionAlert = AdminOperationsHomeRouteSnapshot["activeAlerts"][number];
type MissionApproval =
  AdminOperationsHomeRouteSnapshot["pendingApprovals"][number];
type MissionVendor = AdminOperationsHomeRouteSnapshot["vendorPosture"][number];

const mapAlertSeverityTone = (alert: MissionAlert): StatusChipTone => {
  switch (alert.severity) {
    case "critical":
      return "error";
    case "warning":
      return "pending";
    case "info":
    default:
      return "nominal";
  }
};

const mapVendorPostureTone = (vendor: MissionVendor): StatusChipTone => {
  switch (vendor.posture) {
    case "down":
      return "error";
    case "degraded":
      return "pending";
    case "unknown":
      return "drift";
    case "nominal":
    default:
      return "nominal";
  }
};

const formatMissionTimestamp = (value: string): string =>
  value.slice(0, 16).replace("T", " ");

const formatApprovalTtl = (approval: MissionApproval): string =>
  approval.ttlSeconds >= 3600
    ? `${Math.ceil(approval.ttlSeconds / 3600)}h TTL`
    : `${Math.ceil(approval.ttlSeconds / 60)}m TTL`;

const buildMissionControlSignals = (
  data: Extract<AdminDeskCenterLoaderData, { readonly kind: "ready" }>,
): readonly MissionControlSignal[] => {
  const { snapshot, partialFailures } = data.operationsHome;
  return [
    {
      id: "alerts",
      label: "Live alerts",
      value: snapshot.activeAlerts.length,
      note:
        snapshot.activeAlerts.length === 0
          ? "no active vendor pressure"
          : "triage queue open",
      tone: snapshot.activeAlerts.length > 0 ? "error" : "nominal",
    },
    {
      id: "approvals",
      label: "Approvals",
      value: snapshot.pendingApprovals.length,
      note:
        snapshot.pendingApprovals.length === 0
          ? "nothing waiting"
          : "review before execution",
      tone: snapshot.pendingApprovals.length > 0 ? "pending" : "nominal",
    },
    {
      id: "gates",
      label: "Step-up surfaces",
      value: data.capabilitySnapshot.snapshot.highRiskAffordances.length,
      note: "guarded controls in this session",
      tone:
        data.capabilitySnapshot.snapshot.highRiskAffordances.length > 0
          ? "drift"
          : "nominal",
    },
    {
      id: "partial",
      label: "Partial failures",
      value: partialFailures.length,
      note:
        partialFailures.length === 0
          ? "aggregate fresh"
          : partialFailures.map((failure) => failure.section).join(" · "),
      tone: partialFailures.length > 0 ? "error" : "nominal",
    },
  ];
};

const buildMissionDigestCards = (
  data: Extract<AdminDeskCenterLoaderData, { readonly kind: "ready" }>,
): readonly MissionControlDigestCard[] => {
  const { snapshot } = data.operationsHome;
  const criticalAlerts = snapshot.activeAlerts.filter(
    (alert) => alert.severity === "critical",
  ).length;
  const degradedVendors = snapshot.vendorPosture.filter(
    (vendor) => vendor.posture === "degraded" || vendor.posture === "down",
  );
  const soonestApproval = snapshot.pendingApprovals.reduce<
    MissionApproval | undefined
  >(
    (current, approval) =>
      current === undefined || approval.ttlSeconds < current.ttlSeconds
        ? approval
        : current,
    undefined,
  );
  const auditLead = snapshot.recentAudit[0];
  const vendorLead = degradedVendors[0] ?? snapshot.vendorPosture[0];

  return [
    {
      id: "triage",
      label: "Triage queue",
      value: snapshot.activeAlerts.length + snapshot.pendingApprovals.length,
      note:
        criticalAlerts > 0
          ? `${criticalAlerts} critical alert${criticalAlerts === 1 ? "" : "s"} live`
          : snapshot.activeAlerts.length > 0
            ? "warning and info alerts waiting"
            : "no live alert pressure",
      meta: snapshot.activeAlerts[0]?.title ?? "Alert queue clear",
      tone:
        criticalAlerts > 0
          ? "error"
          : snapshot.pendingApprovals.length > 0
            ? "pending"
            : "nominal",
    },
    {
      id: "approval",
      label: "Approval runway",
      value: snapshot.pendingApprovals.length,
      note:
        snapshot.pendingApprovals.length === 0
          ? "nothing awaiting operator review"
          : snapshot.pendingApprovals
              .map((approval) => approval.kind)
              .join(" · "),
      meta:
        soonestApproval === undefined
          ? `${data.capabilitySnapshot.snapshot.highRiskAffordances.length} guarded affordance${data.capabilitySnapshot.snapshot.highRiskAffordances.length === 1 ? "" : "s"}`
          : `${formatApprovalTtl(soonestApproval)} · ${soonestApproval.target}`,
      tone:
        snapshot.pendingApprovals.length > 0
          ? "pending"
          : data.capabilitySnapshot.snapshot.highRiskAffordances.length > 0
            ? "drift"
            : "nominal",
    },
    {
      id: "vendors",
      label: "Vendor watch",
      value: degradedVendors.length,
      note:
        degradedVendors.length === 0
          ? "all tracked vendors nominal"
          : `${degradedVendors.length} degraded or down vendor${degradedVendors.length === 1 ? "" : "s"}`,
      meta:
        vendorLead === undefined
          ? "No vendor posture loaded"
          : `${vendorLead.vendor} · ${vendorLead.posture}`,
      tone: degradedVendors.length > 0 ? "error" : "nominal",
    },
    {
      id: "audit",
      label: "Audit pulse",
      value: snapshot.recentAudit.length,
      note:
        auditLead === undefined
          ? "no recent audit trail loaded"
          : `${auditLead.actor} · ${auditLead.target}`,
      meta: `window ${snapshot.windowMinutes}m · ${formatMissionTimestamp(snapshot.generatedAt)}`,
      tone: snapshot.recentAudit.length > 0 ? "nominal" : "drift",
    },
  ];
};

export function MissionControlRouteView({
  data,
}: Readonly<{ data: AdminDeskCenterLoaderData }>) {
  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access the admin operations workspace."
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

  return <MissionControlReadyView data={data} />;
}

function MissionControlReadyView({
  data,
}: Readonly<{
  data: Extract<AdminDeskCenterLoaderData, { readonly kind: "ready" }>;
}>) {
  const { snapshot, partialFailures } = data.operationsHome;
  const { snapshot: capabilitySnapshot, fromCache } = data.capabilitySnapshot;
  const navigationCards = resolveNavigationCards(
    capabilitySnapshot.navigationMap,
  );
  const directNavigationCards = navigationCards.filter(
    (card) => !card.requiresStepUp,
  );
  const stepUpNavigationCards = navigationCards.filter(
    (card) => card.requiresStepUp,
  );
  const attention = hasAttention(snapshot);
  const signals = buildMissionControlSignals(data);
  const digestCards = buildMissionDigestCards(data);

  return (
    <div className="ops-screen ops-screen--mission">
      <ScreenHeader
        icon={<ShieldIcon />}
        title="Operations Home"
        breadcrumbs={[{ label: "Operations" }, { label: "Mission Control" }]}
        subtitle={
          <>
            Live signal deck for the last{" "}
            <span className="mono">{snapshot.windowMinutes}m</span> window ·
            actor type{" "}
            <span className="mono">{capabilitySnapshot.actorType}</span>
          </>
        }
        actions={
          <>
            <span className="ops-chip" aria-label="Posture status">
              <span
                className={
                  attention
                    ? "ops-dot ops-dot--pending"
                    : "ops-dot ops-dot--active"
                }
              />
              {attention ? "Attention required" : "All systems nominal"}
            </span>
            <span
              className="ops-chip"
              data-testid="desk-center-cache-pill"
              aria-label={
                fromCache
                  ? "Capability snapshot served from cache"
                  : "Capability snapshot fresh"
              }
            >
              <ClockIcon size={10} />
              {fromCache ? "Cached" : "Fresh"}
            </span>
          </>
        }
      />

      <section
        className="ops-mission-signal-band"
        aria-label="Operations posture"
      >
        {signals.map((signal) => (
          <article
            key={signal.id}
            className="ops-mission-signal"
            data-tone={signal.tone}
          >
            <span className="ops-mission-signal__label">{signal.label}</span>
            <strong className="ops-mission-signal__value">
              {signal.value}
            </strong>
            <span className="ops-mission-signal__note">{signal.note}</span>
          </article>
        ))}
      </section>

      {partialFailures.length > 0 ? (
        <div
          className="ops-feedback error"
          role="note"
          data-testid="desk-center-partial-failures"
        >
          {partialFailures.length} snapshot section
          {partialFailures.length === 1 ? "" : "s"} failed:{" "}
          {partialFailures.map((failure) => failure.section).join(", ")}
        </div>
      ) : null}

      <section className="ops-mission-digest-grid" aria-label="Mission digest">
        {digestCards.map((card) => (
          <article
            key={card.id}
            className="ops-mission-digest"
            data-tone={card.tone}
          >
            <span className="ops-mission-digest__label">{card.label}</span>
            <strong className="ops-mission-digest__value">{card.value}</strong>
            <span className="ops-mission-digest__note">{card.note}</span>
            <span className="ops-mission-digest__meta">{card.meta}</span>
          </article>
        ))}
      </section>

      <div className="ops-mission-grid">
        <div className="ops-mission-grid__main">
          <section className="ops-card ops-card--flush">
            <div className="ops-card-head">
              <p className="ops-card-head__title">Platform posture</p>
            </div>
            {snapshot.kpis.length === 0 ? (
              <EmptyState
                title="No KPIs available"
                description="No KPI sources reported a value for this snapshot."
              />
            ) : (
              <div className="ops-mission-kpis">
                {snapshot.kpis.map((kpi) => (
                  <KpiTileV2
                    key={kpi.id}
                    label={kpi.label}
                    value={`${kpi.value} ${kpi.unit}`}
                    tone={mapKpiTone(kpi)}
                    onClick={() => {
                      // Drill targets are routed through the omnibar-backed
                      // workbench; keep the tile interactive so the affordance
                      // stays stable as deeper routing lands.
                    }}
                    ariaLabel={`${kpi.label}: ${kpi.value} ${kpi.unit}`}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="ops-card ops-card--flush">
            <div className="ops-card-head">
              <p className="ops-card-head__title">
                Active alerts
                <span className="ops-card-head__count">
                  {snapshot.activeAlerts.length}
                </span>
              </p>
            </div>
            {snapshot.activeAlerts.length === 0 ? (
              <EmptyState
                title="No active alerts"
                description="No vendor sources reported an active alert in this window."
              />
            ) : (
              <div className="ops-alert-list">
                {snapshot.activeAlerts.map((alert) => (
                  <div key={alert.id} className={`ops-alert ${alert.severity}`}>
                    <div className="ops-alert-body">
                      <p className="ops-alert-title">
                        <AlertIcon /> {alert.title}
                        <StatusChip
                          tone={mapAlertSeverityTone(alert)}
                          size="sm"
                        >
                          {alert.severity}
                        </StatusChip>
                      </p>
                      <p className="ops-alert-detail">
                        {alert.summary} · {alert.sourceVendor} ·{" "}
                        {formatMissionTimestamp(alert.openedAt)}
                      </p>
                      {alert.deepLink !== undefined ? (
                        <p className="ops-alert-detail mono">
                          {alert.deepLink}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="ops-card ops-card--flush">
            <div className="ops-card-head">
              <p className="ops-card-head__title">
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <ClockIcon size={10} /> Recent activity
                </span>
                <span className="ops-card-head__count">
                  {snapshot.recentAudit.length}
                </span>
              </p>
            </div>
            {snapshot.recentAudit.length === 0 ? (
              <EmptyState
                title="No recent activity"
                description="No recent audit events are available."
              />
            ) : (
              <div className="ops-activity-list">
                {snapshot.recentAudit.map((event) => (
                  <div key={event.id} className="ops-activity-item">
                    <div>
                      <span className="ops-activity-module">
                        <span className="ops-dot ops-dot--active" />
                        {event.actor}
                      </span>
                      <span className="ops-activity-action">
                        {" · "}
                        {event.action} · {event.target}
                      </span>
                      <div className="ops-alert-detail">
                        Classification · {event.classification}
                      </div>
                    </div>
                    <span className="ops-activity-time mono">
                      {event.occurredAt.slice(0, 19).replace("T", " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="ops-mission-grid__side">
          <section className="ops-card ops-card--flush">
            <div className="ops-card-head">
              <p className="ops-card-head__title">
                Operator surface
                <span className="ops-card-head__count">
                  {navigationCards.length}
                </span>
              </p>
            </div>
            {navigationCards.length === 0 ? (
              <EmptyState
                title="No capabilities enabled"
                description="This operator session does not have any admin capabilities."
              />
            ) : (
              <>
                {directNavigationCards.length > 0 ? (
                  <div className="ops-mission-nav-group">
                    <p className="ops-card-title">Direct lanes</p>
                    <div className="ops-mission-nav-grid">
                      {directNavigationCards.map((card) => (
                        <Link
                          key={card.key}
                          to={card.routePath}
                          className="ops-card-row ops-card-row--mission-link"
                          data-nav-key={card.key}
                          data-requires-step-up={card.requiresStepUp}
                          style={{ textDecoration: "none" }}
                        >
                          <span className="ops-mission-nav-grid__label">
                            <ExternalIcon size={11} />
                            {card.label}
                          </span>
                          <span className="mono ops-mission-nav-grid__meta">
                            {card.routePath}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
                {stepUpNavigationCards.length > 0 ? (
                  <div className="ops-mission-nav-group">
                    <p className="ops-card-title">Step-up lanes</p>
                    <div className="ops-mission-nav-grid">
                      {stepUpNavigationCards.map((card) => (
                        <Link
                          key={card.key}
                          to={card.routePath}
                          className="ops-card-row ops-card-row--mission-link"
                          data-nav-key={card.key}
                          data-requires-step-up={card.requiresStepUp}
                          style={{ textDecoration: "none" }}
                        >
                          <span className="ops-mission-nav-grid__label">
                            <ExternalIcon size={11} />
                            {card.label}
                          </span>
                          <span className="mono ops-mission-nav-grid__meta">
                            {card.routePath}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className="ops-card ops-card--flush">
            <div className="ops-card-head">
              <p className="ops-card-head__title">
                Pending approvals
                <span className="ops-card-head__count">
                  {snapshot.pendingApprovals.length}
                </span>
              </p>
            </div>
            {snapshot.pendingApprovals.length === 0 ? (
              <EmptyState
                title="No approvals waiting"
                description="No high-risk approvals are pending operator review."
              />
            ) : (
              <div className="ops-activity-list">
                {snapshot.pendingApprovals.map((approval) => (
                  <div
                    key={`${approval.kind}-${approval.target}`}
                    className="ops-activity-item"
                  >
                    <div>
                      <span className="ops-activity-module">
                        <span className="ops-dot ops-dot--pending" />
                        {approval.kind}
                      </span>
                      <span className="ops-activity-action">
                        {" · "}
                        {approval.target} · requested by {approval.requestedBy}
                      </span>
                      <div className="ops-alert-detail">
                        {approval.reasonPreview} · {formatApprovalTtl(approval)}
                      </div>
                    </div>
                    <span className="ops-activity-time mono">
                      {formatMissionTimestamp(approval.requestedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="ops-card ops-card--flush">
            <div className="ops-card-head">
              <p className="ops-card-head__title">
                Vendor posture
                <span className="ops-card-head__count">
                  {snapshot.vendorPosture.length}
                </span>
              </p>
            </div>
            {snapshot.vendorPosture.length === 0 ? (
              <EmptyState
                title="No vendor posture reported"
                description="No vendor adapter reported a posture entry for this window."
              />
            ) : (
              <div className="ops-vendor-grid">
                {snapshot.vendorPosture.map((vendor) => (
                  <article
                    key={vendor.vendor}
                    className="ops-vendor-grid__card"
                  >
                    <div className="ops-vendor-grid__head">
                      <span className="ops-vendor-grid__label">
                        {vendor.vendor}
                      </span>
                      <StatusChip tone={mapVendorPostureTone(vendor)} size="sm">
                        {vendor.posture}
                      </StatusChip>
                    </div>
                    <div className="ops-vendor-grid__meta">
                      {vendor.version !== undefined
                        ? vendor.version
                        : "version n/a"}
                      {vendor.lastIncidentAt !== undefined
                        ? ` · incident ${formatMissionTimestamp(vendor.lastIncidentAt)}`
                        : ""}
                    </div>
                    <div className="ops-vendor-grid__metric mono">
                      {vendor.latencyP95Ms !== undefined
                        ? `p95 ${vendor.latencyP95Ms}ms`
                        : "latency n/a"}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="ops-card ops-card--flush">
            <div className="ops-card-head">
              <p className="ops-card-head__title">
                High-risk affordances
                <span className="ops-card-head__count">
                  {capabilitySnapshot.highRiskAffordances.length}
                </span>
              </p>
            </div>
            {capabilitySnapshot.highRiskAffordances.length === 0 ? (
              <EmptyState
                title="No high-risk affordances"
                description="This session has no guarded actions surfaced right now."
              />
            ) : (
              <div className="ops-mission-chip-grid">
                {capabilitySnapshot.highRiskAffordances.map((affordance) => (
                  <span
                    key={affordance.reasonId}
                    className="ops-chip"
                    data-affordance-step-up={affordance.requiresStepUp}
                  >
                    <ShieldIcon size={10} />
                    <span className="mono">{affordance.reasonId}</span>
                    {affordance.requiresStepUp ? " · step-up" : ""}
                    {affordance.requiresAttachment ? " · attachment" : ""}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
