/**
 * OpenMeter usage query HTTP transport tests (admin-app implementation
 * plan §9 item 8 follow-up). Exercises the
 * `createOpenMeterUsageQueryHttpHandlerWithDependencies` seam with an
 * injected request-context resolver + service double so we cover
 * routing, JSON / query decoding, error-tag → status mapping, 405
 * method-not-allowed, 404 unknown sub-path, and the backend-api
 * registry pin.
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  reasonCatalogId,
  type OpenMeterUsageQuery,
  type RequestContext,
} from "@comvestec/contracts";
import {
  createOpenMeterUsageQueryHttpHandlerWithDependencies,
  OpenMeterApiClientError,
  OpenMeterUsageQueryMissingActorIdentity,
  OpenMeterUsageQueryReasonNotInCatalog,
  OpenMeterUsageQueryUnauthorized,
  OpenMeterUsageQueryWindowTooLarge,
  openMeterUsageQueryApiBasePath,
  openMeterUsageQueryApiPath,
  type OpenMeterUsageQueryServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_omu_http_operator",
  sessionId: "sess_omu_http",
  correlationId: "corr_omu_http",
  reason: "open meter usage query http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
} as const;

const sampleWindow = {
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-02T00:00:00.000Z",
} as const;

const fakeUsageQuery = (
  overrides: Partial<OpenMeterUsageQuery> = {},
): OpenMeterUsageQuery => ({
  id: overrides.id ?? "omu_fake",
  tenant: overrides.tenant ?? targetTenant,
  subject: overrides.subject ?? "subj-acme",
  meterSlug: overrides.meterSlug ?? "api-requests",
  window: overrides.window ?? sampleWindow,
  granularity: overrides.granularity ?? "HOUR",
  aggregated: overrides.aggregated ?? [],
  computedAt: overrides.computedAt ?? "2026-01-02T01:00:00.000Z",
  correlationId: overrides.correlationId ?? "corr_omu_http",
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(`unexpected open-meter-usage-query HTTP service call: ${method}`),
  );

const createServiceDouble = (
  overrides: Partial<OpenMeterUsageQueryServiceImpl> = {},
): OpenMeterUsageQueryServiceImpl => ({
  getLatestUsageQuery:
    overrides.getLatestUsageQuery ??
    (() => unexpectedServiceCall("getLatestUsageQuery")),
  requestBackfill:
    overrides.requestBackfill ??
    (() => unexpectedServiceCall("requestBackfill")),
});

const createTestHandler = (
  service: Partial<OpenMeterUsageQueryServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createOpenMeterUsageQueryHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

const queryString = () =>
  `?tenantScope=${encodeURIComponent(targetTenant.scope)}` +
  `&tenantScopeId=${encodeURIComponent(targetTenant.scopeId)}` +
  `&subject=${encodeURIComponent("subj-acme")}` +
  `&meterSlug=${encodeURIComponent("api-requests")}` +
  `&from=${encodeURIComponent(sampleWindow.from)}` +
  `&to=${encodeURIComponent(sampleWindow.to)}` +
  `&granularity=HOUR`;

const backfillBody = () =>
  JSON.stringify({
    tenant: targetTenant,
    subject: "subj-acme",
    meterSlug: "api-requests",
    window: sampleWindow,
    granularity: "HOUR",
    reasonCatalogId: reasonCatalogId.openMeterUsageQueryBackfill,
    reasonNarrative: "operator backfill",
    reasonAttachmentText: "runbook://usage/backfill",
  });

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("open-meter-usage-query HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(openMeterUsageQueryApiBasePath).toBe("/api/open-meter-usage-query");
    expect(openMeterUsageQueryApiPath).toEqual({
      query: "/api/open-meter-usage-query/query",
      backfill: "/api/open-meter-usage-query/backfill",
    });
  });

  it("is registered against the canonical backend API router via openMeterUsageQueryApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("openMeterUsageQueryApiBasePath")).toBe(
      true,
    );
    expect(backendApiSource.includes("openMeterUsageQueryHandler")).toBe(true);
    expect(
      backendApiSource.includes("handleOpenMeterUsageQueryHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Query (GET)
// ---------------------------------------------------------------------------

describe("open-meter-usage-query HTTP — query", () => {
  it("returns the latest usage query on GET happy path (200)", async () => {
    const view = fakeUsageQuery({ id: "omu_one" });
    let receivedMeterSlug: string | undefined;
    const handler = createTestHandler({
      getLatestUsageQuery: (input) => {
        receivedMeterSlug = input.query.meterSlug;
        return Effect.succeed(Option.some({ result: view, isFresh: true }));
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${openMeterUsageQueryApiPath.query}${queryString()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: { result: view, isFresh: true },
    });
    expect(receivedMeterSlug).toBe("api-requests");
  });

  it("returns { result: null } when no snapshot is found", async () => {
    const handler = createTestHandler({
      getLatestUsageQuery: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${openMeterUsageQueryApiPath.query}${queryString()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: null });
  });

  it("returns 400 when the query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterUsageQueryApiPath.query), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps OpenMeterUsageQueryUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getLatestUsageQuery: () =>
        Effect.fail(
          new OpenMeterUsageQueryUnauthorized({
            operation: "getLatestUsageQuery",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${openMeterUsageQueryApiPath.query}${queryString()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps OpenMeterUsageQueryMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      getLatestUsageQuery: () =>
        Effect.fail(
          new OpenMeterUsageQueryMissingActorIdentity({
            operation: "getLatestUsageQuery",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${openMeterUsageQueryApiPath.query}${queryString()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps OpenMeterUsageQueryWindowTooLarge to 400", async () => {
    const handler = createTestHandler({
      getLatestUsageQuery: () =>
        Effect.fail(
          new OpenMeterUsageQueryWindowTooLarge({
            operation: "getLatestUsageQuery",
            windowDays: 60,
            maxWindowDays: 31,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${openMeterUsageQueryApiPath.query}${queryString()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps the missing-session-header tag to 401 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({
        _tag: "SubscriberJourneySessionIdMissingError",
      } as const),
    );
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${openMeterUsageQueryApiPath.query}${queryString()}`),
          { method: "GET" },
        ),
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
        new Request(
          url(`${openMeterUsageQueryApiPath.query}${queryString()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Backfill (POST)
// ---------------------------------------------------------------------------

describe("open-meter-usage-query HTTP — backfill", () => {
  it("returns 202 with the recomputed result on POST happy path", async () => {
    const result = fakeUsageQuery({ id: "omu_backfilled" });
    let receivedReason: string | undefined;
    const handler = createTestHandler({
      requestBackfill: (input) => {
        receivedReason = input.backfill.reasonCatalogId;
        return Effect.succeed({ accepted: true as const, result });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterUsageQueryApiPath.backfill), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: backfillBody(),
        }),
      ),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      result,
    });
    expect(receivedReason).toBe(reasonCatalogId.openMeterUsageQueryBackfill);
  });

  it("returns 400 for malformed JSON", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterUsageQueryApiPath.backfill), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not json",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps OpenMeterUsageQueryReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      requestBackfill: () =>
        Effect.fail(
          new OpenMeterUsageQueryReasonNotInCatalog({
            operation: "requestBackfill",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterUsageQueryApiPath.backfill), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: backfillBody(),
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps OpenMeterApiClientError to 502", async () => {
    const handler = createTestHandler({
      requestBackfill: () =>
        Effect.fail(
          new OpenMeterApiClientError({
            operation: "fetchUsageBuckets",
            tenant: targetTenant,
            meterSlug: "api-requests",
            cause: new Error("upstream"),
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterUsageQueryApiPath.backfill), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: backfillBody(),
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps OpenmeterAdapterRequestError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      requestBackfill: () =>
        Effect.fail({
          _tag: "OpenmeterAdapterRequestError",
        } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterUsageQueryApiPath.backfill), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: backfillBody(),
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps OpenmeterAdapterTransportError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      requestBackfill: () =>
        Effect.fail({
          _tag: "OpenmeterAdapterTransportError",
        } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterUsageQueryApiPath.backfill), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: backfillBody(),
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("returns 500 for unknown / untagged service errors", async () => {
    const handler = createTestHandler({
      requestBackfill: () => Effect.fail(new Error("boom") as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterUsageQueryApiPath.backfill), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: backfillBody(),
        }),
      ),
    );
    expect(response.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("open-meter-usage-query HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /query with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterUsageQueryApiPath.query), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects GET on /backfill with 405 + Allow: POST", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterUsageQueryApiPath.backfill), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("returns 404 on unknown sub-path", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/open-meter-usage-query/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
