/**
 * Polar customer read HTTP transport tests (admin-app implementation
 * plan §9 item 10 — batch A vendor #2). Mirrors the keycloak-user-read
 * HTTP test: exercises the
 * `createPolarCustomerReadHttpHandlerWithDependencies` seam with an
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
  type PolarCustomerSummary,
  type RequestContext,
} from "@comvestec/contracts";
import {
  PolarCustomerReadAdapterClientError,
  PolarCustomerReadMissingActorIdentity,
  PolarCustomerReadReasonNotInCatalog,
  PolarCustomerReadUnauthorized,
  createPolarCustomerReadHttpHandlerWithDependencies,
  polarCustomerReadApiBasePath,
  polarCustomerReadApiPath,
  type PolarCustomerReadServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_polar_http_operator",
  sessionId: "sess_polar_http",
  correlationId: "corr_polar_http",
  reason: "polar customer read http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
} as const;

const fakeCustomer = (
  overrides: Partial<PolarCustomerSummary> = {},
): PolarCustomerSummary => ({
  customerId: overrides.customerId ?? "cust-001",
  externalId: overrides.externalId ?? "ext-acme",
  email: overrides.email ?? "billing@acme.test",
  name: overrides.name ?? "Acme Inc",
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  totalSpendCents: overrides.totalSpendCents ?? 0,
  subscriptionCount: overrides.subscriptionCount ?? 0,
  ...(overrides.billingAddress !== undefined
    ? { billingAddress: overrides.billingAddress }
    : {}),
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(`unexpected polar-customer-read HTTP service call: ${method}`),
  );

const createServiceDouble = (
  overrides: Partial<PolarCustomerReadServiceImpl> = {},
): PolarCustomerReadServiceImpl => ({
  getById: overrides.getById ?? (() => unexpectedServiceCall("getById")),
  listByEmail:
    overrides.listByEmail ?? (() => unexpectedServiceCall("listByEmail")),
  listByExternalId:
    overrides.listByExternalId ??
    (() => unexpectedServiceCall("listByExternalId")),
});

const createTestHandler = (
  service: Partial<PolarCustomerReadServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createPolarCustomerReadHttpHandlerWithDependencies({
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
  `&reasonCatalogId=${encodeURIComponent(reasonCatalogId.polarCustomerRead)}`;

const byIdQs = (customerId = "cust-001") =>
  `?${tenantQs()}&customerId=${encodeURIComponent(customerId)}`;
const byEmailQs = (email = "billing@acme.test") =>
  `?${tenantQs()}&email=${encodeURIComponent(email)}`;
const byExternalIdQs = (externalId = "ext-acme") =>
  `?${tenantQs()}&externalId=${encodeURIComponent(externalId)}`;

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("polar-customer-read HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(polarCustomerReadApiBasePath).toBe("/api/polar-customer-read");
    expect(polarCustomerReadApiPath).toEqual({
      byId: "/api/polar-customer-read/by-id",
      byEmail: "/api/polar-customer-read/by-email",
      byExternalId: "/api/polar-customer-read/by-external-id",
    });
  });

  it("is registered against the canonical backend API router via polarCustomerReadApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("polarCustomerReadApiBasePath")).toBe(
      true,
    );
    expect(backendApiSource.includes("polarCustomerReadHandler")).toBe(true);
    expect(
      backendApiSource.includes("handlePolarCustomerReadHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// by-id (GET)
// ---------------------------------------------------------------------------

describe("polar-customer-read HTTP — by-id", () => {
  it("returns the customer on GET happy path (200)", async () => {
    const customer = fakeCustomer();
    let receivedCustomerId: string | undefined;
    const handler = createTestHandler({
      getById: (input) => {
        receivedCustomerId = input.query.customerId;
        return Effect.succeed(
          Option.some({ summary: customer, isFresh: true }),
        );
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${polarCustomerReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      customer: { summary: customer, isFresh: true },
    });
    expect(receivedCustomerId).toBe("cust-001");
  });

  it("returns { customer: null } when no customer is found (option-none)", async () => {
    const handler = createTestHandler({
      getById: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${polarCustomerReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ customer: null });
  });

  it("returns 400 when the query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarCustomerReadApiPath.byId), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps PolarCustomerReadUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new PolarCustomerReadUnauthorized({
            operation: "getById",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${polarCustomerReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps PolarCustomerReadMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new PolarCustomerReadMissingActorIdentity({ operation: "getById" }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${polarCustomerReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps PolarCustomerReadReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new PolarCustomerReadReasonNotInCatalog({
            operation: "getById",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${polarCustomerReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps PolarCustomerReadAdapterClientError to 502", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new PolarCustomerReadAdapterClientError({
            operation: "getById",
            tenant: targetTenant,
            cause: new Error("upstream"),
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${polarCustomerReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps PolarAdapterRequestError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail({ _tag: "PolarAdapterRequestError" } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${polarCustomerReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("returns 500 for unknown / untagged service errors", async () => {
    const handler = createTestHandler({
      getById: () => Effect.fail(new Error("boom") as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${polarCustomerReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${polarCustomerReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${polarCustomerReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// by-email (GET)
// ---------------------------------------------------------------------------

describe("polar-customer-read HTTP — by-email", () => {
  it("returns the matching customers on GET happy path (200)", async () => {
    const summaries = [fakeCustomer()];
    let receivedEmail: string | undefined;
    const handler = createTestHandler({
      listByEmail: (input) => {
        receivedEmail = input.query.email;
        return Effect.succeed({ summaries, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${polarCustomerReadApiPath.byEmail}${byEmailQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summaries,
      isFresh: true,
    });
    expect(receivedEmail).toBe("billing@acme.test");
  });

  it("returns 400 when the email query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarCustomerReadApiPath.byEmail), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// by-external-id (GET)
// ---------------------------------------------------------------------------

describe("polar-customer-read HTTP — by-external-id", () => {
  it("returns the matching customers on GET happy path (200)", async () => {
    const summaries = [fakeCustomer()];
    let receivedExternalId: string | undefined;
    const handler = createTestHandler({
      listByExternalId: (input) => {
        receivedExternalId = input.query.externalId;
        return Effect.succeed({ summaries, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${polarCustomerReadApiPath.byExternalId}${byExternalIdQs()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summaries,
      isFresh: true,
    });
    expect(receivedExternalId).toBe("ext-acme");
  });

  it("returns 400 when the external-id query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarCustomerReadApiPath.byExternalId), {
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

describe("polar-customer-read HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /by-id with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarCustomerReadApiPath.byId), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-email with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarCustomerReadApiPath.byEmail), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-external-id with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(polarCustomerReadApiPath.byExternalId), {
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
        new Request(url("/api/polar-customer-read/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
