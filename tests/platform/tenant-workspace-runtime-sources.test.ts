import { describe, expect, it } from "vitest";
import { Effect, Either } from "effect";
import {
  actorType,
  authorizationRelation,
  billingSubscriptionStatus,
  customDomainLifecycleState,
  dataClassification,
  platformModuleId,
  platformAdapterServiceName,
  platformScope,
  runtimeConfigConfigKey,
  tenantManagementAuditAction,
  tenantBrandingConfigKey,
  tenantWorkspaceBrandingState,
  tenantWorkspaceIncidentSeverity,
  tenantWorkspaceMemberRole,
  tenantWorkspaceSnapshotSection,
  type AuditEvent,
  type RequestContext,
  type TenantContext,
} from "@comvestec/contracts";
import {
  runtimeConfigSyncArtifactStatus,
  type AuditLogModuleService,
} from "@comvestec/modules";
import {
  makeTenantWorkspaceOverviewSourceService,
  makeTenantWorkspaceMembersSourceService,
  makeTenantWorkspaceOpenIncidentsSource,
  makeTenantWorkspacePendingApprovalsSourceService,
  makeTenantWorkspaceRecentActivitySource,
  makeTenantWorkspaceUsageSpotlightsSource,
  TenantWorkspaceSourceUnavailable,
} from "../../packages/platform/src/services/domains/tenant-workspace-service";
import { OpenMeterApiClientError } from "../../packages/platform/src/services/domains/open-meter-usage-query-service";
import { PolarApiClientError } from "../../packages/platform/src/services/domains/polar-revenue-projection-service";

const requestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator",
  sessionId: "sess-tenant-workspace-sources",
  correlationId: "corr-tenant-workspace-sources",
  reason: "tenant-workspace source test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const tenant: TenantContext = {
  scope: platformScope.organization,
  scopeId: "org_acme",
};

const buildAuditEvent = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  eventId: overrides.eventId ?? "audit_evt_1",
  timestamp: overrides.timestamp ?? "2026-01-10T01:30:00.000Z",
  actorId: overrides.actorId ?? "usr_operator",
  moduleId: overrides.moduleId ?? platformModuleId.tenantManagement,
  action: overrides.action ?? tenantManagementAuditAction.membershipsInspected,
  target: overrides.target ?? "tenant:org_acme",
  tenantScope: overrides.tenantScope ?? tenant.scope,
  tenantScopeId: overrides.tenantScopeId ?? tenant.scopeId,
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

describe("tenant-workspace runtime sources", () => {
  it("derives tenant overview from owned branding, billing, and legal-hold sources", async () => {
    const tenantWithEnterprise: TenantContext = {
      ...tenant,
      enterpriseId: "ent_acme",
    };
    const source = makeTenantWorkspaceOverviewSourceService({
      listCompanyNameCandidates: () =>
        Effect.succeed([
          {
            scope: platformScope.enterprise,
            scopeId: "ent_acme",
            value: "Acme Enterprise",
          },
        ] as const),
      listDomainVerificationCandidates: () =>
        Effect.succeed([
          {
            scope: platformScope.organization,
            scopeId: tenant.scopeId,
            lifecycleState: customDomainLifecycleState.retired,
          },
          {
            scope: platformScope.enterprise,
            scopeId: "ent_acme",
            lifecycleState: customDomainLifecycleState.active,
          },
        ] as const),
      listBillingSubscriptionCandidates: () =>
        Effect.succeed([
          {
            scope: platformScope.organization,
            scopeId: tenant.scopeId,
            planId: "starter",
            status: billingSubscriptionStatus.canceled,
          },
          {
            scope: platformScope.enterprise,
            scopeId: "ent_acme",
            planId: "enterprise",
            status: billingSubscriptionStatus.active,
          },
        ] as const),
      hasActiveLegalHold: () => Effect.succeed(true),
    });

    const overview = await Effect.runPromise(
      source.fetch({
        requestContext,
        tenant: tenantWithEnterprise,
        windowMinutes: 60,
      }),
    );

    expect(overview).toEqual({
      displayName: "Acme Enterprise",
      brandingState: tenantWorkspaceBrandingState.customDomainActive,
      planTier: "enterprise",
      billingStatus: billingSubscriptionStatus.active,
      legalHoldActive: true,
    });
  });

  it("falls back to the tenant scope id when no overview sources resolve", async () => {
    const source = makeTenantWorkspaceOverviewSourceService({
      listCompanyNameCandidates: () => Effect.succeed([]),
      listDomainVerificationCandidates: () => Effect.succeed([]),
      listBillingSubscriptionCandidates: () => Effect.succeed([]),
      hasActiveLegalHold: () => Effect.succeed(false),
    });

    const overview = await Effect.runPromise(
      source.fetch({
        requestContext,
        tenant,
        windowMinutes: 60,
      }),
    );

    expect(overview).toEqual({
      displayName: tenant.scopeId,
      brandingState: tenantWorkspaceBrandingState.unpublished,
      planTier: "unassigned",
      legalHoldActive: false,
    });
  });

  it("loads recent activity from AuditLogModule.queryByTenant with the requested tenant, window, and limit", async () => {
    const captured: Array<{ tenantScope: string; tenantScopeId: string }> = [];
    const source = makeTenantWorkspaceRecentActivitySource(
      makeAuditLog((input) =>
        Effect.sync(() => {
          captured.push(input);
          return [
            buildAuditEvent({
              eventId: "tenant-activity-recent",
              timestamp: "2026-01-10T01:50:00.000Z",
            }),
            buildAuditEvent({
              eventId: "tenant-activity-old",
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
        tenant,
        windowMinutes: 60,
        limit: 5,
      }),
    );

    expect(captured).toEqual([
      {
        tenantScope: tenant.scope,
        tenantScopeId: tenant.scopeId,
      },
    ]);
    expect(entries).toEqual([
      {
        id: "tenant-activity-recent",
        actor: "usr_operator",
        action: tenantManagementAuditAction.membershipsInspected,
        target: "tenant:org_acme",
        occurredAt: "2026-01-10T01:50:00.000Z",
        classification: dataClassification.internal,
      },
    ]);
  });

  it("maps unresolved GlitchTip issues into tenant open incidents", async () => {
    const source = makeTenantWorkspaceOpenIncidentsSource(() =>
      Effect.succeed({
        listByLevel: ({ level }: { readonly level: string }) =>
          Effect.succeed(
            level === "warning"
              ? [
                  {
                    issueId: "tenant-warning",
                    projectSlug: "tenant-api",
                    title: "Warning spike",
                    level: "warning",
                    culprit: "GET /api/tenant/org_acme",
                    firstSeenAt: "2026-01-10T01:30:00.000Z",
                    lastSeenAt: "2026-01-10T01:40:00.000Z",
                    eventCount: 4,
                    userCount: 2,
                    status: "unresolved",
                    permalink: "https://glitchtip.local/issues/tenant-warning",
                  },
                ]
              : level === "error"
                ? [
                    {
                      issueId: "tenant-error",
                      projectSlug: "tenant-api",
                      title: "Tenant API failures",
                      level: "error",
                      culprit: "POST /api/tenant/org_acme",
                      firstSeenAt: "2026-01-10T01:00:00.000Z",
                      lastSeenAt: "2026-01-10T01:55:00.000Z",
                      eventCount: 11,
                      userCount: 3,
                      status: "unresolved",
                    },
                  ]
                : [],
          ),
      }),
    );

    const incidents = await Effect.runPromise(
      source.fetch({
        requestContext,
        tenant,
        windowMinutes: 60,
      }),
    );

    expect(incidents).toEqual([
      {
        id: "tenant-error",
        vendor: platformAdapterServiceName.glitchtip,
        severity: tenantWorkspaceIncidentSeverity.critical,
        title: "Tenant API failures",
        summary: "POST /api/tenant/org_acme",
        openedAt: "2026-01-10T01:00:00.000Z",
      },
      {
        id: "tenant-warning",
        vendor: platformAdapterServiceName.glitchtip,
        severity: tenantWorkspaceIncidentSeverity.warning,
        title: "Warning spike",
        summary: "GET /api/tenant/org_acme",
        openedAt: "2026-01-10T01:30:00.000Z",
        deepLink: "https://glitchtip.local/issues/tenant-warning",
      },
    ]);
  });

  it("maps tenant memberships into tenant workspace member rows", async () => {
    const source = makeTenantWorkspaceMembersSourceService({
      listTenantMemberships: () =>
        Effect.succeed([
          {
            subject: "usr_owner",
            relations: [
              authorizationRelation.owner,
              authorizationRelation.viewer,
            ],
          },
          {
            subject: "usr_admin",
            relations: [authorizationRelation.admin],
          },
          {
            subject: "usr_member",
            relations: [authorizationRelation.member],
          },
        ] as const),
    });

    const members = await Effect.runPromise(
      source.fetch({
        requestContext,
        tenant,
        windowMinutes: 60,
        limit: 2,
      }),
    );

    expect(members).toEqual([
      {
        subjectId: "usr_admin",
        displayName: "usr_admin",
        role: tenantWorkspaceMemberRole.admin,
      },
      {
        subjectId: "usr_member",
        displayName: "usr_member",
        role: tenantWorkspaceMemberRole.member,
      },
    ]);
  });

  it("maps tenant-scoped governance proposals into pending tenant approvals", async () => {
    const source = makeTenantWorkspacePendingApprovalsSourceService({
      listRuntimeConfigProposals: (_requestContext, moduleId) =>
        Effect.succeed([
          {
            proposalId: `${moduleId}-tenant-pending`,
            moduleId,
            key:
              moduleId === platformModuleId.runtimeConfig
                ? runtimeConfigConfigKey.syncStrategy
                : tenantBrandingConfigKey.companyName,
            scope: tenant.scope,
            scopeId: tenant.scopeId,
            status: runtimeConfigSyncArtifactStatus.pending,
            changedBy: "usr_reviewer",
            changedAt: "2026-01-10T01:50:00.000Z",
            approvalReason: "Tenant review",
          },
          {
            proposalId: `${moduleId}-global-pending`,
            moduleId,
            key:
              moduleId === platformModuleId.runtimeConfig
                ? runtimeConfigConfigKey.approvalsEnabled
                : tenantBrandingConfigKey.supportEmail,
            status: runtimeConfigSyncArtifactStatus.pending,
            changedBy: "usr_reviewer",
            changedAt: "2026-01-10T01:45:00.000Z",
          },
        ] as const),
    });

    const approvals = await Effect.runPromise(
      source.fetch({
        requestContext,
        tenant,
        windowMinutes: 60,
      }),
    );

    expect(approvals).toEqual([
      {
        id: `${platformModuleId.runtimeConfig}-tenant-pending`,
        kind: "Runtime config review",
        target: `${platformModuleId.runtimeConfig}:${runtimeConfigConfigKey.syncStrategy}:${tenant.scopeId}`,
        requestedBy: "usr_reviewer",
        requestedAt: "2026-01-10T01:50:00.000Z",
        reasonPreview: "Tenant review",
        ttlSeconds: 0,
      },
      {
        id: `${platformModuleId.tenantBranding}-tenant-pending`,
        kind: "Branding review",
        target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${tenant.scopeId}`,
        requestedBy: "usr_reviewer",
        requestedAt: "2026-01-10T01:50:00.000Z",
        reasonPreview: "Tenant review",
        ttlSeconds: 0,
      },
    ]);
  });

  it("combines usage and revenue probe data into tenant usage spotlights", async () => {
    const capturedUsageQueries: Array<{
      tenantScopeId: string;
      meterSlug: string;
      from: string;
      to: string;
      granularity: string;
    }> = [];
    const source = makeTenantWorkspaceUsageSpotlightsSource(
      () =>
        Effect.succeed({
          openMeterApiClient: {
            fetchUsageBuckets: (input) =>
              Effect.sync(() => {
                capturedUsageQueries.push({
                  tenantScopeId: input.tenant.scopeId,
                  meterSlug: input.meterSlug,
                  from: input.window.from,
                  to: input.window.to,
                  granularity: input.granularity,
                });
                return [
                  { windowStart: input.window.from, value: 2 },
                  { windowStart: input.window.to, value: 3 },
                ] as const;
              }),
          },
          polarApiClient: {
            fetchRevenueSnapshotSource: () =>
              Effect.succeed({
                billingPeriodStart: "2026-01-01T00:00:00.000Z",
                billingPeriodEnd: "2026-01-31T23:59:59.999Z",
                subscriptionMrr: {
                  currency: "USD",
                  amountMinorUnits: 0,
                },
                churnRate: 0,
                expansion: {
                  currency: "USD",
                  amountMinorUnits: 0,
                },
                contraction: {
                  currency: "USD",
                  amountMinorUnits: 0,
                },
                projectedNextPeriodRevenue: {
                  currency: "USD",
                  amountMinorUnits: 12345,
                },
                activeSubscriptionCount: 7,
                sourcePolarAccountId: "organization:org_acme",
              }),
          },
        }),
      {
        now: () => new Date("2026-01-10T02:00:00.000Z"),
      },
    );

    const spotlights = await Effect.runPromise(
      source.fetch({
        requestContext,
        tenant,
        windowMinutes: 60,
      }),
    );

    expect(capturedUsageQueries).toEqual([
      {
        tenantScopeId: tenant.scopeId,
        meterSlug: "tenant.workspace.events",
        from: "2026-01-10T01:00:00.000Z",
        to: "2026-01-10T02:00:00.000Z",
        granularity: "HOUR",
      },
    ]);
    expect(spotlights).toEqual([
      expect.objectContaining({
        id: "usage-total",
        label: "Metered usage",
        value: 5,
        unit: "events",
      }),
      expect.objectContaining({
        id: "active-subscriptions",
        label: "Active subscriptions",
        value: 7,
        unit: "subs",
      }),
      expect.objectContaining({
        id: "projected-revenue",
        label: "Projected revenue",
        value: 123.45,
        unit: "USD",
      }),
    ]);
  });

  it("fails the usage spotlights section when both probe clients fail", async () => {
    const source = makeTenantWorkspaceUsageSpotlightsSource(() =>
      Effect.succeed({
        openMeterApiClient: {
          fetchUsageBuckets: () =>
            Effect.fail(
              new OpenMeterApiClientError({
                operation: "fetchUsageBuckets",
                tenant,
                meterSlug: "tenant.workspace.events",
                cause: new Error("openmeter down"),
              }),
            ),
        },
        polarApiClient: {
          fetchRevenueSnapshotSource: () =>
            Effect.fail(
              new PolarApiClientError({
                operation: "fetchRevenueSnapshotSource",
                tenant,
                cause: new Error("polar down"),
              }),
            ),
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        source.fetch({
          requestContext,
          tenant,
          windowMinutes: 60,
        }),
      ),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (!Either.isLeft(result)) {
      return;
    }
    expect(result.left).toBeInstanceOf(TenantWorkspaceSourceUnavailable);
    expect(result.left.args.section).toBe(
      tenantWorkspaceSnapshotSection.usageSpotlights,
    );
  });
});
