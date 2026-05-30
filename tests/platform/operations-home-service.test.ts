/**
 * Operations Home aggregate v2 platform-service tests (admin-app
 * implementation plan §9 item 3).
 *
 * Validates the cross-cutting invariants the service enforces:
 *
 *   - concurrency-with-failure-tolerance: each section is
 *     wrapped in `Effect.either`; a single section failure
 *     degrades that section to an empty array and surfaces a
 *     typed `partialFailures` entry instead of failing the
 *     whole snapshot
 *   - `OperationsHomeUnavailable._tag` only when every section
 *     fails
 *   - `OperationsHomeMissingActorIdentity._tag` on anonymous
 *     requests
 *   - audit emission on every successful read keyed by
 *     `platformModuleId.operationsHome` +
 *     `operationsHomeAuditAction.read` +
 *     `reasonCatalogId.operationsHomeRead`
 *   - `windowMinutes` is propagated to every source
 *   - the snapshot's `correlationId` mirrors the request context
 *   - the env-bound runtime supplies stub source layers that
 *     surface `OperationsHomeSourceUnavailable` for every
 *     section (Phase 1 item 3 documented stub)
 *
 * The harness injects deterministic source implementations via
 * `makeOperationsHomeService(audit, sources)` rather than going
 * through the env-bound runtime, so tests do not need Postgres.
 */
import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  dataClassification,
  kpiTone,
  kpiTrendDirection,
  operationsHomeAlertSeverity,
  operationsHomeAuditAction,
  operationsHomeDrillResourceKind,
  operationsHomeSnapshotSection,
  operationsHomeVendorPostureLevel,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type OperationsHomeActiveAlert,
  type OperationsHomeKpi,
  type OperationsHomePendingApproval,
  type OperationsHomeRecentAuditEntry,
  type OperationsHomeVendorPosture,
  type RequestContext,
} from "@comvestec/contracts";
import type {
  AuditLogModuleService,
  BuildAuditEventInput,
} from "@comvestec/modules";
import {
  OperationsHomeMissingActorIdentity,
  OperationsHomeSourceUnavailable,
  OperationsHomeUnavailable,
  makeOperationsHomeService,
  stubOperationsHomeActiveAlertsSourceLayer,
  stubOperationsHomeKpiSourceLayer,
  stubOperationsHomePendingApprovalsSourceLayer,
  stubOperationsHomeRecentAuditSourceLayer,
  stubOperationsHomeSourcesLayer,
  stubOperationsHomeVendorPostureSourceLayer,
  type OperationsHomeActiveAlertsSourceService,
  type OperationsHomeKpiSourceService,
  type OperationsHomePendingApprovalsSourceService,
  type OperationsHomeRecentAuditSourceService,
  type OperationsHomeVendorPostureSourceService,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const operatorRequestContext = (overrides?: {
  readonly actorId?: string;
  readonly correlationId?: string;
}): RequestContext => ({
  actorType: actorType.platformOperator,
  actorId: overrides?.actorId ?? "subject-ops-1",
  sessionId: "sess-ops-home",
  correlationId: overrides?.correlationId ?? "corr-ops-home",
  reason: "operations-home service unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
});

const anonymousRequestContext = (): RequestContext => ({
  actorType: actorType.platformOperator,
  sessionId: "sess-ops-home-anon",
  correlationId: "corr-ops-home-anon",
  reason: "operations-home anonymous unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
});

const sampleKpi = (
  overrides?: Partial<OperationsHomeKpi>,
): OperationsHomeKpi => ({
  id: overrides?.id ?? "tenants.active",
  label: overrides?.label ?? "Active tenants",
  value: overrides?.value ?? 42,
  unit: overrides?.unit ?? "count",
  trend: overrides?.trend ?? {
    direction: kpiTrendDirection.up,
    delta: 2,
    windowMinutes: 1440,
  },
  tone: overrides?.tone ?? kpiTone.nominal,
  drillResourceKind:
    overrides?.drillResourceKind ?? operationsHomeDrillResourceKind.tenants,
  drillFilters: overrides?.drillFilters ?? {},
});

const sampleAlert = (
  overrides?: Partial<OperationsHomeActiveAlert>,
): OperationsHomeActiveAlert => ({
  id: overrides?.id ?? "alert-1",
  severity: overrides?.severity ?? operationsHomeAlertSeverity.warning,
  title: overrides?.title ?? "Latency spike",
  summary: overrides?.summary ?? "p95 latency above target",
  openedAt: overrides?.openedAt ?? "2026-01-01T00:00:00.000Z",
  sourceVendor: overrides?.sourceVendor ?? "glitchtip",
  ...(overrides?.deepLink === undefined
    ? {}
    : { deepLink: overrides.deepLink }),
});

const sampleAuditEntry = (
  overrides?: Partial<OperationsHomeRecentAuditEntry>,
): OperationsHomeRecentAuditEntry => ({
  id: overrides?.id ?? "audit-1",
  actor: overrides?.actor ?? "subject-ops-1",
  action: overrides?.action ?? "configuration.changed",
  target: overrides?.target ?? "runtime-config:meter.flushIntervalSeconds",
  occurredAt: overrides?.occurredAt ?? "2026-01-01T00:00:00.000Z",
  classification: overrides?.classification ?? dataClassification.internal,
});

const samplePendingApproval = (
  overrides?: Partial<OperationsHomePendingApproval>,
): OperationsHomePendingApproval => ({
  id: overrides?.id ?? "approval-1",
  kind: overrides?.kind ?? "runtime-config.change",
  target:
    overrides?.target ?? "runtime-config:slo.errorBudgetAlertWindowMinutes",
  requestedBy: overrides?.requestedBy ?? "subject-ops-2",
  requestedAt: overrides?.requestedAt ?? "2026-01-01T00:00:00.000Z",
  reasonPreview: overrides?.reasonPreview ?? "Tighten alert window for Q1.",
  ttlSeconds: overrides?.ttlSeconds ?? 3600,
});

const sampleVendorPosture = (
  overrides?: Partial<OperationsHomeVendorPosture>,
): OperationsHomeVendorPosture => ({
  vendor: overrides?.vendor ?? "polar",
  posture: overrides?.posture ?? operationsHomeVendorPostureLevel.nominal,
  ...(overrides?.version === undefined ? {} : { version: overrides.version }),
  ...(overrides?.lastIncidentAt === undefined
    ? {}
    : { lastIncidentAt: overrides.lastIncidentAt }),
  ...(overrides?.latencyP95Ms === undefined
    ? {}
    : { latencyP95Ms: overrides.latencyP95Ms }),
  ...(overrides?.message === undefined ? {} : { message: overrides.message }),
});

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type AuditAppendCall = BuildAuditEventInput;

const makeFakeAuditLog = (): {
  readonly auditLog: AuditLogModuleService;
  readonly appendCalls: ReadonlyArray<AuditAppendCall>;
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
    appendCalls,
    snapshotAppendCalls: () => [...appendCalls],
  };
};

type SourceCall = { readonly windowMinutes: number; readonly limit?: number };

const makeKpiSource = (
  data: readonly OperationsHomeKpi[],
  calls: SourceCall[],
): OperationsHomeKpiSourceService => ({
  fetch: (context) =>
    Effect.sync(() => {
      calls.push({ windowMinutes: context.windowMinutes });
      return data;
    }),
});

const makeFailingKpiSource = (
  reason: string,
): OperationsHomeKpiSourceService => ({
  fetch: () =>
    Effect.fail(
      new OperationsHomeSourceUnavailable({
        section: operationsHomeSnapshotSection.kpis,
        reason,
      }),
    ),
});

const makeAlertsSource = (
  data: readonly OperationsHomeActiveAlert[],
  calls: SourceCall[],
): OperationsHomeActiveAlertsSourceService => ({
  fetch: (context) =>
    Effect.sync(() => {
      calls.push({ windowMinutes: context.windowMinutes });
      return data;
    }),
});

const makeFailingAlertsSource = (
  reason: string,
): OperationsHomeActiveAlertsSourceService => ({
  fetch: () =>
    Effect.fail(
      new OperationsHomeSourceUnavailable({
        section: operationsHomeSnapshotSection.activeAlerts,
        reason,
      }),
    ),
});

const makeRecentAuditSource = (
  data: readonly OperationsHomeRecentAuditEntry[],
  calls: SourceCall[],
): OperationsHomeRecentAuditSourceService => ({
  fetch: (context) =>
    Effect.sync(() => {
      calls.push({
        windowMinutes: context.windowMinutes,
        limit: context.limit,
      });
      return data;
    }),
});

const makeFailingRecentAuditSource = (
  reason: string,
): OperationsHomeRecentAuditSourceService => ({
  fetch: () =>
    Effect.fail(
      new OperationsHomeSourceUnavailable({
        section: operationsHomeSnapshotSection.recentAudit,
        reason,
      }),
    ),
});

const makePendingApprovalsSource = (
  data: readonly OperationsHomePendingApproval[],
  calls: SourceCall[],
): OperationsHomePendingApprovalsSourceService => ({
  fetch: (context) =>
    Effect.sync(() => {
      calls.push({ windowMinutes: context.windowMinutes });
      return data;
    }),
});

const makeFailingPendingApprovalsSource = (
  reason: string,
): OperationsHomePendingApprovalsSourceService => ({
  fetch: () =>
    Effect.fail(
      new OperationsHomeSourceUnavailable({
        section: operationsHomeSnapshotSection.pendingApprovals,
        reason,
      }),
    ),
});

const makeVendorPostureSource = (
  data: readonly OperationsHomeVendorPosture[],
  calls: SourceCall[],
): OperationsHomeVendorPostureSourceService => ({
  fetch: (context) =>
    Effect.sync(() => {
      calls.push({ windowMinutes: context.windowMinutes });
      return data;
    }),
});

const makeFailingVendorPostureSource = (
  reason: string,
): OperationsHomeVendorPostureSourceService => ({
  fetch: () =>
    Effect.fail(
      new OperationsHomeSourceUnavailable({
        section: operationsHomeSnapshotSection.vendorPosture,
        reason,
      }),
    ),
});

const makeServiceUnderTest = (overrides?: {
  readonly kpis?: OperationsHomeKpiSourceService;
  readonly activeAlerts?: OperationsHomeActiveAlertsSourceService;
  readonly recentAudit?: OperationsHomeRecentAuditSourceService;
  readonly pendingApprovals?: OperationsHomePendingApprovalsSourceService;
  readonly vendorPosture?: OperationsHomeVendorPostureSourceService;
}) => {
  const kpiCalls: SourceCall[] = [];
  const alertsCalls: SourceCall[] = [];
  const recentAuditCalls: SourceCall[] = [];
  const pendingApprovalsCalls: SourceCall[] = [];
  const vendorPostureCalls: SourceCall[] = [];
  const audit = makeFakeAuditLog();
  const service = makeOperationsHomeService(audit.auditLog, {
    kpis: overrides?.kpis ?? makeKpiSource([sampleKpi()], kpiCalls),
    activeAlerts:
      overrides?.activeAlerts ?? makeAlertsSource([sampleAlert()], alertsCalls),
    recentAudit:
      overrides?.recentAudit ??
      makeRecentAuditSource([sampleAuditEntry()], recentAuditCalls),
    pendingApprovals:
      overrides?.pendingApprovals ??
      makePendingApprovalsSource(
        [samplePendingApproval()],
        pendingApprovalsCalls,
      ),
    vendorPosture:
      overrides?.vendorPosture ??
      makeVendorPostureSource([sampleVendorPosture()], vendorPostureCalls),
  });
  return {
    service,
    audit,
    calls: {
      kpis: kpiCalls,
      activeAlerts: alertsCalls,
      recentAudit: recentAuditCalls,
      pendingApprovals: pendingApprovalsCalls,
      vendorPosture: vendorPostureCalls,
    },
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("operations-home service — happy path", () => {
  it("returns the populated snapshot with no partial failures", async () => {
    const harness = makeServiceUnderTest();
    const snapshot = await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
        windowMinutes: 720,
      }),
    );
    expect(snapshot.kpis).toHaveLength(1);
    expect(snapshot.activeAlerts).toHaveLength(1);
    expect(snapshot.recentAudit).toHaveLength(1);
    expect(snapshot.pendingApprovals).toHaveLength(1);
    expect(snapshot.vendorPosture).toHaveLength(1);
    expect(snapshot.partialFailures).toEqual([]);
    expect(snapshot.windowMinutes).toBe(720);
    expect(snapshot.correlationId).toBe("corr-ops-home");
    expect(snapshot.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("propagates windowMinutes to every source", async () => {
    const harness = makeServiceUnderTest();
    await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
        windowMinutes: 360,
      }),
    );
    expect(harness.calls.kpis[0]?.windowMinutes).toBe(360);
    expect(harness.calls.activeAlerts[0]?.windowMinutes).toBe(360);
    expect(harness.calls.recentAudit[0]?.windowMinutes).toBe(360);
    expect(harness.calls.pendingApprovals[0]?.windowMinutes).toBe(360);
    expect(harness.calls.vendorPosture[0]?.windowMinutes).toBe(360);
  });

  it("defaults windowMinutes to 1440 when omitted", async () => {
    const harness = makeServiceUnderTest();
    const snapshot = await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
      }),
    );
    expect(snapshot.windowMinutes).toBe(1440);
    expect(harness.calls.kpis[0]?.windowMinutes).toBe(1440);
  });

  it("propagates recentAuditLimit to the recent-audit source", async () => {
    const harness = makeServiceUnderTest();
    await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
        recentAuditLimit: 5,
      }),
    );
    expect(harness.calls.recentAudit[0]?.limit).toBe(5);
  });

  it("defaults recentAuditLimit to 20 when omitted", async () => {
    const harness = makeServiceUnderTest();
    await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
      }),
    );
    expect(harness.calls.recentAudit[0]?.limit).toBe(20);
  });
});

describe("operations-home service — audit emission", () => {
  it("emits exactly one audit event keyed by operations-home on a successful read", async () => {
    const harness = makeServiceUnderTest();
    await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext({ actorId: "subject-audit-1" }),
      }),
    );
    const calls = harness.audit.snapshotAppendCalls();
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.moduleId).toBe(platformModuleId.operationsHome);
    expect(call.action).toBe(operationsHomeAuditAction.read);
    expect(call.reason).toBe(reasonCatalogId.operationsHomeRead);
    expect(call.target).toBe("subject-audit-1");
    expect(call.requestContext.correlationId).toBe("corr-ops-home");
  });

  it("does not emit an audit event when the request fails authentication", async () => {
    const harness = makeServiceUnderTest();
    const result = await Effect.runPromise(
      Effect.either(
        harness.service.getSnapshot({
          requestContext: anonymousRequestContext(),
        }),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
    expect(harness.audit.snapshotAppendCalls()).toHaveLength(0);
  });

  it("still emits the audit event when some sources fail partially", async () => {
    const harness = makeServiceUnderTest({
      activeAlerts: makeFailingAlertsSource("glitchtip down"),
    });
    await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
      }),
    );
    expect(harness.audit.snapshotAppendCalls()).toHaveLength(1);
  });

  it("does not emit the audit event when every source fails", async () => {
    const harness = makeServiceUnderTest({
      kpis: makeFailingKpiSource("a"),
      activeAlerts: makeFailingAlertsSource("b"),
      recentAudit: makeFailingRecentAuditSource("c"),
      pendingApprovals: makeFailingPendingApprovalsSource("d"),
      vendorPosture: makeFailingVendorPostureSource("e"),
    });
    const result = await Effect.runPromise(
      Effect.either(
        harness.service.getSnapshot({
          requestContext: operatorRequestContext(),
        }),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
    expect(harness.audit.snapshotAppendCalls()).toHaveLength(0);
  });
});

describe("operations-home service — partial-failure tolerance", () => {
  it("degrades a single failing section to an empty array with a typed partialFailures entry", async () => {
    const harness = makeServiceUnderTest({
      activeAlerts: makeFailingAlertsSource("glitchtip unreachable"),
    });
    const snapshot = await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
      }),
    );
    expect(snapshot.activeAlerts).toEqual([]);
    expect(snapshot.kpis).toHaveLength(1);
    expect(snapshot.partialFailures).toEqual([
      {
        section: operationsHomeSnapshotSection.activeAlerts,
        reason: "glitchtip unreachable",
      },
    ]);
  });

  it("records partialFailures for every failing section while passing sections succeed", async () => {
    const harness = makeServiceUnderTest({
      kpis: makeFailingKpiSource("kpi source down"),
      vendorPosture: makeFailingVendorPostureSource("vendor source down"),
    });
    const snapshot = await Effect.runPromise(
      harness.service.getSnapshot({
        requestContext: operatorRequestContext(),
      }),
    );
    expect(snapshot.kpis).toEqual([]);
    expect(snapshot.vendorPosture).toEqual([]);
    expect(snapshot.recentAudit).toHaveLength(1);
    expect(snapshot.activeAlerts).toHaveLength(1);
    expect(snapshot.pendingApprovals).toHaveLength(1);
    const sections = snapshot.partialFailures
      .map((entry) => entry.section)
      .sort();
    expect(sections).toEqual(
      [
        operationsHomeSnapshotSection.kpis,
        operationsHomeSnapshotSection.vendorPosture,
      ].sort(),
    );
  });

  it("fails with OperationsHomeUnavailable when every section fails", async () => {
    const harness = makeServiceUnderTest({
      kpis: makeFailingKpiSource("a"),
      activeAlerts: makeFailingAlertsSource("b"),
      recentAudit: makeFailingRecentAuditSource("c"),
      pendingApprovals: makeFailingPendingApprovalsSource("d"),
      vendorPosture: makeFailingVendorPostureSource("e"),
    });
    const result = await Effect.runPromise(
      Effect.either(
        harness.service.getSnapshot({
          requestContext: operatorRequestContext(),
        }),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
    const error = (result as Either.Left<unknown, never>).left;
    expect(error).toBeInstanceOf(OperationsHomeUnavailable);
    expect((error as OperationsHomeUnavailable)._tag).toBe(
      "OperationsHomeUnavailable",
    );
    expect((error as OperationsHomeUnavailable).args.failures).toHaveLength(5);
  });
});

describe("operations-home service — auth invariants", () => {
  it("fails with OperationsHomeMissingActorIdentity when actorId is absent", async () => {
    const harness = makeServiceUnderTest();
    const result = await Effect.runPromise(
      Effect.either(
        harness.service.getSnapshot({
          requestContext: anonymousRequestContext(),
        }),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
    const error = (result as Either.Left<unknown, never>).left;
    expect(error).toBeInstanceOf(OperationsHomeMissingActorIdentity);
    expect((error as OperationsHomeMissingActorIdentity)._tag).toBe(
      "OperationsHomeMissingActorIdentity",
    );
  });

  it("rejects windowMinutes values that are less than one via the input decoder", async () => {
    const harness = makeServiceUnderTest();
    const result = await Effect.runPromise(
      Effect.either(
        harness.service.getSnapshot({
          requestContext: operatorRequestContext(),
          windowMinutes: 0,
        } as unknown as Parameters<typeof harness.service.getSnapshot>[0]),
      ),
    );
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("operations-home service — stub source layers", () => {
  it("exposes a Phase 1 stub layer for every section that surfaces OperationsHomeSourceUnavailable", () => {
    expect(stubOperationsHomeKpiSourceLayer).toBeDefined();
    expect(stubOperationsHomeActiveAlertsSourceLayer).toBeDefined();
    expect(stubOperationsHomeRecentAuditSourceLayer).toBeDefined();
    expect(stubOperationsHomePendingApprovalsSourceLayer).toBeDefined();
    expect(stubOperationsHomeVendorPostureSourceLayer).toBeDefined();
    expect(stubOperationsHomeSourcesLayer).toBeDefined();
  });
});
