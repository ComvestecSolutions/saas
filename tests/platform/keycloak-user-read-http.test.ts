/**
 * Keycloak user read HTTP transport tests (admin-app implementation
 * plan §9 item 10 — batch A vendor #1). Exercises the
 * `createKeycloakUserReadHttpHandlerWithDependencies` seam with an
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
  type KeycloakUserSummary,
  type RequestContext,
} from "@comvestec/contracts";
import {
  KeycloakUserReadAdapterClientError,
  KeycloakUserReadMissingActorIdentity,
  KeycloakUserReadReasonNotInCatalog,
  KeycloakUserReadUnauthorized,
  createKeycloakUserReadHttpHandlerWithDependencies,
  keycloakUserReadApiBasePath,
  keycloakUserReadApiPath,
  type KeycloakUserReadServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_kc_http_operator",
  sessionId: "sess_kc_http",
  correlationId: "corr_kc_http",
  reason: "keycloak user read http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
} as const;

const fakeUser = (
  overrides: Partial<KeycloakUserSummary> = {},
): KeycloakUserSummary => ({
  userId: overrides.userId ?? "kc-user-001",
  username: overrides.username ?? "acme-owner",
  email: overrides.email ?? "owner@acme.test",
  enabled: overrides.enabled ?? true,
  emailVerified: overrides.emailVerified ?? true,
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  requiredActions: overrides.requiredActions ?? [],
  realm: overrides.realm ?? "comvestec",
  ...(overrides.firstName !== undefined
    ? { firstName: overrides.firstName }
    : {}),
  ...(overrides.lastName !== undefined ? { lastName: overrides.lastName } : {}),
  ...(overrides.lastLogin !== undefined
    ? { lastLogin: overrides.lastLogin }
    : {}),
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(`unexpected keycloak-user-read HTTP service call: ${method}`),
  );

const createServiceDouble = (
  overrides: Partial<KeycloakUserReadServiceImpl> = {},
): KeycloakUserReadServiceImpl => ({
  getById: overrides.getById ?? (() => unexpectedServiceCall("getById")),
  listByEmail:
    overrides.listByEmail ?? (() => unexpectedServiceCall("listByEmail")),
  listByUsername:
    overrides.listByUsername ?? (() => unexpectedServiceCall("listByUsername")),
});

const createTestHandler = (
  service: Partial<KeycloakUserReadServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createKeycloakUserReadHttpHandlerWithDependencies({
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
  `&reasonCatalogId=${encodeURIComponent(reasonCatalogId.keycloakUserRead)}`;

const byIdQs = (userId = "kc-user-001") =>
  `?${tenantQs()}&userId=${encodeURIComponent(userId)}`;
const byEmailQs = (email = "owner@acme.test") =>
  `?${tenantQs()}&email=${encodeURIComponent(email)}`;
const byUsernameQs = (username = "acme-owner") =>
  `?${tenantQs()}&username=${encodeURIComponent(username)}`;

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("keycloak-user-read HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(keycloakUserReadApiBasePath).toBe("/api/keycloak-user-read");
    expect(keycloakUserReadApiPath).toEqual({
      byId: "/api/keycloak-user-read/by-id",
      byEmail: "/api/keycloak-user-read/by-email",
      byUsername: "/api/keycloak-user-read/by-username",
    });
  });

  it("is registered against the canonical backend API router via keycloakUserReadApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("keycloakUserReadApiBasePath")).toBe(true);
    expect(backendApiSource.includes("keycloakUserReadHandler")).toBe(true);
    expect(backendApiSource.includes("handleKeycloakUserReadHttpRequest")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// by-id (GET)
// ---------------------------------------------------------------------------

describe("keycloak-user-read HTTP — by-id", () => {
  it("returns the user on GET happy path (200)", async () => {
    const user = fakeUser();
    let receivedUserId: string | undefined;
    const handler = createTestHandler({
      getById: (input) => {
        receivedUserId = input.query.userId;
        return Effect.succeed(Option.some({ summary: user, isFresh: true }));
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakUserReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { summary: user, isFresh: true },
    });
    expect(receivedUserId).toBe("kc-user-001");
  });

  it("returns { user: null } when no user is found (option-none)", async () => {
    const handler = createTestHandler({
      getById: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakUserReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user: null });
  });

  it("returns 400 when the query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(keycloakUserReadApiPath.byId), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps KeycloakUserReadUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new KeycloakUserReadUnauthorized({
            operation: "getById",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakUserReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps KeycloakUserReadMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new KeycloakUserReadMissingActorIdentity({ operation: "getById" }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakUserReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps KeycloakUserReadReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new KeycloakUserReadReasonNotInCatalog({
            operation: "getById",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakUserReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps KeycloakUserReadAdapterClientError to 502", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new KeycloakUserReadAdapterClientError({
            operation: "getById",
            tenant: targetTenant,
            cause: new Error("upstream"),
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakUserReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps KeycloakAdapterRequestError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail({
          _tag: "KeycloakAdapterRequestError",
        } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakUserReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${keycloakUserReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${keycloakUserReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${keycloakUserReadApiPath.byId}${byIdQs()}`), {
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

describe("keycloak-user-read HTTP — by-email", () => {
  it("returns the matching users on GET happy path (200)", async () => {
    const summaries = [fakeUser()];
    let receivedEmail: string | undefined;
    const handler = createTestHandler({
      listByEmail: (input) => {
        receivedEmail = input.query.email;
        return Effect.succeed({ summaries, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakUserReadApiPath.byEmail}${byEmailQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summaries,
      isFresh: true,
    });
    expect(receivedEmail).toBe("owner@acme.test");
  });

  it("returns 400 when the email query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(keycloakUserReadApiPath.byEmail), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// by-username (GET)
// ---------------------------------------------------------------------------

describe("keycloak-user-read HTTP — by-username", () => {
  it("returns the matching users on GET happy path (200)", async () => {
    const summaries = [fakeUser()];
    let receivedUsername: string | undefined;
    const handler = createTestHandler({
      listByUsername: (input) => {
        receivedUsername = input.query.username;
        return Effect.succeed({ summaries, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${keycloakUserReadApiPath.byUsername}${byUsernameQs()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summaries,
      isFresh: true,
    });
    expect(receivedUsername).toBe("acme-owner");
  });

  it("returns 400 when the username query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(keycloakUserReadApiPath.byUsername), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("keycloak-user-read HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /by-id with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(keycloakUserReadApiPath.byId), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-email with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(keycloakUserReadApiPath.byEmail), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-username with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(keycloakUserReadApiPath.byUsername), {
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
        new Request(url("/api/keycloak-user-read/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
