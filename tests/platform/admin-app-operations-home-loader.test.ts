/**
 * Admin-app Operations Home v2 loader tests (admin-app
 * implementation plan §9 item 3). Covers the discriminated-
 * union mapping: SubscriberJourneySessionIdMissingError → shell,
 * IdentitySessionRequestContextNotFoundError → stale-session,
 * OperationsHomeUnavailable → admin-control-plane fallback (or
 * error when the fallback also fails), ParseError → error, and the
 * ready variant surfacing `partialFailures`.
 */
import { describe, expect, it } from "vitest";
import { Effect, ParseResult, Schema } from "effect";
import {
  adminRoutePath,
  adminOperatorCapability,
  actorType,
  platformScope,
  platformAdapterServiceName,
  platformModuleId,
  supportOperationsAuditAction,
  type OperationsHomeSnapshot,
  type RequestContext,
  type VendorHealthAggregateProjection,
} from "@comvestec/contracts";
import type { AdminOperationsHomeSummary } from "@comvestec/platform";
import { loadAdminOperationsHomeRouteDataFromRequest } from "../../apps/admin-app/src/lib/operations-home-route-data";

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator",
  sessionId: "sess-admin-ops-home-loader",
  correlationId: "corr-admin-ops-home-loader",
  reason: "operations-home loader test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const buildSnapshot = (
  overrides: Partial<OperationsHomeSnapshot> = {},
): OperationsHomeSnapshot => ({
  generatedAt: overrides.generatedAt ?? "2026-01-01T00:00:00.000Z",
  correlationId: overrides.correlationId ?? trustedRequestContext.correlationId,
  windowMinutes: overrides.windowMinutes ?? 60,
  kpis: overrides.kpis ?? [],
  activeAlerts: overrides.activeAlerts ?? [],
  recentAudit: overrides.recentAudit ?? [],
  pendingApprovals: overrides.pendingApprovals ?? [],
  vendorPosture: overrides.vendorPosture ?? [],
  partialFailures: overrides.partialFailures ?? [],
});

const buildFallbackSummary = (): AdminOperationsHomeSummary => ({
  capabilities: {
    actorType: trustedRequestContext.actorType,
    actorId: trustedRequestContext.actorId!,
    sessionId: trustedRequestContext.sessionId,
    capabilities: [
      {
        capability: adminOperatorCapability.operationsHome,
        routePath: adminRoutePath.operationsHome,
        visible: true,
        allowed: true,
        label: "Operations Home",
        actionPolicyIds: [],
      },
    ],
  },
  posture: {
    openRepairGaps: 2,
    blockedRepairGaps: 1,
    scheduledRepairGaps: 1,
    staleRunningRepairGaps: 0,
    openSupportCases: 3,
    escalatedSupportCases: 1,
    activeImpersonationSessions: 0,
    revocationPendingImpersonationSessions: 1,
    pendingBreakGlassIncidents: 2,
    pendingRuntimeConfigProposals: 1,
    pendingBrandingProposals: 0,
  },
  alerts: [
    {
      id: "pending-break-glass-incidents",
      severity: "warning",
      title: "Break-glass reviews are pending",
      detail: "Incident reviews remain open.",
      href: adminRoutePath.supportOperations,
      count: 2,
    },
  ],
  recentActivity: {
    pageInfo: {
      page: {
        page: 1,
        pageSize: 5,
      },
      totalItems: 1,
      totalPages: 1,
      exportMode: false,
    },
    items: [
      {
        eventId: "audit_evt_support_break_glass",
        timestamp: "2026-01-01T00:05:00.000Z",
        actorId: trustedRequestContext.actorId!,
        moduleId: platformModuleId.supportOperations,
        tenantScope: platformScope.platform,
        tenantScopeId: platformScope.platform,
        action: supportOperationsAuditAction.breakGlassStarted,
        target: platformScope.platform,
        reason: "Investigate privileged access review backlog.",
        correlationId: trustedRequestContext.correlationId,
      },
    ],
  },
});

const buildVendorAggregate = (): VendorHealthAggregateProjection => ({
  entries: [
    {
      serviceName: platformAdapterServiceName.keycloak,
      status: "healthy",
      latencyMs: 42,
      lastCheckedAt: "2026-01-01T00:10:00.000Z",
    },
    {
      serviceName: platformAdapterServiceName.polar,
      status: "unavailable",
      latencyMs: 0,
      lastCheckedAt: "2026-01-01T00:10:00.000Z",
      message:
        "Polar access token rejected (invalid_token). Refresh POLAR_ACCESS_TOKEN or align it with POLAR_API_URL.",
    },
  ],
  partialFailures: [
    {
      serviceName: platformAdapterServiceName.polar,
      reason:
        "Polar access token rejected (invalid_token). Refresh POLAR_ACCESS_TOKEN or align it with POLAR_API_URL.",
    },
  ],
  generatedAt: "2026-01-01T00:10:00.000Z",
  correlationId: trustedRequestContext.correlationId,
});

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const resolveTrustedRequestContext = (
  _environment: unknown,
  sessionId: string,
) => Effect.succeed({ ...trustedRequestContext, sessionId });

describe("admin-app operations-home loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminOperationsHomeRouteDataFromRequest(
        buildRequest(undefined),
        {},
        {},
        resolveTrustedRequestContext,
        () => Effect.die(new Error("snapshot should not run")),
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns stale-session when the identity-session lookup misses", async () => {
    const result = await Effect.runPromise(
      loadAdminOperationsHomeRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        {},
        (_environment: unknown, sessionId: string) =>
          Effect.fail({
            _tag: "IdentitySessionRequestContextNotFoundError",
            sessionId,
          } as const),
        () => Effect.die(new Error("snapshot should not run")),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns stale-session when the service reports a missing actor identity", async () => {
    const result = await Effect.runPromise(
      loadAdminOperationsHomeRouteDataFromRequest(
        buildRequest("sess-missing-actor"),
        {},
        {},
        resolveTrustedRequestContext,
        () =>
          Effect.fail({
            _tag: "OperationsHomeMissingActorIdentity",
            args: { operation: "getSnapshot" as const },
          } as const),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when every snapshot source fails (OperationsHomeUnavailable)", async () => {
    const result = await Effect.runPromise(
      loadAdminOperationsHomeRouteDataFromRequest(
        buildRequest("sess-unavailable"),
        {},
        {},
        resolveTrustedRequestContext,
        () =>
          Effect.fail({
            _tag: "OperationsHomeUnavailable",
            args: { failures: [] },
          } as const),
        () =>
          Effect.fail(
            new Error("summary fallback unavailable") as unknown as never,
          ),
        () =>
          Effect.fail(
            new Error(
              "vendor aggregate fallback unavailable",
            ) as unknown as never,
          ),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toContain("Operations Home");
  });

  it("falls back to the admin control-plane summary when the snapshot service is unavailable", async () => {
    const result = await Effect.runPromise(
      loadAdminOperationsHomeRouteDataFromRequest(
        buildRequest("sess-fallback"),
        {},
        { windowMinutes: 60, recentAuditLimit: 5 },
        resolveTrustedRequestContext,
        () =>
          Effect.fail({
            _tag: "OperationsHomeUnavailable",
            args: { failures: [] },
          } as const),
        () => Effect.succeed(buildFallbackSummary()),
        () =>
          Effect.succeed({
            aggregate: buildVendorAggregate(),
            isFresh: true,
          }),
      ),
    );

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.snapshot.windowMinutes).toBe(60);
    expect(result.snapshot.kpis).toHaveLength(5);
    expect(result.snapshot.activeAlerts[0]?.title).toContain("Break-glass");
    expect(result.snapshot.pendingApprovals[0]?.kind).toBe(
      "Runtime change review",
    );
    expect(result.snapshot.vendorPosture[0]?.vendor).toBe(
      platformAdapterServiceName.polar,
    );
    expect(result.partialFailures).toEqual([
      {
        section: "vendorPosture",
        reason: `${platformAdapterServiceName.polar}: Polar access token rejected (invalid_token). Refresh POLAR_ACCESS_TOKEN or align it with POLAR_API_URL.`,
      },
    ]);
  });

  it("returns error when the boundary decode fails (ParseError)", async () => {
    const decode = Schema.decodeUnknown(Schema.Struct({ x: Schema.Number }));
    const result = await Effect.runPromise(
      loadAdminOperationsHomeRouteDataFromRequest(
        buildRequest("sess-parse"),
        {},
        {},
        resolveTrustedRequestContext,
        () =>
          decode({ x: "not-a-number" }) as unknown as ReturnType<
            typeof Effect.fail<ParseResult.ParseError>
          >,
      ),
    );
    expect(result.kind).toBe("error");
  });

  it("returns ready with the snapshot and surfaces partialFailures", async () => {
    const snapshot = buildSnapshot({
      partialFailures: [
        { section: "vendorPosture", reason: "vendor source stub down" },
      ],
    });
    const result = await Effect.runPromise(
      loadAdminOperationsHomeRouteDataFromRequest(
        buildRequest("sess-ready"),
        {},
        { windowMinutes: 60 },
        resolveTrustedRequestContext,
        () => Effect.succeed(snapshot),
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.snapshot.windowMinutes).toBe(60);
    expect(result.partialFailures).toEqual(snapshot.partialFailures);
  });
});
