/**
 * Operations Home aggregate v2 HTTP transport tests
 * (admin-app implementation plan §9 item 3). Exercises the
 * `createOperationsHomeHttpHandlerWithDependencies` seam to
 * cover the canonical path-table registry, per-route happy +
 * sad paths, and the error-tag → status mapping.
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  type OperationsHomeSnapshot,
  type RequestContext,
} from "@comvestec/contracts";
import {
  OperationsHomeMissingActorIdentity,
  OperationsHomeUnavailable,
  createOperationsHomeHttpHandlerWithDependencies,
  operationsHomeApiBasePath,
  operationsHomeApiPath,
  type OperationsHomeServiceImpl,
} from "@comvestec/platform";

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "subject-alpha",
  sessionId: "sess-ops-home-http",
  correlationId: "corr-ops-home-http",
  reason: "operations-home HTTP unit test",
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

const createServiceDouble = (
  overrides: Partial<OperationsHomeServiceImpl> = {},
): OperationsHomeServiceImpl => ({
  getSnapshot:
    overrides.getSnapshot ??
    (() => Effect.die(new Error("unexpected operations-home service call"))),
});

const createTestHandler = (
  service: Partial<OperationsHomeServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createOperationsHomeHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

// ---------------------------------------------------------------------------
// Path table + backend registration
// ---------------------------------------------------------------------------

describe("operations-home HTTP — path table + backend registration", () => {
  it("pins the canonical base path and per-route literals", () => {
    expect(operationsHomeApiBasePath).toBe("/api/operations-home");
    expect(operationsHomeApiPath).toEqual({
      snapshot: "/api/operations-home/snapshot",
    });
  });

  it("is registered against the backend API router via operationsHomeApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("operationsHomeApiBasePath")).toBe(true);
    expect(backendApiSource.includes("operationsHomeHandler")).toBe(true);
    expect(backendApiSource.includes("handleOperationsHomeHttpRequest")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// snapshot (GET /snapshot)
// ---------------------------------------------------------------------------

describe("operations-home HTTP — snapshot", () => {
  it("returns 200 with the snapshot envelope on happy path", async () => {
    const snapshot = buildSnapshot();
    const handler = createTestHandler({
      getSnapshot: () => Effect.succeed(snapshot),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(operationsHomeApiPath.snapshot), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ snapshot });
  });

  it("forwards windowMinutes and recentAuditLimit query params to the service", async () => {
    let observedWindow: number | undefined;
    let observedLimit: number | undefined;
    const handler = createTestHandler({
      getSnapshot: (input) => {
        observedWindow = input.windowMinutes;
        observedLimit = input.recentAuditLimit;
        return Effect.succeed(buildSnapshot({ windowMinutes: 30 }));
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(operationsHomeApiPath.snapshot)}?windowMinutes=30&recentAuditLimit=5`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    expect(observedWindow).toBe(30);
    expect(observedLimit).toBe(5);
  });

  it("uses the actorId from the trusted request context for the audit emission", async () => {
    let observedActorId: string | undefined;
    const handler = createTestHandler({
      getSnapshot: (input) => {
        observedActorId = input.requestContext.actorId;
        return Effect.succeed(buildSnapshot());
      },
    });
    await Effect.runPromise(
      handler(
        new Request(url(operationsHomeApiPath.snapshot), { method: "GET" }),
      ),
    );
    expect(observedActorId).toBe(trustedRequestContext.actorId);
  });

  it("returns 400 when windowMinutes is below the minimum", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(`${url(operationsHomeApiPath.snapshot)}?windowMinutes=0`, {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when windowMinutes is not a number", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(operationsHomeApiPath.snapshot)}?windowMinutes=soon`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 when the service reports OperationsHomeMissingActorIdentity", async () => {
    const handler = createTestHandler({
      getSnapshot: () =>
        Effect.fail(
          new OperationsHomeMissingActorIdentity({ operation: "getSnapshot" }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(operationsHomeApiPath.snapshot), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("returns 503 when the service reports OperationsHomeUnavailable", async () => {
    const handler = createTestHandler({
      getSnapshot: () =>
        Effect.fail(
          new OperationsHomeUnavailable({
            failures: [],
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(operationsHomeApiPath.snapshot), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(503);
  });

  it("returns 405 on a non-GET method", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(operationsHomeApiPath.snapshot), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("returns 404 on an unknown path under the base", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(`${url(operationsHomeApiBasePath)}/unknown`, {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
