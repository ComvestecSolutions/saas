/**
 * Polar revenue projection HTTP transport tests (admin-app
 * implementation plan §9 item 7 follow-up). Exercises the
 * `createPolarRevenueProjectionHttpHandlerWithDependencies` seam with
 * an injected request-context resolver + service double so we cover
 * routing, JSON / query decoding, error-tag → status mapping,
 * 405 method-not-allowed, 404 unknown sub-path, and the backend-api
 * registry pin.
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  reasonCatalogId,
  type PolarRevenueProjection,
  type RequestContext,
} from "@comvestec/contracts";
import {
  createPolarRevenueProjectionHttpHandlerWithDependencies,
  PolarApiClientError,
  PolarRevenueProjectionMissingActorIdentity,
  PolarRevenueProjectionReasonNotInCatalog,
  PolarRevenueProjectionUnauthorized,
  polarRevenueProjectionApiBasePath,
  polarRevenueProjectionApiPath,
  type PolarRevenueProjectionServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_prp_http_operator",
  sessionId: "sess_prp_http",
  correlationId: "corr_prp_http",
  reason: "polar revenue projection http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
} as const;

const zeroMoney = { currency: "USD", amountMinorUnits: 0 } as const;

const fakeSnapshot = (
  overrides: Partial<PolarRevenueProjection> = {},
): PolarRevenueProjection => ({
  id: overrides.id ?? "prp_fake",
  tenant: overrides.tenant ?? targetTenant,
  billingPeriodStart:
    overrides.billingPeriodStart ?? "2026-01-01T00:00:00.000Z",
  billingPeriodEnd: overrides.billingPeriodEnd ?? "2026-01-31T23:59:59.000Z",
  subscriptionMrr: overrides.subscriptionMrr ?? zeroMoney,
  churnRate: overrides.churnRate ?? 0,
  expansion: overrides.expansion ?? zeroMoney,
  contraction: overrides.contraction ?? zeroMoney,
  projectedNextPeriodRevenue: overrides.projectedNextPeriodRevenue ?? zeroMoney,
  activeSubscriptionCount: overrides.activeSubscriptionCount ?? 0,
  sourcePolarAccountId: overrides.sourcePolarAccountId ?? "polar_acct_test",
  computedAt: overrides.computedAt ?? "2026-01-15T12:00:00.000Z",
  correlationId: overrides.correlationId ?? "corr_prp_http",
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(
      `unexpected polar-revenue-projection HTTP service call: ${method}`,
    ),
  );

const createServiceDouble = (
  overrides: Partial<PolarRevenueProjectionServiceImpl> = {},
): PolarRevenueProjectionServiceImpl => ({
  getLatestSnapshot:
    overrides.getLatestSnapshot ??
    (() => unexpectedServiceCall("getLatestSnapshot")),
  requestBackfill:
    overrides.requestBackfill ??
    (() => unexpectedServiceCall("requestBackfill")),
});

const createTestHandler = (
  service: Partial<PolarRevenueProjectionServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createPolarRevenueProjectionHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

const snapshotQuery = () =>
  `?tenantScope=${encodeURIComponent(targetTenant.scope)}&tenantScopeId=${encodeURIComponent(
    targetTenant.scopeId,
  )}`;

const backfillBody = () =>
  JSON.stringify({
    tenant: targetTenant,
    reasonCatalogId: reasonCatalogId.polarRevenueProjectionBackfill,
    reasonNarrative: "operator backfill",
    reasonAttachmentText: "runbook://billing/backfill",
  });

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("polar-revenue-projection HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(polarRevenueProjectionApiBasePath).toBe(
      "/api/polar-revenue-projection",
    );
    expect(polarRevenueProjectionApiPath).toEqual({
      snapshot: "/api/polar-revenue-projection/snapshot",
      backfill: "/api/polar-revenue-projection/backfill",
    });
  });

  it("is registered against the canonical backend API router via polarRevenueProjectionApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("polarRevenueProjectionApiBasePath")).toBe(
      true,
    );
    expect(backendApiSource.includes("polarRevenueProjectionHandler")).toBe(
      true,
    );
    expect(
      backendApiSource.includes("handlePolarRevenueProjectionHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Snapshot (GET)
// ---------------------------------------------------------------------------

describe("polar-revenue-projection HTTP — snapshot", () => {
  it("returns the latest snapshot on GET happy path (200)", async () => {
    const snapshot = fakeSnapshot({ id: "prp_one" });
    let receivedTenantScopeId: string | undefined;
    const handler = createTestHandler({
      getLatestSnapshot: (input) => {
        receivedTenantScopeId = input.tenant.scopeId;
        return Effect.succeed(Option.some({ snapshot, isFresh: true }));
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${polarRevenueProjectionApiPath.snapshot}${snapshotQuery()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      snapshot: { snapshot, isFresh: true },
    });
    expect(receivedTenantScopeId).toBe(targetTenant.scopeId);
  });

  it("returns { snapshot: null } when no snapshot is found", async () => {
    const handler = createTestHandler({
      getLatestSnapshot: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${polarRevenueProjectionApiPath.snapshot}${snapshotQuery()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ snapshot: null });
  });

  it("returns 400 when the query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarRevenueProjectionApiPath.snapshot), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps PolarRevenueProjectionUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getLatestSnapshot: () =>
        Effect.fail(
          new PolarRevenueProjectionUnauthorized({
            operation: "getLatestSnapshot",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${polarRevenueProjectionApiPath.snapshot}${snapshotQuery()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps PolarRevenueProjectionMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      getLatestSnapshot: () =>
        Effect.fail(
          new PolarRevenueProjectionMissingActorIdentity({
            operation: "getLatestSnapshot",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${polarRevenueProjectionApiPath.snapshot}${snapshotQuery()}`),
          { method: "GET" },
        ),
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
        new Request(
          url(`${polarRevenueProjectionApiPath.snapshot}${snapshotQuery()}`),
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
          url(`${polarRevenueProjectionApiPath.snapshot}${snapshotQuery()}`),
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

describe("polar-revenue-projection HTTP — backfill", () => {
  it("returns 202 with the persisted snapshot on POST happy path", async () => {
    const snapshot = fakeSnapshot({ id: "prp_backfilled" });
    let receivedReason: string | undefined;
    const handler = createTestHandler({
      requestBackfill: (input) => {
        receivedReason = input.backfill.reasonCatalogId;
        return Effect.succeed({ accepted: true as const, snapshot });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarRevenueProjectionApiPath.backfill), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: backfillBody(),
        }),
      ),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      snapshot,
    });
    expect(receivedReason).toBe(reasonCatalogId.polarRevenueProjectionBackfill);
  });

  it("returns 400 for malformed JSON", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarRevenueProjectionApiPath.backfill), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not json",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps PolarRevenueProjectionReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      requestBackfill: () =>
        Effect.fail(
          new PolarRevenueProjectionReasonNotInCatalog({
            operation: "requestBackfill",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarRevenueProjectionApiPath.backfill), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: backfillBody(),
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps PolarApiClientError to 502", async () => {
    const handler = createTestHandler({
      requestBackfill: () =>
        Effect.fail(
          new PolarApiClientError({
            operation: "fetchRevenueSnapshotSource",
            tenant: targetTenant,
            cause: new Error("upstream"),
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarRevenueProjectionApiPath.backfill), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: backfillBody(),
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps PolarAdapterRequestError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      requestBackfill: () =>
        Effect.fail({ _tag: "PolarAdapterRequestError" } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarRevenueProjectionApiPath.backfill), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: backfillBody(),
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps PolarCatalogMetadataError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      requestBackfill: () =>
        Effect.fail({ _tag: "PolarCatalogMetadataError" } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarRevenueProjectionApiPath.backfill), {
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
        new Request(url(polarRevenueProjectionApiPath.backfill), {
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

describe("polar-revenue-projection HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /snapshot with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarRevenueProjectionApiPath.snapshot), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects GET on /backfill with 405 + Allow: POST", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarRevenueProjectionApiPath.backfill), {
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
        new Request(url("/api/polar-revenue-projection/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
