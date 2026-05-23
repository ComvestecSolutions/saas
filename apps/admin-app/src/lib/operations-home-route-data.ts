import { Effect } from "effect";
import {
  adminQuerySortDirection,
  dataClassification,
  kpiTone,
  kpiTrendDirection,
  operationsHomeDrillResourceKind,
  operationsHomeSnapshotSection,
  operationsHomeVendorPostureLevel,
  type OperationsHomePendingApproval,
  type OperationsHomeRecentAuditEntry,
  type OperationsHomeVendorPosture,
  type RequestContext,
  type VendorHealthAggregateProjection,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getAdminOperationsHomeSummaryFromSessionId,
  getOperationsHomeSnapshotFromEnvironment,
  getVendorHealthAggregateFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
  type AdminOperationsHomeSummary,
  type OperationsHomeSnapshot,
} from "@comvestec/platform";
import type {
  OperationsHomeActiveAlert,
  OperationsHomeKpi,
  OperationsHomePartialFailure,
} from "@comvestec/contracts";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the Operations Home v2
 * cutover (admin-app implementation plan §9 item 3). Mirrors
 * `tenant-workspace-v2-route-data.ts`: the route consumes a thin
 * `shell | stale-session | denied | error | ready` shape, and
 * the `ready` variant surfaces both the snapshot envelope and
 * its `partialFailures` array so the component can render an
 * inline notice without re-deriving it from the snapshot.
 *
 * Drops `kpi.drillFilters` from the transported KPI shape: the
 * upstream `Record<string, unknown>` is not serializable across
 * the TanStack Start server-function boundary, and the minimal
 * cutover route does not consume drill filters. The richer
 * posture board (Phase 2 follow-up) will project the live
 * filters into a typed view when drill targets are wired in.
 */
export type AdminOperationsHomeRouteKpi = Omit<
  OperationsHomeKpi,
  "drillFilters"
>;

export type AdminOperationsHomeRouteSnapshot = {
  readonly generatedAt: OperationsHomeSnapshot["generatedAt"];
  readonly correlationId: OperationsHomeSnapshot["correlationId"];
  readonly windowMinutes: OperationsHomeSnapshot["windowMinutes"];
  readonly kpis: readonly AdminOperationsHomeRouteKpi[];
  readonly activeAlerts: readonly OperationsHomeActiveAlert[];
  readonly recentAudit: readonly OperationsHomeRecentAuditEntry[];
  readonly pendingApprovals: readonly OperationsHomePendingApproval[];
  readonly vendorPosture: readonly OperationsHomeVendorPosture[];
  readonly partialFailures: readonly OperationsHomePartialFailure[];
};

export type AdminOperationsHomeRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | {
      readonly kind: "error";
      readonly title: string;
      readonly description: string;
    }
  | {
      readonly kind: "ready";
      readonly snapshot: AdminOperationsHomeRouteSnapshot;
      readonly partialFailures: readonly OperationsHomePartialFailure[];
    };

export type AdminOperationsHomeRouteLoaderInput = {
  readonly windowMinutes?: number | undefined;
  readonly recentAuditLimit?: number | undefined;
};

type GetOperationsHomeSnapshot =
  typeof getOperationsHomeSnapshotFromEnvironment;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;
type GetAdminOperationsHomeSummary =
  typeof getAdminOperationsHomeSummaryFromSessionId;
type GetVendorHealthAggregate = typeof getVendorHealthAggregateFromEnvironment;

const DEFAULT_WINDOW_MINUTES = 1440;
const DEFAULT_RECENT_AUDIT_LIMIT = 5;

const projectKpi = (kpi: OperationsHomeKpi): AdminOperationsHomeRouteKpi => ({
  id: kpi.id,
  label: kpi.label,
  value: kpi.value,
  unit: kpi.unit,
  trend: kpi.trend,
  tone: kpi.tone,
  drillResourceKind: kpi.drillResourceKind,
});

const projectSnapshot = (
  snapshot: OperationsHomeSnapshot,
): AdminOperationsHomeRouteSnapshot => ({
  generatedAt: snapshot.generatedAt,
  correlationId: snapshot.correlationId,
  windowMinutes: snapshot.windowMinutes,
  kpis: snapshot.kpis.map(projectKpi),
  activeAlerts: snapshot.activeAlerts,
  recentAudit: snapshot.recentAudit,
  pendingApprovals: snapshot.pendingApprovals,
  vendorPosture: snapshot.vendorPosture,
  partialFailures: snapshot.partialFailures,
});

const buildFlatTrend = (windowMinutes: number) =>
  ({
    direction: kpiTrendDirection.flat,
    delta: 0,
    windowMinutes,
  }) as const;

const buildFallbackKpis = (input: {
  readonly summary: AdminOperationsHomeSummary;
  readonly vendorPosture: readonly OperationsHomeVendorPosture[];
  readonly windowMinutes: number;
}): readonly AdminOperationsHomeRouteKpi[] => {
  const { posture } = input.summary;
  const degradedVendorCount = input.vendorPosture.filter(
    (entry) =>
      entry.posture === operationsHomeVendorPostureLevel.degraded ||
      entry.posture === operationsHomeVendorPostureLevel.down,
  ).length;

  return [
    {
      id: "repair-gap-pressure",
      label: "Repair gaps",
      value: posture.openRepairGaps,
      unit: "queues",
      trend: buildFlatTrend(input.windowMinutes),
      tone:
        posture.blockedRepairGaps > 0
          ? kpiTone.error
          : posture.openRepairGaps > 0
            ? kpiTone.pending
            : kpiTone.nominal,
      drillResourceKind: operationsHomeDrillResourceKind.workflowRuns,
    },
    {
      id: "support-pressure",
      label: "Support cases",
      value: posture.openSupportCases + posture.escalatedSupportCases,
      unit: "cases",
      trend: buildFlatTrend(input.windowMinutes),
      tone:
        posture.escalatedSupportCases > 0
          ? kpiTone.error
          : posture.openSupportCases > 0
            ? kpiTone.pending
            : kpiTone.nominal,
      drillResourceKind: operationsHomeDrillResourceKind.alerts,
    },
    {
      id: "privileged-access-pressure",
      label: "Privileged access",
      value:
        posture.pendingBreakGlassIncidents +
        posture.revocationPendingImpersonationSessions,
      unit: "reviews",
      trend: buildFlatTrend(input.windowMinutes),
      tone:
        posture.pendingBreakGlassIncidents > 0 ||
        posture.revocationPendingImpersonationSessions > 0
          ? kpiTone.drift
          : kpiTone.nominal,
      drillResourceKind: operationsHomeDrillResourceKind.approvals,
    },
    {
      id: "governance-backlog",
      label: "Governance backlog",
      value:
        posture.pendingRuntimeConfigProposals +
        posture.pendingBrandingProposals,
      unit: "changes",
      trend: buildFlatTrend(input.windowMinutes),
      tone:
        posture.pendingRuntimeConfigProposals > 0 ||
        posture.pendingBrandingProposals > 0
          ? kpiTone.pending
          : kpiTone.nominal,
      drillResourceKind: operationsHomeDrillResourceKind.approvals,
    },
    {
      id: "vendor-watch",
      label: "Vendor watch",
      value: degradedVendorCount,
      unit: "vendors",
      trend: buildFlatTrend(input.windowMinutes),
      tone: degradedVendorCount > 0 ? kpiTone.error : kpiTone.nominal,
      drillResourceKind: operationsHomeDrillResourceKind.vendors,
    },
  ];
};

const buildFallbackAlerts = (
  summary: AdminOperationsHomeSummary,
  generatedAt: string,
): readonly OperationsHomeActiveAlert[] =>
  summary.alerts.map((alert) => ({
    id: alert.id,
    severity: alert.severity,
    title: alert.title,
    summary:
      alert.count > 1
        ? `${alert.detail} (${alert.count} queued)`
        : alert.detail,
    openedAt: generatedAt,
    sourceVendor: "Admin control plane",
    deepLink: alert.href,
  }));

const buildFallbackRecentAudit = (
  summary: AdminOperationsHomeSummary,
): readonly OperationsHomeRecentAuditEntry[] =>
  summary.recentActivity.items.map((event) => ({
    id: event.eventId,
    actor: event.actorId,
    action: event.action,
    target: event.target,
    occurredAt: event.timestamp,
    classification: dataClassification.internal,
  }));

const buildPendingApprovalItem = (input: {
  readonly id: string;
  readonly count: number;
  readonly kind: string;
  readonly target: string;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly reasonPreview: string;
}): readonly OperationsHomePendingApproval[] =>
  input.count === 0
    ? []
    : [
        {
          id: input.id,
          kind: input.kind,
          target:
            input.count === 1
              ? input.target
              : `${input.target} (${input.count})`,
          requestedBy: input.requestedBy,
          requestedAt: input.requestedAt,
          reasonPreview: input.reasonPreview,
          ttlSeconds: 0,
        },
      ];

const buildFallbackPendingApprovals = (
  summary: AdminOperationsHomeSummary,
  generatedAt: string,
): readonly OperationsHomePendingApproval[] => {
  const requestedAt = summary.recentActivity.items[0]?.timestamp ?? generatedAt;
  const { posture } = summary;

  return [
    ...buildPendingApprovalItem({
      id: "runtime-config-proposals",
      count: posture.pendingRuntimeConfigProposals,
      kind: "Runtime change review",
      target: "Runtime config proposals",
      requestedBy: "Governance queue",
      requestedAt,
      reasonPreview:
        "Runtime config proposals are pending operator review before they take effect.",
    }),
    ...buildPendingApprovalItem({
      id: "branding-proposals",
      count: posture.pendingBrandingProposals,
      kind: "Brand review",
      target: "Branding proposals",
      requestedBy: "Brand governance",
      requestedAt,
      reasonPreview: "Tenant-branding changes are waiting for operator review.",
    }),
    ...buildPendingApprovalItem({
      id: "break-glass-reviews",
      count: posture.pendingBreakGlassIncidents,
      kind: "Break-glass review",
      target: "Pending incident reviews",
      requestedBy: "Support operations",
      requestedAt,
      reasonPreview:
        "Break-glass incidents remain open and should be reviewed after the privileged session closes.",
    }),
    ...buildPendingApprovalItem({
      id: "impersonation-revocations",
      count: posture.revocationPendingImpersonationSessions,
      kind: "Impersonation revocation",
      target: "Pending impersonation revocations",
      requestedBy: "Support operations",
      requestedAt,
      reasonPreview:
        "Impersonation sessions are waiting for revocation completion and operator review.",
    }),
  ];
};

const projectVendorPosture = (
  aggregate: VendorHealthAggregateProjection,
): readonly OperationsHomeVendorPosture[] => {
  const postureRank: Record<OperationsHomeVendorPosture["posture"], number> = {
    [operationsHomeVendorPostureLevel.down]: 0,
    [operationsHomeVendorPostureLevel.degraded]: 1,
    [operationsHomeVendorPostureLevel.unknown]: 2,
    [operationsHomeVendorPostureLevel.nominal]: 3,
  };

  return [...aggregate.entries]
    .map((entry) => ({
      vendor: entry.serviceName,
      posture:
        entry.status === "healthy"
          ? operationsHomeVendorPostureLevel.nominal
          : entry.status === "degraded"
            ? operationsHomeVendorPostureLevel.degraded
            : entry.status === "unavailable"
              ? operationsHomeVendorPostureLevel.down
              : operationsHomeVendorPostureLevel.unknown,
      ...(entry.version !== undefined ? { version: entry.version } : {}),
      ...(entry.lastIncidentAt !== undefined
        ? { lastIncidentAt: entry.lastIncidentAt }
        : {}),
      ...(Number.isFinite(entry.latencyMs)
        ? { latencyP95Ms: entry.latencyMs }
        : {}),
    }))
    .sort(
      (left, right) => postureRank[left.posture] - postureRank[right.posture],
    );
};

const projectVendorPartialFailures = (
  aggregate: VendorHealthAggregateProjection,
): readonly OperationsHomePartialFailure[] =>
  aggregate.partialFailures.length === 0
    ? []
    : [
        {
          section: operationsHomeSnapshotSection.vendorPosture,
          reason: aggregate.partialFailures
            .map((failure) => `${failure.serviceName}: ${failure.reason}`)
            .join(" · "),
        },
      ];

const buildVendorAggregateFailureReason = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Vendor posture could not be derived from the current vendor-health aggregate.";

const buildFallbackReadyState = (input: {
  readonly summary: AdminOperationsHomeSummary;
  readonly requestContext: RequestContext;
  readonly windowMinutes: number;
  readonly vendorPosture: readonly OperationsHomeVendorPosture[];
  readonly partialFailures: readonly OperationsHomePartialFailure[];
  readonly generatedAt: string;
}): Extract<AdminOperationsHomeRouteData, { readonly kind: "ready" }> => {
  const snapshot: AdminOperationsHomeRouteSnapshot = {
    generatedAt: input.generatedAt,
    correlationId: input.requestContext.correlationId,
    windowMinutes: input.windowMinutes,
    kpis: buildFallbackKpis({
      summary: input.summary,
      vendorPosture: input.vendorPosture,
      windowMinutes: input.windowMinutes,
    }),
    activeAlerts: buildFallbackAlerts(input.summary, input.generatedAt),
    recentAudit: buildFallbackRecentAudit(input.summary),
    pendingApprovals: buildFallbackPendingApprovals(
      input.summary,
      input.generatedAt,
    ),
    vendorPosture: input.vendorPosture,
    partialFailures: input.partialFailures,
  };

  return {
    kind: "ready",
    snapshot,
    partialFailures: snapshot.partialFailures,
  };
};

const loadFallbackOperationsHomeRouteData = (input: {
  readonly environment: unknown;
  readonly sessionId: string;
  readonly requestContext: RequestContext;
  readonly routeInput: AdminOperationsHomeRouteLoaderInput;
  readonly getAdminOperationsHomeSummary: GetAdminOperationsHomeSummary;
  readonly getVendorHealthAggregate: GetVendorHealthAggregate;
}) => {
  const windowMinutes =
    input.routeInput.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  const recentAuditLimit =
    input.routeInput.recentAuditLimit ?? DEFAULT_RECENT_AUDIT_LIMIT;

  return input
    .getAdminOperationsHomeSummary(input.environment, {
      sessionId: input.sessionId,
      recentActivity: {
        page: {
          page: 1,
          pageSize: recentAuditLimit,
        },
        sortDirection: adminQuerySortDirection.desc,
        exportMode: false,
      },
    })
    .pipe(
      Effect.flatMap((summary) =>
        Effect.either(
          input.getVendorHealthAggregate(input.environment, {
            requestContext: input.requestContext,
          }),
        ).pipe(
          Effect.map((vendorAggregateResult) => {
            if (vendorAggregateResult._tag === "Right") {
              return buildFallbackReadyState({
                summary,
                requestContext: input.requestContext,
                windowMinutes,
                vendorPosture: projectVendorPosture(
                  vendorAggregateResult.right.aggregate,
                ),
                partialFailures: projectVendorPartialFailures(
                  vendorAggregateResult.right.aggregate,
                ),
                generatedAt: vendorAggregateResult.right.aggregate.generatedAt,
              });
            }

            return buildFallbackReadyState({
              summary,
              requestContext: input.requestContext,
              windowMinutes,
              vendorPosture: [],
              partialFailures: [
                {
                  section: operationsHomeSnapshotSection.vendorPosture,
                  reason: buildVendorAggregateFailureReason(
                    vendorAggregateResult.left,
                  ),
                },
              ],
              generatedAt: new Date().toISOString(),
            });
          }),
        ),
      ),
    );
};

const buildErrorState = (
  error: unknown,
): Extract<AdminOperationsHomeRouteData, { readonly kind: "error" }> => {
  if (error instanceof Error && error.message.length > 0) {
    return {
      kind: "error",
      title: "Operations Home unavailable",
      description: error.message,
    };
  }

  return {
    kind: "error",
    title: "Operations Home unavailable",
    description:
      "The Operations Home snapshot could not be loaded from the current backend state. Retry shortly; if the problem persists, every upstream source is failing and the platform has degraded to an unavailable state.",
  };
};

export const loadAdminOperationsHomeRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminOperationsHomeRouteLoaderInput = {},
  resolveTrustedRequestContext: ResolveTrustedRequestContext = (
    env,
    sessionId,
  ) => resolveTrustedRequestContextFromSessionId(env, sessionId),
  getOperationsHomeSnapshot: GetOperationsHomeSnapshot = (env, snapshotInput) =>
    getOperationsHomeSnapshotFromEnvironment(env, snapshotInput),
  getAdminOperationsHomeSummary: GetAdminOperationsHomeSummary = (
    env,
    summaryInput,
  ) => getAdminOperationsHomeSummaryFromSessionId(env, summaryInput),
  getVendorHealthAggregate: GetVendorHealthAggregate = (env, aggregateInput) =>
    getVendorHealthAggregateFromEnvironment(env, aggregateInput),
) =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) =>
            getOperationsHomeSnapshot(environment, {
              requestContext,
              ...(input.windowMinutes === undefined
                ? {}
                : { windowMinutes: input.windowMinutes }),
              ...(input.recentAuditLimit === undefined
                ? {}
                : { recentAuditLimit: input.recentAuditLimit }),
            }).pipe(
              Effect.map((snapshot): AdminOperationsHomeRouteData => {
                const projected = projectSnapshot(snapshot);
                return {
                  kind: "ready",
                  snapshot: projected,
                  partialFailures: projected.partialFailures,
                };
              }),
              Effect.catchTag("OperationsHomeUnavailable", (error) =>
                loadFallbackOperationsHomeRouteData({
                  environment,
                  sessionId,
                  requestContext,
                  routeInput: input,
                  getAdminOperationsHomeSummary,
                  getVendorHealthAggregate,
                }).pipe(Effect.catchAll(() => Effect.fail(error))),
              ),
            ),
          ),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchTag("IdentitySessionRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("OperationsHomeMissingActorIdentity", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("OperationsHomeUnavailable", () =>
      Effect.succeed({
        kind: "error",
        title: "Operations Home unavailable",
        description:
          "Every upstream source for the Operations Home snapshot failed. Retry shortly; the platform has degraded to an unavailable state.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
