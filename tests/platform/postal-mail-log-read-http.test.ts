/**
 * Postal mail log read HTTP transport tests (admin-app implementation
 * plan §9 item 10 — batch B vendor #2). Mirrors the novu-deliveries-read
 * HTTP test: exercises the
 * `createPostalMailLogReadHttpHandlerWithDependencies` seam with an
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
  type PostalMailLogEntry,
  type RequestContext,
} from "@comvestec/contracts";
import {
  PostalMailLogReadAdapterClientError,
  PostalMailLogReadMissingActorIdentity,
  PostalMailLogReadReasonNotInCatalog,
  PostalMailLogReadUnauthorized,
  createPostalMailLogReadHttpHandlerWithDependencies,
  postalMailLogReadApiBasePath,
  postalMailLogReadApiPath,
  type PostalMailLogReadServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_postal_http_operator",
  sessionId: "sess_postal_http",
  correlationId: "corr_postal_http",
  reason: "postal mail log read http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
} as const;

const fakeEntry = (
  overrides: Partial<PostalMailLogEntry> = {},
): PostalMailLogEntry => ({
  messageId: overrides.messageId ?? "msg_test_001",
  fromAddress: overrides.fromAddress ?? "from@example.test",
  toAddress: overrides.toAddress ?? "to@example.test",
  subject: overrides.subject ?? "Welcome",
  status: overrides.status ?? "sent",
  sentAt: overrides.sentAt ?? "2026-01-01T00:00:00.000Z",
  lastEventAt: overrides.lastEventAt ?? "2026-01-01T00:00:05.000Z",
  ...(overrides.deliveredAt !== undefined
    ? { deliveredAt: overrides.deliveredAt }
    : {}),
  ...(overrides.bounceReason !== undefined
    ? { bounceReason: overrides.bounceReason }
    : {}),
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(`unexpected postal-mail-log-read HTTP service call: ${method}`),
  );

const createServiceDouble = (
  overrides: Partial<PostalMailLogReadServiceImpl> = {},
): PostalMailLogReadServiceImpl => ({
  getById: overrides.getById ?? (() => unexpectedServiceCall("getById")),
  listByRecipient:
    overrides.listByRecipient ??
    (() => unexpectedServiceCall("listByRecipient")),
  listByStatus:
    overrides.listByStatus ?? (() => unexpectedServiceCall("listByStatus")),
});

const createTestHandler = (
  service: Partial<PostalMailLogReadServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createPostalMailLogReadHttpHandlerWithDependencies({
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
  `&reasonCatalogId=${encodeURIComponent(reasonCatalogId.postalMailLogRead)}`;

const byIdQs = (messageId = "msg_test_001") =>
  `?${tenantQs()}&messageId=${encodeURIComponent(messageId)}`;
const byRecipientQs = (emailAddress = "to@example.test") =>
  `?${tenantQs()}&emailAddress=${encodeURIComponent(emailAddress)}`;
const byStatusQs = (status = "sent") =>
  `?${tenantQs()}&status=${encodeURIComponent(status)}`;

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("postal-mail-log-read HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(postalMailLogReadApiBasePath).toBe("/api/postal-mail-log-read");
    expect(postalMailLogReadApiPath).toEqual({
      byId: "/api/postal-mail-log-read/by-id",
      byRecipient: "/api/postal-mail-log-read/by-recipient",
      byStatus: "/api/postal-mail-log-read/by-status",
    });
  });

  it("is registered against the canonical backend API router via postalMailLogReadApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("postalMailLogReadApiBasePath")).toBe(
      true,
    );
    expect(backendApiSource.includes("postalMailLogReadHandler")).toBe(true);
    expect(
      backendApiSource.includes("handlePostalMailLogReadHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// by-id (GET)
// ---------------------------------------------------------------------------

describe("postal-mail-log-read HTTP — by-id", () => {
  it("returns the entry on GET happy path (200)", async () => {
    const entry = fakeEntry();
    let receivedId: string | undefined;
    const handler = createTestHandler({
      getById: (input) => {
        receivedId = input.query.messageId;
        return Effect.succeed(Option.some({ entry, isFresh: true }));
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${postalMailLogReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      entry: { entry, isFresh: true },
    });
    expect(receivedId).toBe("msg_test_001");
  });

  it("returns { entry: null } when no entry is found (option-none)", async () => {
    const handler = createTestHandler({
      getById: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${postalMailLogReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entry: null });
  });

  it("returns 400 when the query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(postalMailLogReadApiPath.byId), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps PostalMailLogReadUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new PostalMailLogReadUnauthorized({
            operation: "getById",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${postalMailLogReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps PostalMailLogReadMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new PostalMailLogReadMissingActorIdentity({ operation: "getById" }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${postalMailLogReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps PostalMailLogReadReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new PostalMailLogReadReasonNotInCatalog({
            operation: "getById",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${postalMailLogReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps PostalMailLogReadAdapterClientError to 502", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new PostalMailLogReadAdapterClientError({
            operation: "getById",
            tenant: targetTenant,
            cause: new Error("upstream"),
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${postalMailLogReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps PostalAdapterRequestError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail({ _tag: "PostalAdapterRequestError" } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${postalMailLogReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps PostalAdapterTransportError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail({
          _tag: "PostalAdapterTransportError",
        } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${postalMailLogReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${postalMailLogReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${postalMailLogReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${postalMailLogReadApiPath.byId}${byIdQs()}`), {
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

describe("postal-mail-log-read HTTP — by-recipient", () => {
  it("returns the entries on GET happy path (200)", async () => {
    const entries = [fakeEntry()];
    let receivedEmail: string | undefined;
    const handler = createTestHandler({
      listByRecipient: (input) => {
        receivedEmail = input.query.emailAddress;
        return Effect.succeed({ entries, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${postalMailLogReadApiPath.byRecipient}${byRecipientQs()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      entries,
      isFresh: true,
    });
    expect(receivedEmail).toBe("to@example.test");
  });

  it("returns 400 when the by-recipient query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(postalMailLogReadApiPath.byRecipient), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// by-status (GET)
// ---------------------------------------------------------------------------

describe("postal-mail-log-read HTTP — by-status", () => {
  it("returns the matching entries on GET happy path (200)", async () => {
    const entries = [fakeEntry()];
    let receivedStatus: string | undefined;
    const handler = createTestHandler({
      listByStatus: (input) => {
        receivedStatus = input.query.status;
        return Effect.succeed({ entries, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${postalMailLogReadApiPath.byStatus}${byStatusQs()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      entries,
      isFresh: true,
    });
    expect(receivedStatus).toBe("sent");
  });

  it("returns 400 when the by-status query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(postalMailLogReadApiPath.byStatus), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("postal-mail-log-read HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /by-id with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(postalMailLogReadApiPath.byId), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-recipient with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(postalMailLogReadApiPath.byRecipient), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-status with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(postalMailLogReadApiPath.byStatus), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("returns 404 on unknown sub-path", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/postal-mail-log-read/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
