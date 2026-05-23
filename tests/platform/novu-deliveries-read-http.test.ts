/**
 * Novu deliveries read HTTP transport tests (admin-app implementation
 * plan §9 item 10 — batch B vendor #1). Mirrors the open-meter-meter-read
 * HTTP test: exercises the
 * `createNovuDeliveriesReadHttpHandlerWithDependencies` seam with an
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
  type NovuDeliverySummary,
  type RequestContext,
} from "@comvestec/contracts";
import {
  NovuDeliveriesReadAdapterClientError,
  NovuDeliveriesReadMissingActorIdentity,
  NovuDeliveriesReadReasonNotInCatalog,
  NovuDeliveriesReadUnauthorized,
  createNovuDeliveriesReadHttpHandlerWithDependencies,
  novuDeliveriesReadApiBasePath,
  novuDeliveriesReadApiPath,
  type NovuDeliveriesReadServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_novu_http_operator",
  sessionId: "sess_novu_http",
  correlationId: "corr_novu_http",
  reason: "novu deliveries read http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
} as const;

const fakeDelivery = (
  overrides: Partial<NovuDeliverySummary> = {},
): NovuDeliverySummary => ({
  deliveryId: overrides.deliveryId ?? "del_test_001",
  subscriberId: overrides.subscriberId ?? "sub_test_001",
  channel: overrides.channel ?? "email",
  status: overrides.status ?? "sent",
  sentAt: overrides.sentAt ?? "2026-01-01T00:00:00.000Z",
  templateId: overrides.templateId ?? "tpl_welcome",
  templateName: overrides.templateName ?? "Welcome Email",
  payloadDigest: overrides.payloadDigest ?? "sha256:abc",
  ...(overrides.deliveredAt !== undefined
    ? { deliveredAt: overrides.deliveredAt }
    : {}),
  ...(overrides.openedAt !== undefined ? { openedAt: overrides.openedAt } : {}),
  ...(overrides.errorMessage !== undefined
    ? { errorMessage: overrides.errorMessage }
    : {}),
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(`unexpected novu-deliveries-read HTTP service call: ${method}`),
  );

const createServiceDouble = (
  overrides: Partial<NovuDeliveriesReadServiceImpl> = {},
): NovuDeliveriesReadServiceImpl => ({
  getById: overrides.getById ?? (() => unexpectedServiceCall("getById")),
  listByRecipient:
    overrides.listByRecipient ??
    (() => unexpectedServiceCall("listByRecipient")),
  listByChannel:
    overrides.listByChannel ?? (() => unexpectedServiceCall("listByChannel")),
});

const createTestHandler = (
  service: Partial<NovuDeliveriesReadServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createNovuDeliveriesReadHttpHandlerWithDependencies({
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
  `&reasonCatalogId=${encodeURIComponent(reasonCatalogId.novuDeliveriesRead)}`;

const byIdQs = (deliveryId = "del_test_001") =>
  `?${tenantQs()}&deliveryId=${encodeURIComponent(deliveryId)}`;
const byRecipientQs = (subscriberId = "sub_test_001") =>
  `?${tenantQs()}&subscriberId=${encodeURIComponent(subscriberId)}`;
const byChannelQs = (channel = "email") =>
  `?${tenantQs()}&channel=${encodeURIComponent(channel)}`;

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("novu-deliveries-read HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(novuDeliveriesReadApiBasePath).toBe("/api/novu-deliveries-read");
    expect(novuDeliveriesReadApiPath).toEqual({
      byId: "/api/novu-deliveries-read/by-id",
      byRecipient: "/api/novu-deliveries-read/by-recipient",
      byChannel: "/api/novu-deliveries-read/by-channel",
    });
  });

  it("is registered against the canonical backend API router via novuDeliveriesReadApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("novuDeliveriesReadApiBasePath")).toBe(
      true,
    );
    expect(backendApiSource.includes("novuDeliveriesReadHandler")).toBe(true);
    expect(
      backendApiSource.includes("handleNovuDeliveriesReadHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// by-id (GET)
// ---------------------------------------------------------------------------

describe("novu-deliveries-read HTTP — by-id", () => {
  it("returns the delivery on GET happy path (200)", async () => {
    const delivery = fakeDelivery();
    let receivedId: string | undefined;
    const handler = createTestHandler({
      getById: (input) => {
        receivedId = input.query.deliveryId;
        return Effect.succeed(
          Option.some({ summary: delivery, isFresh: true }),
        );
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${novuDeliveriesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      delivery: { summary: delivery, isFresh: true },
    });
    expect(receivedId).toBe("del_test_001");
  });

  it("returns { delivery: null } when no delivery is found (option-none)", async () => {
    const handler = createTestHandler({
      getById: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${novuDeliveriesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ delivery: null });
  });

  it("returns 400 when the query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(novuDeliveriesReadApiPath.byId), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps NovuDeliveriesReadUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new NovuDeliveriesReadUnauthorized({
            operation: "getById",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${novuDeliveriesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps NovuDeliveriesReadMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new NovuDeliveriesReadMissingActorIdentity({ operation: "getById" }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${novuDeliveriesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps NovuDeliveriesReadReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new NovuDeliveriesReadReasonNotInCatalog({
            operation: "getById",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${novuDeliveriesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps NovuDeliveriesReadAdapterClientError to 502", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new NovuDeliveriesReadAdapterClientError({
            operation: "getById",
            tenant: targetTenant,
            cause: new Error("upstream"),
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${novuDeliveriesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps NovuAdapterRequestError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail({ _tag: "NovuAdapterRequestError" } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${novuDeliveriesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps NovuAdapterTransportError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail({ _tag: "NovuAdapterTransportError" } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${novuDeliveriesReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${novuDeliveriesReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${novuDeliveriesReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${novuDeliveriesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// by-recipient (GET)
// ---------------------------------------------------------------------------

describe("novu-deliveries-read HTTP — by-recipient", () => {
  it("returns the deliveries on GET happy path (200)", async () => {
    const summaries = [fakeDelivery()];
    let receivedSubscriber: string | undefined;
    const handler = createTestHandler({
      listByRecipient: (input) => {
        receivedSubscriber = input.query.subscriberId;
        return Effect.succeed({ summaries, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${novuDeliveriesReadApiPath.byRecipient}${byRecipientQs()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summaries,
      isFresh: true,
    });
    expect(receivedSubscriber).toBe("sub_test_001");
  });

  it("returns 400 when the by-recipient query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(novuDeliveriesReadApiPath.byRecipient), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// by-channel (GET)
// ---------------------------------------------------------------------------

describe("novu-deliveries-read HTTP — by-channel", () => {
  it("returns the matching deliveries on GET happy path (200)", async () => {
    const summaries = [fakeDelivery()];
    let receivedChannel: string | undefined;
    const handler = createTestHandler({
      listByChannel: (input) => {
        receivedChannel = input.query.channel;
        return Effect.succeed({ summaries, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${novuDeliveriesReadApiPath.byChannel}${byChannelQs()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summaries,
      isFresh: true,
    });
    expect(receivedChannel).toBe("email");
  });

  it("returns 400 when the by-channel query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(novuDeliveriesReadApiPath.byChannel), {
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

describe("novu-deliveries-read HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /by-id with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(novuDeliveriesReadApiPath.byId), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-recipient with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(novuDeliveriesReadApiPath.byRecipient), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-channel with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(novuDeliveriesReadApiPath.byChannel), {
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
        new Request(url("/api/novu-deliveries-read/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
