import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  reasonCatalogId,
  type KeycloakRoleDetail,
  type RequestContext,
} from "@comvestec/contracts";
import {
  createKeycloakRoleReadHttpHandler,
  createKeycloakRoleReadHttpHandlerWithDependencies,
  KeycloakRoleReadAdapterClientError,
  KeycloakRoleReadMissingActorIdentity,
  KeycloakRoleReadUnauthorized,
  keycloakRoleReadApiBasePath,
  keycloakRoleReadApiPath,
  runKeycloakRoleReadFromEnvironment,
  type KeycloakRoleReadServiceImpl,
} from "@comvestec/platform";

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_kr_http_operator",
  sessionId: "sess_kr_http",
  correlationId: "corr_kr_http",
  reason: "keycloak role read http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
} as const;

const fakeRole = (
  overrides: Partial<KeycloakRoleDetail> = {},
): KeycloakRoleDetail => ({
  roleId: overrides.roleId ?? "kc-role-001",
  roleName: overrides.roleName ?? "tenant-admin",
  description: overrides.description ?? "Tenant administrators",
  composite: overrides.composite ?? true,
  clientRole: overrides.clientRole ?? false,
  realm: overrides.realm ?? "comvestec",
  compositeRoles: overrides.compositeRoles ?? [],
  members: overrides.members ?? [],
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(`unexpected keycloak-role-read HTTP service call: ${method}`),
  );

const createServiceDouble = (
  overrides: Partial<KeycloakRoleReadServiceImpl> = {},
): KeycloakRoleReadServiceImpl => ({
  getById: overrides.getById ?? (() => unexpectedServiceCall("getById")),
});

const createTestHandler = (
  service: Partial<KeycloakRoleReadServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createKeycloakRoleReadHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const unexpectedRunWithService = <A, E>(
  _use: (service: KeycloakRoleReadServiceImpl) => Effect.Effect<A, E>,
) => unexpectedServiceCall<A>("getById");

const url = (path: string) => `http://localhost${path}`;
const trustedSessionHeaders = { "x-comvestec-session-id": "sess_kr_http" };

const byIdQs = (roleId = "kc-role-001") =>
  `?tenantScope=${encodeURIComponent(targetTenant.scope)}` +
  `&tenantScopeId=${encodeURIComponent(targetTenant.scopeId)}` +
  `&reasonCatalogId=${encodeURIComponent(reasonCatalogId.keycloakRoleRead)}` +
  `&roleId=${encodeURIComponent(roleId)}`;

describe("keycloak-role-read HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(keycloakRoleReadApiBasePath).toBe("/api/keycloak-role-read");
    expect(keycloakRoleReadApiPath).toEqual({
      byId: "/api/keycloak-role-read/by-id",
    });
  });

  it("is registered against the canonical backend API router via keycloakRoleReadApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );

    expect(backendApiSource.includes("keycloakRoleReadApiBasePath")).toBe(true);
    expect(backendApiSource.includes("keycloakRoleReadHandler")).toBe(true);
    expect(backendApiSource.includes("handleKeycloakRoleReadHttpRequest")).toBe(
      true,
    );
  });
});

describe("keycloak-role-read HTTP — by-id", () => {
  it("returns the role on GET happy path (200)", async () => {
    const role = fakeRole();
    let receivedRoleId: string | undefined;
    const handler = createTestHandler({
      getById: (input) => {
        receivedRoleId = input.query.roleId;
        return Effect.succeed(Option.some({ detail: role, isFresh: true }));
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakRoleReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      role: { detail: role, isFresh: true },
    });
    expect(receivedRoleId).toBe("kc-role-001");
  });

  it("returns { role: null } when no role is found (option-none)", async () => {
    const handler = createTestHandler({
      getById: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakRoleReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ role: null });
  });

  it("returns 400 when the query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(keycloakRoleReadApiPath.byId), { method: "GET" }),
      ),
    );

    expect(response.status).toBe(400);
  });

  it("maps KeycloakRoleReadUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new KeycloakRoleReadUnauthorized({
            operation: "getById",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakRoleReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );

    expect(response.status).toBe(401);
  });

  it("maps KeycloakRoleReadMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new KeycloakRoleReadMissingActorIdentity({ operation: "getById" }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakRoleReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );

    expect(response.status).toBe(401);
  });

  it("maps adapter client failures to 502", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new KeycloakRoleReadAdapterClientError({
            operation: "getById",
            tenant: targetTenant,
            cause: new Error("boom"),
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakRoleReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );

    expect(response.status).toBe(502);
  });

  it("maps missing VALKEY_URL to 500", async () => {
    const handler = createKeycloakRoleReadHttpHandler(
      {},
      unexpectedRunWithService,
    );
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakRoleReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
          headers: trustedSessionHeaders,
        }),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Keycloak role read service is not configured correctly.",
    });
  });

  it("maps missing role-read runtime bounds env to 500", async () => {
    const handler = createKeycloakRoleReadHttpHandlerWithDependencies({
      resolveRequestContext: () => Effect.succeed(trustedRequestContext),
      runWithService: (use) =>
        runKeycloakRoleReadFromEnvironment(
          {
            POSTGRES_URL: "postgres://localhost:5432/comvestec",
            KEYCLOAK_BASE_URL: "https://keycloak.example.test",
            KEYCLOAK_REALM: "comvestec",
            KEYCLOAK_CLIENT_ID: "admin-cli",
            KEYCLOAK_CLIENT_SECRET: "secret",
            KEYCLOAK_ADMIN: "admin",
            KEYCLOAK_ADMIN_PASSWORD: "password",
            KEYCLOAK_ROLE_READ_SNAPSHOT_CACHE_TTL_SECONDS: "30",
          },
          use,
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakRoleReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Keycloak role read service is not configured correctly.",
    });
  });

  it("maps missing required Keycloak env to 500", async () => {
    const handler = createKeycloakRoleReadHttpHandlerWithDependencies({
      resolveRequestContext: () => Effect.succeed(trustedRequestContext),
      runWithService: (use) =>
        runKeycloakRoleReadFromEnvironment(
          {
            POSTGRES_URL: "postgres://localhost:5432/comvestec",
            KEYCLOAK_BASE_URL: "https://keycloak.example.test",
            KEYCLOAK_REALM: "comvestec",
            KEYCLOAK_CLIENT_ID: "admin-cli",
            KEYCLOAK_CLIENT_SECRET: "secret",
            KEYCLOAK_ROLE_READ_CACHE_MAX_SIZE: "10",
            KEYCLOAK_ROLE_READ_SNAPSHOT_CACHE_TTL_SECONDS: "30",
          },
          use,
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakRoleReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Keycloak role read service is not configured correctly.",
    });
  });

  it("maps the missing-session-header tag to 401 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({
        _tag: "SubscriberJourneySessionIdMissingError",
      } as const),
    );
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakRoleReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${keycloakRoleReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );

    expect(response.status).toBe(404);
  });
});

describe("keycloak-role-read HTTP — method + unknown path", () => {
  it("returns 405 when the route exists but the method is not allowed", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(keycloakRoleReadApiPath.byId), {
          method: "POST",
        }),
      ),
    );

    expect(response.status).toBe(405);
  });

  it("returns 404 when the sub-path is not owned by the slice", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${keycloakRoleReadApiBasePath}/unknown`), {
          method: "GET",
        }),
      ),
    );

    expect(response.status).toBe(404);
  });
});
