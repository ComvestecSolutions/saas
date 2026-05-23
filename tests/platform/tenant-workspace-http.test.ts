/**
 * Tenant workspace aggregate v2 HTTP transport tests
 * (admin-app implementation plan §9 item 4). Exercises the
 * `createTenantWorkspaceHttpHandlerWithDependencies` seam to
 * cover the canonical path-table registry, the boundary decode
 * of `tenantScope`/`tenantScopeId`, per-route happy + sad
 * paths, and the error-tag → status mapping (including the new
 * 403 for `TenantWorkspaceCrossTenantAccessDenied`).
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  type RequestContext,
  type TenantContext,
  type TenantWorkspaceSnapshot,
} from "@comvestec/contracts";
import {
  createTenantWorkspaceHttpHandlerWithDependencies,
  TenantWorkspaceCrossTenantAccessDenied,
  TenantWorkspaceMissingActorIdentity,
  TenantWorkspaceUnavailable,
  tenantWorkspaceApiBasePath,
  tenantWorkspaceApiPath,
  type TenantWorkspaceServiceImpl,
} from "@comvestec/platform";

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "subject-alpha",
  sessionId: "sess-tenant-ws-http",
  correlationId: "corr-tenant-ws-http",
  reason: "tenant-workspace HTTP unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant: TenantContext = {
  scope: platformScope.organization,
  scopeId: "org-alpha",
};

const buildSnapshot = (
  overrides: Partial<TenantWorkspaceSnapshot> = {},
): TenantWorkspaceSnapshot => ({
  generatedAt: overrides.generatedAt ?? "2026-01-01T00:00:00.000Z",
  correlationId: overrides.correlationId ?? trustedRequestContext.correlationId,
  tenant: overrides.tenant ?? targetTenant,
  windowMinutes: overrides.windowMinutes ?? 60,
  tenantOverview: overrides.tenantOverview ?? null,
  members: overrides.members ?? [],
  recentActivity: overrides.recentActivity ?? [],
  openIncidents: overrides.openIncidents ?? [],
  usageSpotlights: overrides.usageSpotlights ?? [],
  pendingTenantApprovals: overrides.pendingTenantApprovals ?? [],
  partialFailures: overrides.partialFailures ?? [],
});

const createServiceDouble = (
  overrides: Partial<TenantWorkspaceServiceImpl> = {},
): TenantWorkspaceServiceImpl => ({
  getSnapshot:
    overrides.getSnapshot ??
    (() => Effect.die(new Error("unexpected tenant-workspace service call"))),
});

const createTestHandler = (
  service: Partial<TenantWorkspaceServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createTenantWorkspaceHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

const snapshotQuery = (
  overrides?: Partial<{
    tenantScope: string;
    tenantScopeId: string;
    extra: string;
  }>,
): string => {
  const tenantScope = overrides?.tenantScope ?? targetTenant.scope;
  const tenantScopeId = overrides?.tenantScopeId ?? targetTenant.scopeId;
  const base = `tenantScope=${encodeURIComponent(tenantScope)}&tenantScopeId=${encodeURIComponent(tenantScopeId)}`;
  return overrides?.extra ? `${base}&${overrides.extra}` : base;
};

// ---------------------------------------------------------------------------
// Path table + backend registration
// ---------------------------------------------------------------------------

describe("tenant-workspace HTTP — path table + backend registration", () => {
  it("pins the canonical base path and per-route literals", () => {
    expect(tenantWorkspaceApiBasePath).toBe("/api/tenant-workspace");
    expect(tenantWorkspaceApiPath).toEqual({
      snapshot: "/api/tenant-workspace/snapshot",
    });
  });

  it("is registered against the backend API router via tenantWorkspaceApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("tenantWorkspaceApiBasePath")).toBe(true);
    expect(backendApiSource.includes("tenantWorkspaceHandler")).toBe(true);
    expect(backendApiSource.includes("handleTenantWorkspaceHttpRequest")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// snapshot (GET /snapshot)
// ---------------------------------------------------------------------------

describe("tenant-workspace HTTP — snapshot", () => {
  it("returns 200 with the snapshot envelope on happy path", async () => {
    const snapshot = buildSnapshot();
    const handler = createTestHandler({
      getSnapshot: () => Effect.succeed(snapshot),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(tenantWorkspaceApiPath.snapshot)}?${snapshotQuery()}`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ snapshot });
  });

  it("forwards tenantScope/tenantScopeId + optional limits to the service", async () => {
    let observedTenant: TenantContext | undefined;
    let observedWindow: number | undefined;
    let observedMembersLimit: number | undefined;
    let observedActivityLimit: number | undefined;
    const handler = createTestHandler({
      getSnapshot: (input) => {
        observedTenant = input.tenant;
        observedWindow = input.windowMinutes;
        observedMembersLimit = input.membersLimit;
        observedActivityLimit = input.recentActivityLimit;
        return Effect.succeed(buildSnapshot({ windowMinutes: 30 }));
      },
    });
    const query = `${snapshotQuery({ extra: "windowMinutes=30&membersLimit=5&recentActivityLimit=7" })}`;
    const response = await Effect.runPromise(
      handler(
        new Request(`${url(tenantWorkspaceApiPath.snapshot)}?${query}`, {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(observedTenant).toEqual(targetTenant);
    expect(observedWindow).toBe(30);
    expect(observedMembersLimit).toBe(5);
    expect(observedActivityLimit).toBe(7);
  });

  it("returns 400 when tenantScope is missing", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(tenantWorkspaceApiPath.snapshot)}?tenantScopeId=org-alpha`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when tenantScopeId is missing", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(tenantWorkspaceApiPath.snapshot)}?tenantScope=organization`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when tenantScope is not a PlatformScope literal", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(tenantWorkspaceApiPath.snapshot)}?${snapshotQuery({ tenantScope: "not-a-scope" })}`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when windowMinutes is below the minimum", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(tenantWorkspaceApiPath.snapshot)}?${snapshotQuery({ extra: "windowMinutes=0" })}`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when windowMinutes is not a number", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(tenantWorkspaceApiPath.snapshot)}?${snapshotQuery({ extra: "windowMinutes=soon" })}`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 when the service reports TenantWorkspaceMissingActorIdentity", async () => {
    const handler = createTestHandler({
      getSnapshot: () =>
        Effect.fail(
          new TenantWorkspaceMissingActorIdentity({ operation: "getSnapshot" }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(tenantWorkspaceApiPath.snapshot)}?${snapshotQuery()}`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when the service reports TenantWorkspaceCrossTenantAccessDenied", async () => {
    const handler = createTestHandler({
      getSnapshot: () =>
        Effect.fail(
          new TenantWorkspaceCrossTenantAccessDenied({
            requestContextTenant: trustedRequestContext.tenant,
            inputTenant: targetTenant,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(tenantWorkspaceApiPath.snapshot)}?${snapshotQuery()}`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(403);
  });

  it("returns 503 when the service reports TenantWorkspaceUnavailable", async () => {
    const handler = createTestHandler({
      getSnapshot: () =>
        Effect.fail(new TenantWorkspaceUnavailable({ failures: [] })),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(tenantWorkspaceApiPath.snapshot)}?${snapshotQuery()}`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(503);
  });

  it("returns 405 on a non-GET method", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(tenantWorkspaceApiPath.snapshot)}?${snapshotQuery()}`,
          { method: "POST" },
        ),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("returns 404 on an unknown path under the base", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(`${url(tenantWorkspaceApiBasePath)}/unknown`, {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
