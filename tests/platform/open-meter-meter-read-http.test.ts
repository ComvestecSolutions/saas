/**
 * OpenMeter meter read HTTP transport tests (admin-app implementation
 * plan §9 item 10 — batch A vendor #3). Mirrors the polar-customer-read
 * HTTP test: exercises the
 * `createOpenMeterMeterReadHttpHandlerWithDependencies` seam with an
 * injected request-context resolver + service double so we cover
 * routing, query decoding, error-tag → status mapping, 405
 * method-not-allowed, 404 unknown sub-path, and the backend-api
 * registry pin.
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  reasonCatalogId,
  type OpenMeterMeterSummary,
  type RequestContext,
} from "@comvestec/contracts";
import {
  OpenMeterMeterReadAdapterClientError,
  OpenMeterMeterReadMissingActorIdentity,
  OpenMeterMeterReadReasonNotInCatalog,
  OpenMeterMeterReadUnauthorized,
  createOpenMeterMeterReadHttpHandlerWithDependencies,
  openMeterMeterReadApiBasePath,
  openMeterMeterReadApiPath,
  type OpenMeterMeterReadServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_openmeter_http_operator",
  sessionId: "sess_openmeter_http",
  correlationId: "corr_openmeter_http",
  reason: "openmeter meter read http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
} as const;

const fakeMeter = (
  overrides: Partial<OpenMeterMeterSummary> = {},
): OpenMeterMeterSummary => ({
  meterSlug: overrides.meterSlug ?? "meter.api.requests",
  displayName: overrides.displayName ?? "API requests",
  aggregation: overrides.aggregation ?? "SUM",
  eventType: overrides.eventType ?? "api.request",
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  ...(overrides.valueProperty !== undefined
    ? { valueProperty: overrides.valueProperty }
    : {}),
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(`unexpected open-meter-meter-read HTTP service call: ${method}`),
  );

const createServiceDouble = (
  overrides: Partial<OpenMeterMeterReadServiceImpl> = {},
): OpenMeterMeterReadServiceImpl => ({
  getBySlug: overrides.getBySlug ?? (() => unexpectedServiceCall("getBySlug")),
  listAll: overrides.listAll ?? (() => unexpectedServiceCall("listAll")),
  listByEventType:
    overrides.listByEventType ??
    (() => unexpectedServiceCall("listByEventType")),
});

const createTestHandler = (
  service: Partial<OpenMeterMeterReadServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createOpenMeterMeterReadHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

const tenantQs = () =>
  `tenantScope=${encodeURIComponent(targetTenant.scope)}` +
  `&tenantScopeId=${encodeURIComponent(targetTenant.scopeId)}` +
  `&reasonCatalogId=${encodeURIComponent(reasonCatalogId.openMeterMeterRead)}`;

const bySlugQs = (meterSlug = "meter.api.requests") =>
  `?${tenantQs()}&meterSlug=${encodeURIComponent(meterSlug)}`;
const allQs = () => `?${tenantQs()}`;
const byEventTypeQs = (eventType = "api.request") =>
  `?${tenantQs()}&eventType=${encodeURIComponent(eventType)}`;

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("open-meter-meter-read HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(openMeterMeterReadApiBasePath).toBe("/api/open-meter-meter-read");
    expect(openMeterMeterReadApiPath).toEqual({
      bySlug: "/api/open-meter-meter-read/by-slug",
      all: "/api/open-meter-meter-read/all",
      byEventType: "/api/open-meter-meter-read/by-event-type",
    });
  });

  it("is registered against the canonical backend API router via openMeterMeterReadApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("openMeterMeterReadApiBasePath")).toBe(
      true,
    );
    expect(backendApiSource.includes("openMeterMeterReadHandler")).toBe(true);
    expect(
      backendApiSource.includes("handleOpenMeterMeterReadHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// by-slug (GET)
// ---------------------------------------------------------------------------

describe("open-meter-meter-read HTTP — by-slug", () => {
  it("returns the meter on GET happy path (200)", async () => {
    const meter = fakeMeter();
    let receivedSlug: string | undefined;
    const handler = createTestHandler({
      getBySlug: (input) => {
        receivedSlug = input.query.meterSlug;
        return Effect.succeed(Option.some({ summary: meter, isFresh: true }));
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openMeterMeterReadApiPath.bySlug}${bySlugQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      meter: { summary: meter, isFresh: true },
    });
    expect(receivedSlug).toBe("meter.api.requests");
  });

  it("returns { meter: null } when no meter is found (option-none)", async () => {
    const handler = createTestHandler({
      getBySlug: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openMeterMeterReadApiPath.bySlug}${bySlugQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ meter: null });
  });

  it("returns 400 when the query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterMeterReadApiPath.bySlug), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps OpenMeterMeterReadUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getBySlug: () =>
        Effect.fail(
          new OpenMeterMeterReadUnauthorized({
            operation: "getBySlug",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openMeterMeterReadApiPath.bySlug}${bySlugQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps OpenMeterMeterReadMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      getBySlug: () =>
        Effect.fail(
          new OpenMeterMeterReadMissingActorIdentity({
            operation: "getBySlug",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openMeterMeterReadApiPath.bySlug}${bySlugQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps OpenMeterMeterReadReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      getBySlug: () =>
        Effect.fail(
          new OpenMeterMeterReadReasonNotInCatalog({
            operation: "getBySlug",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openMeterMeterReadApiPath.bySlug}${bySlugQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps OpenMeterMeterReadAdapterClientError to 502", async () => {
    const handler = createTestHandler({
      getBySlug: () =>
        Effect.fail(
          new OpenMeterMeterReadAdapterClientError({
            operation: "getBySlug",
            tenant: targetTenant,
            cause: new Error("upstream"),
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openMeterMeterReadApiPath.bySlug}${bySlugQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps OpenmeterAdapterRequestError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      getBySlug: () =>
        Effect.fail({
          _tag: "OpenmeterAdapterRequestError",
        } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openMeterMeterReadApiPath.bySlug}${bySlugQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps OpenmeterAdapterTransportError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      getBySlug: () =>
        Effect.fail({
          _tag: "OpenmeterAdapterTransportError",
        } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openMeterMeterReadApiPath.bySlug}${bySlugQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("returns 500 for unknown / untagged service errors", async () => {
    const handler = createTestHandler({
      getBySlug: () => Effect.fail(new Error("boom") as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openMeterMeterReadApiPath.bySlug}${bySlugQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(500);
  });

  it("maps the missing-session-header tag to 401 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({
        _tag: "SubscriberJourneySessionIdMissingError",
      } as const),
    );
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openMeterMeterReadApiPath.bySlug}${bySlugQs()}`), {
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
        new Request(url(`${openMeterMeterReadApiPath.bySlug}${bySlugQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// all (GET)
// ---------------------------------------------------------------------------

describe("open-meter-meter-read HTTP — all", () => {
  it("returns the meters on GET happy path (200)", async () => {
    const summaries = [fakeMeter()];
    const handler = createTestHandler({
      listAll: () => Effect.succeed({ summaries, isFresh: true }),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openMeterMeterReadApiPath.all}${allQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summaries,
      isFresh: true,
    });
  });

  it("returns 400 when the all-query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterMeterReadApiPath.all), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// by-event-type (GET)
// ---------------------------------------------------------------------------

describe("open-meter-meter-read HTTP — by-event-type", () => {
  it("returns the matching meters on GET happy path (200)", async () => {
    const summaries = [fakeMeter()];
    let receivedEventType: string | undefined;
    const handler = createTestHandler({
      listByEventType: (input) => {
        receivedEventType = input.query.eventType;
        return Effect.succeed({ summaries, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${openMeterMeterReadApiPath.byEventType}${byEventTypeQs()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summaries,
      isFresh: true,
    });
    expect(receivedEventType).toBe("api.request");
  });

  it("returns 400 when the event-type query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterMeterReadApiPath.byEventType), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("open-meter-meter-read HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /by-slug with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterMeterReadApiPath.bySlug), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /all with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterMeterReadApiPath.all), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-event-type with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openMeterMeterReadApiPath.byEventType), {
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
        new Request(url("/api/open-meter-meter-read/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
