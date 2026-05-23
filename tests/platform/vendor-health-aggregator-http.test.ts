/**
 * Vendor-health aggregator HTTP transport tests (admin-app
 * implementation plan §9 item 9 follow-up). Exercises the
 * `createVendorHealthAggregatorHttpHandlerWithDependencies` seam
 * with an injected request-context resolver + service double so
 * we cover routing, error-tag → status mapping, 405 method-not-
 * allowed, 404 unknown sub-path, and the backend-api registry
 * pin.
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformAdapterServiceName,
  platformScope,
  type RequestContext,
  type VendorHealthAggregateProjection,
} from "@comvestec/contracts";
import {
  createVendorHealthAggregatorHttpHandlerWithDependencies,
  VendorHealthAggregatorAllSourcesFailedError,
  VendorHealthAggregatorMissingActorIdentity,
  VendorHealthAggregatorUnauthorized,
  vendorHealthAggregatorApiBasePath,
  vendorHealthAggregatorApiPath,
  type VendorHealthAggregatorServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_vh_http_operator",
  sessionId: "sess_vh_http",
  correlationId: "corr_vh_http",
  reason: "vendor-health aggregator http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const fakeProjection: VendorHealthAggregateProjection = {
  entries: [
    {
      serviceName: platformAdapterServiceName.postgres,
      status: "healthy",
      latencyMs: 9,
      lastCheckedAt: "2026-02-01T00:00:00.000Z",
    },
  ],
  partialFailures: [],
  generatedAt: "2026-02-01T00:00:00.000Z",
  correlationId: "corr_vh_http",
};

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(
      `unexpected vendor-health-aggregator HTTP service call: ${method}`,
    ),
  );

const createServiceDouble = (
  overrides: Partial<VendorHealthAggregatorServiceImpl> = {},
): VendorHealthAggregatorServiceImpl => ({
  getAggregate:
    overrides.getAggregate ?? (() => unexpectedServiceCall("getAggregate")),
});

const createTestHandler = (
  service: Partial<VendorHealthAggregatorServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createVendorHealthAggregatorHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("vendor-health-aggregator HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(vendorHealthAggregatorApiBasePath).toBe(
      "/api/vendor-health-aggregator",
    );
    expect(vendorHealthAggregatorApiPath).toEqual({
      snapshot: "/api/vendor-health-aggregator/snapshot",
    });
  });

  it("is registered against the canonical backend API router via vendorHealthAggregatorApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("vendorHealthAggregatorApiBasePath")).toBe(
      true,
    );
    expect(backendApiSource.includes("vendorHealthAggregatorHandler")).toBe(
      true,
    );
    expect(
      backendApiSource.includes("handleVendorHealthAggregatorHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Snapshot (GET)
// ---------------------------------------------------------------------------

describe("vendor-health-aggregator HTTP — snapshot", () => {
  it("returns the aggregate view on GET happy path (200)", async () => {
    const handler = createTestHandler({
      getAggregate: () =>
        Effect.succeed({ aggregate: fakeProjection, isFresh: true }),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(vendorHealthAggregatorApiPath.snapshot), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      aggregate: { aggregate: fakeProjection, isFresh: true },
    });
  });

  it("maps VendorHealthAggregatorUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getAggregate: () =>
        Effect.fail(
          new VendorHealthAggregatorUnauthorized({
            operation: "getAggregate",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(vendorHealthAggregatorApiPath.snapshot), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps VendorHealthAggregatorMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      getAggregate: () =>
        Effect.fail(
          new VendorHealthAggregatorMissingActorIdentity({
            operation: "getAggregate",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(vendorHealthAggregatorApiPath.snapshot), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps the missing-session-header tag to 401 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({
        _tag: "SubscriberJourneySessionIdMissingError",
      } as const),
    );
    const response = await Effect.runPromise(
      handler(
        new Request(url(vendorHealthAggregatorApiPath.snapshot), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps IdentitySessionRequestContextNotFoundError to 404 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({
        _tag: "IdentitySessionRequestContextNotFoundError",
      } as const),
    );
    const response = await Effect.runPromise(
      handler(
        new Request(url(vendorHealthAggregatorApiPath.snapshot), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("maps ParseError to 400 via the request-context decoder", async () => {
    const handler = createTestHandler({}, () =>
      Effect.succeed({
        // Intentionally malformed → fails the RequestContextSchema decode
        // in the handler post-resolution step.
        actorType: "not-a-known-actor-type",
      } as unknown as RequestContext),
    );
    const response = await Effect.runPromise(
      handler(
        new Request(url(vendorHealthAggregatorApiPath.snapshot), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps VendorHealthAggregatorAllSourcesFailedError to 503", async () => {
    const handler = createTestHandler({
      getAggregate: () =>
        Effect.fail(
          new VendorHealthAggregatorAllSourcesFailedError({
            failures: [
              {
                serviceName: platformAdapterServiceName.postgres,
                reason: "db down",
              },
            ],
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(vendorHealthAggregatorApiPath.snapshot), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(503);
  });

  it("returns 500 for unknown / untagged service errors", async () => {
    const handler = createTestHandler({
      getAggregate: () => Effect.fail(new Error("boom") as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(vendorHealthAggregatorApiPath.snapshot), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("vendor-health-aggregator HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /snapshot with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(vendorHealthAggregatorApiPath.snapshot), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("returns 404 on unknown sub-path", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/vendor-health-aggregator/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
