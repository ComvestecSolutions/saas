/**
 * Admin-app Tenant workspace v2 loader tests (admin-app
 * implementation plan §9 item 4 + Phase 2 Desk Core cutover).
 * Covers the discriminated-union mapping:
 *
 *   - missing tenant target → `error`
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `TenantWorkspaceMissingActorIdentity` → `stale-session`
 *   - `TenantWorkspaceCrossTenantAccessDenied` → `denied`
 *   - `TenantWorkspaceUnavailable` → `error`
 *   - boundary `ParseError` → `error`
 *   - happy path → `ready`, with the `drillFilters` projection
 *     stripped from `usageSpotlights` so the payload remains
 *     serializable across the server-function boundary
 */
import { describe, expect, it } from "vitest";
import { Effect, ParseResult, Schema } from "effect";
import {
  actorType,
  platformScope,
  type OperationsHomeKpi,
  type RequestContext,
  type TenantWorkspaceSnapshot,
} from "@comvestec/contracts";
import { loadAdminTenantWorkspaceV2RouteDataFromRequest } from "../../apps/admin-app/src/lib/tenant-workspace-v2-route-data";

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator",
  sessionId: "sess-admin-tenant-workspace-v2-loader",
  correlationId: "corr-admin-tenant-workspace-v2-loader",
  reason: "tenant-workspace-v2 loader test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const tenantTarget = {
  scope: platformScope.organization,
  scopeId: "org_acme",
} as const;

const kpiWithDrillFilters: OperationsHomeKpi = {
  id: "usage-1",
  label: "Daily active users",
  value: 1234,
  unit: "users",
  trend: { direction: "up", delta: 12.5, windowMinutes: 1440 },
  tone: "nominal",
  drillResourceKind: "tenants",
  drillFilters: { tenantId: "org_acme", env: "prod" },
};

const buildSnapshot = (
  overrides: Partial<TenantWorkspaceSnapshot> = {},
): TenantWorkspaceSnapshot => ({
  generatedAt: overrides.generatedAt ?? "2026-01-01T00:00:00.000Z",
  correlationId: overrides.correlationId ?? trustedRequestContext.correlationId,
  tenant: overrides.tenant ?? {
    scope: tenantTarget.scope,
    scopeId: tenantTarget.scopeId,
    organizationId: tenantTarget.scopeId,
  },
  windowMinutes: overrides.windowMinutes ?? 1440,
  tenantOverview: overrides.tenantOverview ?? null,
  members: overrides.members ?? [],
  recentActivity: overrides.recentActivity ?? [],
  openIncidents: overrides.openIncidents ?? [],
  usageSpotlights: overrides.usageSpotlights ?? [kpiWithDrillFilters],
  pendingTenantApprovals: overrides.pendingTenantApprovals ?? [],
  partialFailures: overrides.partialFailures ?? [],
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

const validInput = {
  tenantId: tenantTarget.scopeId,
  scope: tenantTarget.scope,
} as const;

describe("admin-app tenant-workspace-v2 loader", () => {
  it("returns error when the tenant target cannot be built", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantWorkspaceV2RouteDataFromRequest(
        buildRequest("sess-no-target"),
        {},
        { tenantId: "" },
        resolveTrustedRequestContext,
        () => Effect.die(new Error("snapshot should not run")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Tenant target required");
  });

  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantWorkspaceV2RouteDataFromRequest(
        buildRequest(undefined),
        {},
        validInput,
        resolveTrustedRequestContext,
        () => Effect.die(new Error("snapshot should not run")),
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns stale-session when the identity-session lookup misses", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantWorkspaceV2RouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        validInput,
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
      loadAdminTenantWorkspaceV2RouteDataFromRequest(
        buildRequest("sess-missing-actor"),
        {},
        validInput,
        resolveTrustedRequestContext,
        () =>
          Effect.fail({
            _tag: "TenantWorkspaceMissingActorIdentity",
            args: { operation: "getSnapshot" as const },
          } as const),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the service reports a cross-tenant access denial", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantWorkspaceV2RouteDataFromRequest(
        buildRequest("sess-cross-tenant"),
        {},
        validInput,
        resolveTrustedRequestContext,
        () =>
          Effect.fail({
            _tag: "TenantWorkspaceCrossTenantAccessDenied",
            args: {
              requestContextTenant: trustedRequestContext.tenant,
              inputTenant: tenantTarget,
            },
          } as const),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns error when every snapshot source fails (TenantWorkspaceUnavailable)", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantWorkspaceV2RouteDataFromRequest(
        buildRequest("sess-unavailable"),
        {},
        validInput,
        resolveTrustedRequestContext,
        () =>
          Effect.fail({
            _tag: "TenantWorkspaceUnavailable",
            args: { failures: [] },
          } as const),
      ),
    );
    expect(result.kind).toBe("error");
  });

  it("returns error when the boundary decode fails (ParseError)", async () => {
    const decode = Schema.decodeUnknown(Schema.Struct({ x: Schema.Number }));
    const result = await Effect.runPromise(
      loadAdminTenantWorkspaceV2RouteDataFromRequest(
        buildRequest("sess-parse"),
        {},
        validInput,
        resolveTrustedRequestContext,
        () =>
          decode({ x: "not-a-number" }) as unknown as ReturnType<
            typeof Effect.fail<ParseResult.ParseError>
          >,
      ),
    );
    expect(result.kind).toBe("error");
  });

  it("returns ready with the snapshot, partialFailures, and projects drillFilters off usageSpotlights", async () => {
    const snapshot = buildSnapshot({
      partialFailures: [
        { section: "openIncidents", reason: "incident source stub down" },
      ],
    });
    const result = await Effect.runPromise(
      loadAdminTenantWorkspaceV2RouteDataFromRequest(
        buildRequest("sess-ready"),
        {},
        validInput,
        resolveTrustedRequestContext,
        () => Effect.succeed(snapshot),
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.partialFailures).toEqual(snapshot.partialFailures);
    expect(result.snapshot.usageSpotlights).toHaveLength(1);
    const projected = result.snapshot.usageSpotlights[0];
    expect(projected).toBeDefined();
    expect(projected as Record<string, unknown>).not.toHaveProperty(
      "drillFilters",
    );
    expect(projected?.id).toBe(kpiWithDrillFilters.id);
  });
});
