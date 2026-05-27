import { describe, expect, it } from "vitest";
import { Effect, Either } from "effect";
import {
  actorType,
  dataClassification,
  operationsHomeAlertSeverity,
  operationsHomeSnapshotSection,
  operationsHomeVendorPostureLevel,
  platformAdapterServiceName,
  platformModuleId,
  platformScope,
  runtimeConfigConfigKey,
  runtimeConfigAuditAction,
  tenantBrandingConfigKey,
  type AuditEvent,
  type RequestContext,
} from "@comvestec/contracts";
import {
  runtimeConfigSyncArtifactStatus,
  type AuditLogModuleService,
} from "@comvestec/modules";
import {
  makeOperationsHomeActiveAlertsSource,
  makeOperationsHomeKpiSourceService,
  makeOperationsHomePendingApprovalsSourceService,
  makeOperationsHomeRecentAuditSource,
  makeOperationsHomeVendorPostureSource,
  OperationsHomeSourceUnavailable,
} from "../../packages/platform/src/services/domains/operations-home-service";

const requestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator",
  sessionId: "sess-ops-home-sources",
  correlationId: "corr-ops-home-sources",
  reason: "operations-home source test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const buildAuditEvent = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  eventId: overrides.eventId ?? "audit_evt_1",
  timestamp: overrides.timestamp ?? "2026-01-10T01:30:00.000Z",
  actorId: overrides.actorId ?? "usr_operator",
  moduleId: overrides.moduleId ?? platformModuleId.runtimeConfig,
  action: overrides.action ?? runtimeConfigAuditAction.overrideChanged,
  target: overrides.target ?? "runtime-config:flag",
  tenantScope: overrides.tenantScope ?? platformScope.platform,
  tenantScopeId: overrides.tenantScopeId ?? platformScope.platform,
  ...(overrides.reason === undefined ? {} : { reason: overrides.reason }),
  ...(overrides.correlationId === undefined
    ? {}
    : { correlationId: overrides.correlationId }),
});

const makeAuditLog = (
  queryByTenant: AuditLogModuleService["queryByTenant"],
): AuditLogModuleService => ({
  append: () => Effect.die(new Error("append not used in source tests")),
  queryByModule: () =>
    Effect.die(new Error("queryByModule not used in source tests")),
  queryByTarget: () =>
    Effect.die(new Error("queryByTarget not used in source tests")),
  queryByActor: () =>
    Effect.die(new Error("queryByActor not used in source tests")),
  queryByTenant,
  requirements: Effect.succeed([]),
});

describe("operations-home runtime sources", () => {
  it("loads recent audit from AuditLogModule.queryByTenant with window and limit filtering", async () => {
    const captured: Array<{ tenantScope: string; tenantScopeId: string }> = [];
    const source = makeOperationsHomeRecentAuditSource(
      makeAuditLog((input) =>
        Effect.sync(() => {
          captured.push(input);
          return [
            buildAuditEvent({
              eventId: "audit-recent",
              timestamp: "2026-01-10T01:45:00.000Z",
            }),
            buildAuditEvent({
              eventId: "audit-window-edge",
              timestamp: "2026-01-10T01:00:00.000Z",
            }),
            buildAuditEvent({
              eventId: "audit-old",
              timestamp: "2026-01-09T22:00:00.000Z",
            }),
          ] as const;
        }),
      ),
      {
        now: () => new Date("2026-01-10T02:00:00.000Z"),
      },
    );

    const entries = await Effect.runPromise(
      source.fetch({
        requestContext,
        windowMinutes: 60,
        limit: 2,
      }),
    );

    expect(captured).toEqual([
      {
        tenantScope: platformScope.platform,
        tenantScopeId: platformScope.platform,
      },
    ]);
    expect(entries).toEqual([
      {
        id: "audit-recent",
        actor: "usr_operator",
        action: runtimeConfigAuditAction.overrideChanged,
        target: "runtime-config:flag",
        occurredAt: "2026-01-10T01:45:00.000Z",
        classification: dataClassification.internal,
      },
      {
        id: "audit-window-edge",
        actor: "usr_operator",
        action: runtimeConfigAuditAction.overrideChanged,
        target: "runtime-config:flag",
        occurredAt: "2026-01-10T01:00:00.000Z",
        classification: dataClassification.internal,
      },
    ]);
  });

  it("builds KPI rows from support, repair-gap, and governance counts", async () => {
    const source = makeOperationsHomeKpiSourceService({
      listBillingRepairGaps: () => Effect.succeed([{}, {}] as const),
      listSupportCases: (_requestContext, status) =>
        Effect.succeed(
          status === "open" ? ([{}] as const) : ([{}, {}] as const),
        ),
      listImpersonationSessions: () => Effect.succeed([{}] as const),
      listBreakGlassIncidents: () => Effect.succeed([{}, {}, {}] as const),
      listRuntimeConfigProposals: (_requestContext, moduleId) =>
        Effect.succeed(
          moduleId === platformModuleId.runtimeConfig
            ? ([
                {
                  proposalId: "runtime-pending",
                  moduleId,
                  key: runtimeConfigConfigKey.syncStrategy,
                  status: runtimeConfigSyncArtifactStatus.pending,
                },
                {
                  proposalId: "runtime-applied",
                  moduleId,
                  key: runtimeConfigConfigKey.approvalsEnabled,
                  status: runtimeConfigSyncArtifactStatus.applied,
                },
              ] as const)
            : ([
                {
                  proposalId: "branding-pending",
                  moduleId,
                  key: tenantBrandingConfigKey.companyName,
                  status: runtimeConfigSyncArtifactStatus.pending,
                },
              ] as const),
        ),
    });

    const kpis = await Effect.runPromise(
      source.fetch({
        requestContext,
        windowMinutes: 60,
      }),
    );

    expect(kpis.map(({ id, value }) => ({ id, value }))).toEqual([
      { id: "repair-gaps", value: 2 },
      { id: "open-support-cases", value: 1 },
      { id: "escalated-support-cases", value: 2 },
      { id: "active-impersonations", value: 1 },
      { id: "pending-break-glass", value: 3 },
      { id: "runtime-config-proposals", value: 1 },
      { id: "branding-proposals", value: 1 },
    ]);
  });

  it("maps pending governance proposals into operations-home approvals", async () => {
    const source = makeOperationsHomePendingApprovalsSourceService({
      listRuntimeConfigProposals: (_requestContext, moduleId) =>
        Effect.succeed([
          {
            proposalId: `${moduleId}-pending`,
            moduleId,
            key:
              moduleId === platformModuleId.runtimeConfig
                ? runtimeConfigConfigKey.syncStrategy
                : tenantBrandingConfigKey.companyName,
            status: runtimeConfigSyncArtifactStatus.pending,
            changedBy: "usr_reviewer",
            changedAt: "2026-01-10T01:50:00.000Z",
            approvalReason: "Review requested",
          },
        ] as const),
    });

    const approvals = await Effect.runPromise(
      source.fetch({
        requestContext,
        windowMinutes: 60,
      }),
    );

    expect(approvals).toEqual([
      {
        id: `${platformModuleId.runtimeConfig}-pending`,
        kind: "Runtime config review",
        target: `${platformModuleId.runtimeConfig}:${runtimeConfigConfigKey.syncStrategy}`,
        requestedBy: "usr_reviewer",
        requestedAt: "2026-01-10T01:50:00.000Z",
        reasonPreview: "Review requested",
        ttlSeconds: 0,
      },
      {
        id: `${platformModuleId.tenantBranding}-pending`,
        kind: "Branding review",
        target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}`,
        requestedBy: "usr_reviewer",
        requestedAt: "2026-01-10T01:50:00.000Z",
        reasonPreview: "Review requested",
        ttlSeconds: 0,
      },
    ]);
  });

  it("maps unresolved GlitchTip issues into active alerts", async () => {
    const source = makeOperationsHomeActiveAlertsSource(() =>
      Effect.succeed({
        listByLevel: ({ level }: { readonly level: string }) =>
          Effect.succeed(
            level === "fatal"
              ? [
                  {
                    issueId: "issue-fatal",
                    projectSlug: "admin-app",
                    title: "Fatal outage",
                    level: "fatal",
                    culprit: "POST /api/admin",
                    firstSeenAt: "2026-01-10T01:30:00.000Z",
                    lastSeenAt: "2026-01-10T01:59:00.000Z",
                    eventCount: 14,
                    userCount: 3,
                    status: "unresolved",
                    permalink: "https://glitchtip.local/issues/fatal",
                  },
                ]
              : level === "error"
                ? [
                    {
                      issueId: "issue-error",
                      projectSlug: "admin-app",
                      title: "Error spike",
                      level: "error",
                      culprit: "GET /api/runtime-config",
                      firstSeenAt: "2026-01-10T01:10:00.000Z",
                      lastSeenAt: "2026-01-10T01:40:00.000Z",
                      eventCount: 22,
                      userCount: 5,
                      status: "unresolved",
                    },
                    {
                      issueId: "issue-resolved",
                      projectSlug: "admin-app",
                      title: "Resolved regression",
                      level: "error",
                      culprit: "GET /api/health",
                      firstSeenAt: "2026-01-10T01:00:00.000Z",
                      lastSeenAt: "2026-01-10T01:05:00.000Z",
                      eventCount: 2,
                      userCount: 1,
                      status: "resolved",
                    },
                  ]
                : [],
          ),
      }),
    );

    const alerts = await Effect.runPromise(
      source.fetch({
        requestContext,
        windowMinutes: 60,
      }),
    );

    expect(alerts).toEqual([
      {
        id: "issue-fatal",
        severity: operationsHomeAlertSeverity.critical,
        title: "Fatal outage",
        summary: "POST /api/admin",
        openedAt: "2026-01-10T01:30:00.000Z",
        sourceVendor: platformAdapterServiceName.glitchtip,
        deepLink: "https://glitchtip.local/issues/fatal",
      },
      {
        id: "issue-error",
        severity: operationsHomeAlertSeverity.critical,
        title: "Error spike",
        summary: "GET /api/runtime-config",
        openedAt: "2026-01-10T01:10:00.000Z",
        sourceVendor: platformAdapterServiceName.glitchtip,
      },
    ]);
  });

  it("maps healthcheck entries into vendor posture rows and degrades failed vendors to down", async () => {
    const source = makeOperationsHomeVendorPostureSource(
      () =>
        Effect.succeed({
          checkAll: () => [
            {
              serviceName: platformAdapterServiceName.keycloak,
              result: Effect.succeed({
                serviceName: platformAdapterServiceName.keycloak,
                status: "healthy",
                latencyMs: 42,
                lastCheckedAt: "2026-01-10T02:00:00.000Z",
              }),
            },
            {
              serviceName: platformAdapterServiceName.polar,
              result: Effect.fail(new Error("PolarAdapterRequestError")),
            },
          ],
        }),
      {
        now: () => new Date("2026-01-10T02:00:00.000Z"),
      },
    );

    const entries = await Effect.runPromise(
      source.fetch({
        requestContext,
        windowMinutes: 60,
      }),
    );

    expect(entries).toEqual([
      {
        vendor: platformAdapterServiceName.keycloak,
        posture: operationsHomeVendorPostureLevel.nominal,
        latencyP95Ms: 42,
      },
      {
        vendor: platformAdapterServiceName.polar,
        posture: operationsHomeVendorPostureLevel.down,
      },
    ]);
  });

  it("fails the vendor posture section when every healthcheck fails", async () => {
    const source = makeOperationsHomeVendorPostureSource(
      () =>
        Effect.succeed({
          checkAll: () => [
            {
              serviceName: platformAdapterServiceName.glitchtip,
              result: Effect.fail(new Error("glitchtip down")),
            },
          ],
        }),
      {
        now: () => new Date("2026-01-10T02:00:00.000Z"),
      },
    );

    const result = await Effect.runPromise(
      Effect.either(
        source.fetch({
          requestContext,
          windowMinutes: 60,
        }),
      ),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (!Either.isLeft(result)) {
      return;
    }
    expect(result.left).toBeInstanceOf(OperationsHomeSourceUnavailable);
    expect(result.left.args.section).toBe(
      operationsHomeSnapshotSection.vendorPosture,
    );
  });
});
