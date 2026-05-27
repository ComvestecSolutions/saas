/**
 * Tenant workspace aggregate v2 platform-service tests
 * (admin-app implementation plan §9 item 4).
 *
 * Validates the cross-cutting invariants the service enforces:
 *
 *   - concurrency-with-failure-tolerance: each section is
 *     wrapped in `Effect.either`; a single section failure
 *     degrades that section to an empty array (or `null` for
 *     tenantOverview) and surfaces a typed `partialFailures`
 *     entry instead of failing the whole snapshot
 *   - `TenantWorkspaceUnavailable._tag` only when every section
 *     fails
 *   - `TenantWorkspaceMissingActorIdentity._tag` on anonymous
 *     requests
 *   - NEW: `TenantWorkspaceCrossTenantAccessDenied._tag` when a
 *     non-platform-operator actor requests a snapshot for a
 *     tenant whose context does not match the trusted
 *     `requestContext.tenant`. This must reject BEFORE any
 *     source is invoked and BEFORE any audit event is emitted.
 *   - audit emission on every successful read keyed by
 *     `platformModuleId.tenantWorkspace` +
 *     `tenantWorkspaceAuditAction.read` +
 *     `reasonCatalogId.tenantWorkspaceRead` with the inspected
 *     `tenant.scopeId` as the audit target
 *   - tenant + windowMinutes propagation to every source
 *   - the snapshot's `correlationId` mirrors the request context
 *     and `tenant` mirrors the input
 *   - the exported historical stub layers still surface
 *     `TenantWorkspaceSourceUnavailable` for the documented
 *     placeholder seams
 *
 * The harness injects deterministic source implementations via
 * `makeTenantWorkspaceService(audit, sources)` rather than
 * going through the env-bound runtime, so tests do not need
 * Postgres.
 */
import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  billingSubscriptionStatus,
  dataClassification,
  kpiTone,
  kpiTrendDirection,
  operationsHomeDrillResourceKind,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  tenantWorkspaceAuditAction,
  tenantWorkspaceBrandingState,
  tenantWorkspaceIncidentSeverity,
  tenantWorkspaceMemberRole,
  tenantWorkspaceSnapshotSection,
  type RequestContext,
  type TenantContext,
  type TenantWorkspaceMember,
  type TenantWorkspaceOpenIncident,
  type TenantWorkspaceOverview,
  type TenantWorkspacePendingApproval,
  type TenantWorkspaceRecentActivityEntry,
  type TenantWorkspaceUsageSpotlight,
} from "@comvestec/contracts";
import type {
  AuditLogModuleService,
  BuildAuditEventInput,
} from "@comvestec/modules";
import {
  makeTenantWorkspaceService,
  stubTenantWorkspaceMembersSourceLayer,
  stubTenantWorkspaceOpenIncidentsSourceLayer,
  stubTenantWorkspaceOverviewSourceLayer,
  stubTenantWorkspacePendingApprovalsSourceLayer,
  stubTenantWorkspaceRecentActivitySourceLayer,
  stubTenantWorkspaceSourcesLayer,
  stubTenantWorkspaceUsageSpotlightsSourceLayer,
  TenantWorkspaceCrossTenantAccessDenied,
  TenantWorkspaceMissingActorIdentity,
  TenantWorkspaceSourceUnavailable,
  TenantWorkspaceUnavailable,
  type TenantWorkspaceMembersSourceService,
  type TenantWorkspaceOpenIncidentsSourceService,
  type TenantWorkspaceOverviewSourceService,
  type TenantWorkspacePendingApprovalsSourceService,
  type TenantWorkspaceRecentActivitySourceService,
  type TenantWorkspaceUsageSpotlightsSourceService,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const platformTenant: TenantContext = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
};

const orgTenant = (scopeId = "org-alpha"): TenantContext => ({
  scope: platformScope.organization,
  scopeId,
});

const operatorRequestContext = (overrides?: {
  readonly actorId?: string;
  readonly correlationId?: string;
}): RequestContext => ({
  actorType: actorType.platformOperator,
  actorId: overrides?.actorId ?? "subject-ops-1",
  sessionId: "sess-tenant-ws",
  correlationId: overrides?.correlationId ?? "corr-tenant-ws",
  reason: "tenant-workspace service unit test",
  tenant: platformTenant,
});

const organizationAdminRequestContext = (
  tenant: TenantContext,
  overrides?: {
    readonly actorId?: string;
    readonly correlationId?: string;
  },
): RequestContext => ({
  actorType: actorType.organizationAdmin,
  actorId: overrides?.actorId ?? "subject-org-admin-1",
  sessionId: "sess-org-admin",
  correlationId: overrides?.correlationId ?? "corr-org-admin",
  reason: "tenant-workspace org-admin unit test",
  tenant,
});

const anonymousRequestContext = (
  tenant: TenantContext = platformTenant,
): RequestContext => ({
  actorType: actorType.platformOperator,
  sessionId: "sess-tenant-ws-anon",
  correlationId: "corr-tenant-ws-anon",
  reason: "tenant-workspace anonymous unit test",
  tenant,
});

const sampleOverview = (
  overrides?: Partial<TenantWorkspaceOverview>,
): TenantWorkspaceOverview => ({
  displayName: overrides?.displayName ?? "Alpha Org",
  brandingState:
    overrides?.brandingState ?? tenantWorkspaceBrandingState.published,
  planTier: overrides?.planTier ?? "growth",
  ...(overrides?.billingStatus === undefined
    ? { billingStatus: billingSubscriptionStatus.active }
    : { billingStatus: overrides.billingStatus }),
  legalHoldActive: overrides?.legalHoldActive ?? false,
});

const sampleMember = (
  overrides?: Partial<TenantWorkspaceMember>,
): TenantWorkspaceMember => ({
  subjectId: overrides?.subjectId ?? "subject-member-1",
  displayName: overrides?.displayName ?? "Member One",
  role: overrides?.role ?? tenantWorkspaceMemberRole.member,
  ...(overrides?.lastSeenAt === undefined
    ? {}
    : { lastSeenAt: overrides.lastSeenAt }),
});

const sampleActivityEntry = (
  overrides?: Partial<TenantWorkspaceRecentActivityEntry>,
): TenantWorkspaceRecentActivityEntry => ({
  id: overrides?.id ?? "audit-1",
  actor: overrides?.actor ?? "subject-member-1",
  action: overrides?.action ?? "tenant.update",
  target: overrides?.target ?? "tenant:org-alpha",
  occurredAt: overrides?.occurredAt ?? "2026-01-01T00:00:00.000Z",
  classification: overrides?.classification ?? dataClassification.internal,
});

const sampleIncident = (
  overrides?: Partial<TenantWorkspaceOpenIncident>,
): TenantWorkspaceOpenIncident => ({
  id: overrides?.id ?? "incident-1",
  vendor: overrides?.vendor ?? "glitchtip",
  severity: overrides?.severity ?? tenantWorkspaceIncidentSeverity.warning,
  title: overrides?.title ?? "Latency spike for tenant",
  summary: overrides?.summary ?? "p95 latency above SLO for tenant traffic",
  openedAt: overrides?.openedAt ?? "2026-01-01T00:00:00.000Z",
  ...(overrides?.deepLink === undefined
    ? {}
    : { deepLink: overrides.deepLink }),
});

const sampleSpotlight = (
  overrides?: Partial<TenantWorkspaceUsageSpotlight>,
): TenantWorkspaceUsageSpotlight => ({
  id: overrides?.id ?? "tenant.api.requests",
  label: overrides?.label ?? "API requests (24h)",
  value: overrides?.value ?? 4200,
  unit: overrides?.unit ?? "count",
  trend: overrides?.trend ?? {
    direction: kpiTrendDirection.up,
    delta: 5,
    windowMinutes: 1440,
  },
  tone: overrides?.tone ?? kpiTone.nominal,
  drillResourceKind:
    overrides?.drillResourceKind ??
    operationsHomeDrillResourceKind.openmeterUsage,
  drillFilters: overrides?.drillFilters ?? { tenantScopeId: "org-alpha" },
});

const samplePendingApproval = (
  overrides?: Partial<TenantWorkspacePendingApproval>,
): TenantWorkspacePendingApproval => ({
  id: overrides?.id ?? "approval-1",
  kind: overrides?.kind ?? "tenant.invitation.issue",
  target: overrides?.target ?? "tenant:org-alpha",
  requestedBy: overrides?.requestedBy ?? "subject-ops-2",
  requestedAt: overrides?.requestedAt ?? "2026-01-01T00:00:00.000Z",
  reasonPreview: overrides?.reasonPreview ?? "Add new member to tenant.",
  ttlSeconds: overrides?.ttlSeconds ?? 3600,
});

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type AuditAppendCall = BuildAuditEventInput;

const makeFakeAuditLog = (): {
  readonly auditLog: AuditLogModuleService;
  readonly snapshotAppendCalls: () => ReadonlyArray<AuditAppendCall>;
} => {
  const appendCalls: AuditAppendCall[] = [];
  const auditLog: AuditLogModuleService = {
    append: (input) =>
      Effect.sync(() => {
        appendCalls.push(input);
        return {
          eventId: `evt-${appendCalls.length}`,
          timestamp: "2026-01-01T00:00:00.000Z",
          actorId:
            input.requestContext.actorId ??
            `${input.requestContext.actorType}:anonymous`,
          tenantScope: input.requestContext.tenant.scope,
          tenantScopeId: input.requestContext.tenant.scopeId,
          moduleId: input.moduleId,
          action: input.action,
          target: input.target,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
          correlationId: input.requestContext.correlationId,
        };
      }),
    queryByModule: () => Effect.succeed([]),
    queryByTarget: () => Effect.succeed([]),
    queryByActor: () => Effect.succeed([]),
    queryByTenant: () => Effect.succeed([]),
    requirements: Effect.succeed([]),
  };
  return {
    auditLog,
    snapshotAppendCalls: () => [...appendCalls],
  };
};

type SourceCall = {
  readonly windowMinutes: number;
  readonly tenant: TenantContext;
  readonly limit?: number;
};

const makeOverviewSource = (
  data: TenantWorkspaceOverview,
  calls: SourceCall[],
): TenantWorkspaceOverviewSourceService => ({
  fetch: (context) =>
    Effect.sync(() => {
      calls.push({
        windowMinutes: context.windowMinutes,
        tenant: context.tenant,
      });
      return data;
    }),
});

const makeFailingOverviewSource = (
  reason: string,
): TenantWorkspaceOverviewSourceService => ({
  fetch: () =>
    Effect.fail(
      new TenantWorkspaceSourceUnavailable({
        section: tenantWorkspaceSnapshotSection.tenantOverview,
        reason,
      }),
    ),
});

const makeMembersSource = (
  data: readonly TenantWorkspaceMember[],
  calls: SourceCall[],
): TenantWorkspaceMembersSourceService => ({
  fetch: (context) =>
    Effect.sync(() => {
      calls.push({
        windowMinutes: context.windowMinutes,
        tenant: context.tenant,
        limit: context.limit,
      });
      return data;
    }),
});

const makeFailingMembersSource = (
  reason: string,
): TenantWorkspaceMembersSourceService => ({
  fetch: () =>
    Effect.fail(
      new TenantWorkspaceSourceUnavailable({
        section: tenantWorkspaceSnapshotSection.members,
        reason,
      }),
    ),
});

const makeRecentActivitySource = (
  data: readonly TenantWorkspaceRecentActivityEntry[],
  calls: SourceCall[],
): TenantWorkspaceRecentActivitySourceService => ({
  fetch: (context) =>
    Effect.sync(() => {
      calls.push({
        windowMinutes: context.windowMinutes,
        tenant: context.tenant,
        limit: context.limit,
      });
      return data;
    }),
});

const makeFailingRecentActivitySource = (
  reason: string,
): TenantWorkspaceRecentActivitySourceService => ({
  fetch: () =>
    Effect.fail(
      new TenantWorkspaceSourceUnavailable({
        section: tenantWorkspaceSnapshotSection.recentActivity,
        reason,
      }),
    ),
});

const makeOpenIncidentsSource = (
  data: readonly TenantWorkspaceOpenIncident[],
  calls: SourceCall[],
): TenantWorkspaceOpenIncidentsSourceService => ({
  fetch: (context) =>
    Effect.sync(() => {
      calls.push({
        windowMinutes: context.windowMinutes,
        tenant: context.tenant,
      });
      return data;
    }),
});

const makeFailingOpenIncidentsSource = (
  reason: string,
): TenantWorkspaceOpenIncidentsSourceService => ({
  fetch: () =>
    Effect.fail(
      new TenantWorkspaceSourceUnavailable({
        section: tenantWorkspaceSnapshotSection.openIncidents,
        reason,
      }),
    ),
});

const makeUsageSpotlightsSource = (
  data: readonly TenantWorkspaceUsageSpotlight[],
  calls: SourceCall[],
): TenantWorkspaceUsageSpotlightsSourceService => ({
  fetch: (context) =>
    Effect.sync(() => {
      calls.push({
        windowMinutes: context.windowMinutes,
        tenant: context.tenant,
      });
      return data;
    }),
});

const makeFailingUsageSpotlightsSource = (
  reason: string,
): TenantWorkspaceUsageSpotlightsSourceService => ({
  fetch: () =>
    Effect.fail(
      new TenantWorkspaceSourceUnavailable({
        section: tenantWorkspaceSnapshotSection.usageSpotlights,
        reason,
      }),
    ),
});

const makePendingApprovalsSource = (
  data: readonly TenantWorkspacePendingApproval[],
  calls: SourceCall[],
): TenantWorkspacePendingApprovalsSourceService => ({
  fetch: (context) =>
    Effect.sync(() => {
      calls.push({
        windowMinutes: context.windowMinutes,
        tenant: context.tenant,
      });
      return data;
    }),
});

const makeFailingPendingApprovalsSource = (
  reason: string,
): TenantWorkspacePendingApprovalsSourceService => ({
  fetch: () =>
    Effect.fail(
      new TenantWorkspaceSourceUnavailable({
        section: tenantWorkspaceSnapshotSection.pendingTenantApprovals,
        reason,
      }),
    ),
});

const makeServiceUnderTest = (overrides?: {
  readonly tenantOverview?: TenantWorkspaceOverviewSourceService;
  readonly members?: TenantWorkspaceMembersSourceService;
  readonly recentActivity?: TenantWorkspaceRecentActivitySourceService;
  readonly openIncidents?: TenantWorkspaceOpenIncidentsSourceService;
  readonly usageSpotlights?: TenantWorkspaceUsageSpotlightsSourceService;
  readonly pendingTenantApprovals?: TenantWorkspacePendingApprovalsSourceService;
}) => {
  const overviewCalls: SourceCall[] = [];
  const membersCalls: SourceCall[] = [];
  const recentActivityCalls: SourceCall[] = [];
  const incidentsCalls: SourceCall[] = [];
  const spotlightsCalls: SourceCall[] = [];
  const approvalsCalls: SourceCall[] = [];
  const audit = makeFakeAuditLog();
  const service = makeTenantWorkspaceService(audit.auditLog, {
    tenantOverview:
      overrides?.tenantOverview ??
      makeOverviewSource(sampleOverview(), overviewCalls),
    members:
      overrides?.members ?? makeMembersSource([sampleMember()], membersCalls),
    recentActivity:
      overrides?.recentActivity ??
      makeRecentActivitySource([sampleActivityEntry()], recentActivityCalls),
    openIncidents:
      overrides?.openIncidents ??
      makeOpenIncidentsSource([sampleIncident()], incidentsCalls),
    usageSpotlights:
      overrides?.usageSpotlights ??
      makeUsageSpotlightsSource([sampleSpotlight()], spotlightsCalls),
    pendingTenantApprovals:
      overrides?.pendingTenantApprovals ??
      makePendingApprovalsSource([samplePendingApproval()], approvalsCalls),
  });
  return {
    service,
    audit,
    calls: {
      tenantOverview: overviewCalls,
      members: membersCalls,
      recentActivity: recentActivityCalls,
      openIncidents: incidentsCalls,
      usageSpotlights: spotlightsCalls,
      pendingTenantApprovals: approvalsCalls,
    },
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("tenant-workspace service — happy path", () => {
  it("returns the populated snapshot with no partial failures", async () => {
    const harness = makeServiceUnderTest();
    const snapshot = await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
        tenant: orgTenant(),
        windowMinutes: 720,
      }),
    );
    expect(snapshot.tenantOverview).not.toBeNull();
    expect(snapshot.tenantOverview?.displayName).toBe("Alpha Org");
    expect(snapshot.members).toHaveLength(1);
    expect(snapshot.recentActivity).toHaveLength(1);
    expect(snapshot.openIncidents).toHaveLength(1);
    expect(snapshot.usageSpotlights).toHaveLength(1);
    expect(snapshot.pendingTenantApprovals).toHaveLength(1);
    expect(snapshot.partialFailures).toEqual([]);
    expect(snapshot.windowMinutes).toBe(720);
    expect(snapshot.correlationId).toBe("corr-tenant-ws");
    expect(snapshot.tenant).toEqual(orgTenant());
    expect(snapshot.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("propagates tenant + windowMinutes to every source", async () => {
    const harness = makeServiceUnderTest();
    const tenant = orgTenant("org-beta");
    await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
        tenant,
        windowMinutes: 360,
      }),
    );
    for (const calls of [
      harness.calls.tenantOverview,
      harness.calls.members,
      harness.calls.recentActivity,
      harness.calls.openIncidents,
      harness.calls.usageSpotlights,
      harness.calls.pendingTenantApprovals,
    ]) {
      expect(calls[0]?.windowMinutes).toBe(360);
      expect(calls[0]?.tenant).toEqual(tenant);
    }
  });

  it("defaults windowMinutes/membersLimit/recentActivityLimit when omitted", async () => {
    const harness = makeServiceUnderTest();
    const snapshot = await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
        tenant: orgTenant(),
      }),
    );
    expect(snapshot.windowMinutes).toBe(1440);
    expect(harness.calls.members[0]?.limit).toBe(20);
    expect(harness.calls.recentActivity[0]?.limit).toBe(20);
  });

  it("propagates explicit membersLimit + recentActivityLimit", async () => {
    const harness = makeServiceUnderTest();
    await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
        tenant: orgTenant(),
        membersLimit: 5,
        recentActivityLimit: 7,
      }),
    );
    expect(harness.calls.members[0]?.limit).toBe(5);
    expect(harness.calls.recentActivity[0]?.limit).toBe(7);
  });
});

describe("tenant-workspace service — audit emission", () => {
  it("emits exactly one audit event keyed by tenant-workspace targeting the inspected tenant.scopeId on success", async () => {
    const harness = makeServiceUnderTest();
    await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext({ actorId: "subject-audit-1" }),
        tenant: orgTenant("org-target-1"),
      }),
    );
    const calls = harness.audit.snapshotAppendCalls();
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.moduleId).toBe(platformModuleId.tenantWorkspace);
    expect(call.action).toBe(tenantWorkspaceAuditAction.read);
    expect(call.reason).toBe(reasonCatalogId.tenantWorkspaceRead);
    expect(call.target).toBe("org-target-1");
    expect(call.requestContext.correlationId).toBe("corr-tenant-ws");
  });

  it("still emits the audit event when some sections fail partially", async () => {
    const harness = makeServiceUnderTest({
      openIncidents: makeFailingOpenIncidentsSource("glitchtip down"),
    });
    await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
        tenant: orgTenant(),
      }),
    );
    expect(harness.audit.snapshotAppendCalls()).toHaveLength(1);
  });

  it("does not emit the audit event when every section fails", async () => {
    const harness = makeServiceUnderTest({
      tenantOverview: makeFailingOverviewSource("a"),
      members: makeFailingMembersSource("b"),
      recentActivity: makeFailingRecentActivitySource("c"),
      openIncidents: makeFailingOpenIncidentsSource("d"),
      usageSpotlights: makeFailingUsageSpotlightsSource("e"),
      pendingTenantApprovals: makeFailingPendingApprovalsSource("f"),
    });
    const result = await Effect.runPromise(
      Effect.either(
        harness.service.getSnapshot({
          requestContext: operatorRequestContext(),
          tenant: orgTenant(),
        }),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
    expect(harness.audit.snapshotAppendCalls()).toHaveLength(0);
  });

  it("does not emit an audit event when the request fails authentication", async () => {
    const harness = makeServiceUnderTest();
    const result = await Effect.runPromise(
      Effect.either(
        harness.service.getSnapshot({
          requestContext: anonymousRequestContext(),
          tenant: orgTenant(),
        }),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
    expect(harness.audit.snapshotAppendCalls()).toHaveLength(0);
  });
});

describe("tenant-workspace service — partial-failure tolerance", () => {
  it("degrades tenantOverview to null with a typed partialFailures entry when its source fails", async () => {
    const harness = makeServiceUnderTest({
      tenantOverview: makeFailingOverviewSource("tenant-mgmt unreachable"),
    });
    const snapshot = await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
        tenant: orgTenant(),
      }),
    );
    expect(snapshot.tenantOverview).toBeNull();
    expect(snapshot.members).toHaveLength(1);
    expect(snapshot.partialFailures).toEqual([
      {
        section: tenantWorkspaceSnapshotSection.tenantOverview,
        reason: "tenant-mgmt unreachable",
      },
    ]);
  });

  it("degrades a single failing array section to [] with a typed partialFailures entry", async () => {
    const harness = makeServiceUnderTest({
      openIncidents: makeFailingOpenIncidentsSource("glitchtip unreachable"),
    });
    const snapshot = await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
        tenant: orgTenant(),
      }),
    );
    expect(snapshot.openIncidents).toEqual([]);
    expect(snapshot.tenantOverview).not.toBeNull();
    expect(snapshot.partialFailures).toEqual([
      {
        section: tenantWorkspaceSnapshotSection.openIncidents,
        reason: "glitchtip unreachable",
      },
    ]);
  });

  it("records partialFailures for every failing section while passing sections succeed", async () => {
    const harness = makeServiceUnderTest({
      members: makeFailingMembersSource("members down"),
      usageSpotlights: makeFailingUsageSpotlightsSource("openmeter down"),
    });
    const snapshot = await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
        tenant: orgTenant(),
      }),
    );
    expect(snapshot.members).toEqual([]);
    expect(snapshot.usageSpotlights).toEqual([]);
    expect(snapshot.recentActivity).toHaveLength(1);
    expect(snapshot.openIncidents).toHaveLength(1);
    expect(snapshot.pendingTenantApprovals).toHaveLength(1);
    expect(snapshot.tenantOverview).not.toBeNull();
    const sections = snapshot.partialFailures
      .map((entry) => entry.section)
      .sort();
    expect(sections).toEqual(
      [
        tenantWorkspaceSnapshotSection.members,
        tenantWorkspaceSnapshotSection.usageSpotlights,
      ].sort(),
    );
  });

  it("fails with TenantWorkspaceUnavailable when every section fails", async () => {
    const harness = makeServiceUnderTest({
      tenantOverview: makeFailingOverviewSource("a"),
      members: makeFailingMembersSource("b"),
      recentActivity: makeFailingRecentActivitySource("c"),
      openIncidents: makeFailingOpenIncidentsSource("d"),
      usageSpotlights: makeFailingUsageSpotlightsSource("e"),
      pendingTenantApprovals: makeFailingPendingApprovalsSource("f"),
    });
    const result = await Effect.runPromise(
      Effect.either(
        harness.service.getSnapshot({
          requestContext: operatorRequestContext(),
          tenant: orgTenant(),
        }),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
    const error = (result as Either.Left<unknown, never>).left;
    expect(error).toBeInstanceOf(TenantWorkspaceUnavailable);
    expect((error as TenantWorkspaceUnavailable)._tag).toBe(
      "TenantWorkspaceUnavailable",
    );
    expect((error as TenantWorkspaceUnavailable).args.failures).toHaveLength(6);
  });
});

describe("tenant-workspace service — auth invariants", () => {
  it("fails with TenantWorkspaceMissingActorIdentity when actorId is absent", async () => {
    const harness = makeServiceUnderTest();
    const result = await Effect.runPromise(
      Effect.either(
        harness.service.getSnapshot({
          requestContext: anonymousRequestContext(),
          tenant: orgTenant(),
        }),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
    const error = (result as Either.Left<unknown, never>).left;
    expect(error).toBeInstanceOf(TenantWorkspaceMissingActorIdentity);
    expect((error as TenantWorkspaceMissingActorIdentity)._tag).toBe(
      "TenantWorkspaceMissingActorIdentity",
    );
  });

  it("rejects windowMinutes values that are less than one via the input decoder", async () => {
    const harness = makeServiceUnderTest();
    const result = await Effect.runPromise(
      Effect.either(
        harness.service.getSnapshot({
          requestContext: operatorRequestContext(),
          tenant: orgTenant(),
          windowMinutes: 0,
        } as unknown as Parameters<typeof harness.service.getSnapshot>[0]),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("tenant-workspace service — tenant-isolation invariant", () => {
  it("rejects a non-platform-operator actor whose requestContext.tenant does not match the input tenant", async () => {
    const harness = makeServiceUnderTest();
    const orgAdminTenant = orgTenant("org-self");
    const targetTenant = orgTenant("org-target");
    const result = await Effect.runPromise(
      Effect.either(
        harness.service.getSnapshot({
          requestContext: organizationAdminRequestContext(orgAdminTenant),
          tenant: targetTenant,
        }),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
    const error = (result as Either.Left<unknown, never>).left;
    expect(error).toBeInstanceOf(TenantWorkspaceCrossTenantAccessDenied);
    expect((error as TenantWorkspaceCrossTenantAccessDenied)._tag).toBe(
      "TenantWorkspaceCrossTenantAccessDenied",
    );
    // No source is invoked and no audit is emitted on cross-tenant probe
    expect(harness.calls.tenantOverview).toHaveLength(0);
    expect(harness.calls.members).toHaveLength(0);
    expect(harness.calls.recentActivity).toHaveLength(0);
    expect(harness.calls.openIncidents).toHaveLength(0);
    expect(harness.calls.usageSpotlights).toHaveLength(0);
    expect(harness.calls.pendingTenantApprovals).toHaveLength(0);
    expect(harness.audit.snapshotAppendCalls()).toHaveLength(0);
  });

  it("allows a non-platform-operator actor whose requestContext.tenant matches the input tenant", async () => {
    const harness = makeServiceUnderTest();
    const tenant = orgTenant("org-self");
    const snapshot = await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: organizationAdminRequestContext(tenant),
        tenant,
      }),
    );
    expect(snapshot.tenant).toEqual(tenant);
    expect(snapshot.partialFailures).toEqual([]);
    expect(harness.audit.snapshotAppendCalls()).toHaveLength(1);
  });

  it("allows a platform-operator to inspect any tenant even when tenants differ", async () => {
    const harness = makeServiceUnderTest();
    const targetTenant = orgTenant("org-target-7");
    const snapshot = await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
        tenant: targetTenant,
      }),
    );
    expect(snapshot.tenant).toEqual(targetTenant);
    expect(harness.audit.snapshotAppendCalls()[0]?.target).toBe("org-target-7");
  });
});

describe("tenant-workspace service — stub source layers", () => {
  it("exposes a Phase 1 stub layer for every section that surfaces TenantWorkspaceSourceUnavailable", () => {
    expect(stubTenantWorkspaceOverviewSourceLayer).toBeDefined();
    expect(stubTenantWorkspaceMembersSourceLayer).toBeDefined();
    expect(stubTenantWorkspaceRecentActivitySourceLayer).toBeDefined();
    expect(stubTenantWorkspaceOpenIncidentsSourceLayer).toBeDefined();
    expect(stubTenantWorkspaceUsageSpotlightsSourceLayer).toBeDefined();
    expect(stubTenantWorkspacePendingApprovalsSourceLayer).toBeDefined();
    expect(stubTenantWorkspaceSourcesLayer).toBeDefined();
  });
});
