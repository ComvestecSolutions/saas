/**
 * Admin-app Keycloak-role-detail loader tests (admin-app
 * implementation plan §8.15 + §11 — Phase 6 vendor + workflow
 * operator screens follow-up). Covers the discriminated-union
 * mapping of the `/desk/kc-role/$id` loader trio backed live by
 * `getKeycloakRoleByIdFromEnvironment` through
 * `resolveTrustedRequestContextFromSessionId`.
 *
 *   - `SubscriberJourneySessionIdMissingError` -> `shell`
 *   - `IdentitySessionRequestContextNotFoundError` -> `stale-session`
 *   - `KeycloakRoleReadUnauthorized` -> `denied`
 *   - role helper success + `Option.none()` -> `not-found`
 *   - role helper success + `Option.some(...)` -> `ready`
 *   - boundary `Error` -> `error`
 */
import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import { platformScope, type KeycloakRoleDetail } from "@comvestec/contracts";
import {
  loadAdminKeycloakRoleDetailRouteDataFromRequest,
  type AdminKeycloakRoleDetailDependencies,
  type AdminKeycloakRoleDetailInput,
} from "../../apps/admin-app/src/lib/keycloak-role-detail-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleRole: KeycloakRoleDetail = {
  roleId: "kc_role_fixture_1",
  roleName: "tenant-admin",
  description: "Tenant-wide administrative role.",
  composite: true,
  clientRole: false,
  realm: "comvestec-admin",
  compositeRoles: [
    {
      roleId: "kc_role_support",
      roleName: "tenant-support",
      composite: false,
      clientRole: false,
      description: "Support role.",
    },
  ],
  members: [
    {
      userId: "kc_usr_fixture_1",
      username: "fixture.member",
      email: "fixture.member@comvestec.com",
      enabled: true,
    },
  ],
};

const baseInput: AdminKeycloakRoleDetailInput = {
  roleId: "kc_role_fixture_1",
  tenant: { scope: platformScope.organization, scopeId: "org_demo" },
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  getKeycloakRoleById: () =>
    Effect.succeed(Option.some({ detail: sampleRole, isFresh: true })),
} as unknown as AdminKeycloakRoleDetailDependencies;

const failingResolveContext = (
  tag: string,
): AdminKeycloakRoleDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    getKeycloakRoleById: () =>
      Effect.succeed(Option.some({ detail: sampleRole, isFresh: true })),
  }) as unknown as AdminKeycloakRoleDetailDependencies;

const deniedDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  getKeycloakRoleById: () =>
    Effect.fail({ _tag: "KeycloakRoleReadUnauthorized" } as const),
} as unknown as AdminKeycloakRoleDetailDependencies;

const missingRoleDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  getKeycloakRoleById: () => Effect.succeed(Option.none()),
} as unknown as AdminKeycloakRoleDetailDependencies;

const throwingDependencies = (
  error: unknown,
): AdminKeycloakRoleDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getKeycloakRoleById: () => Effect.fail(error),
  }) as unknown as AdminKeycloakRoleDetailDependencies;

describe("admin-app keycloak-role-detail loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminKeycloakRoleDetailRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );

    expect(result.kind).toBe("shell");
  });

  it("returns ready with role membership detail when the helper succeeds", async () => {
    const result = await Effect.runPromise(
      loadAdminKeycloakRoleDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.role.roleName).toBe("tenant-admin");
    expect(result.role.members).toHaveLength(1);
    expect(result.role.compositeRoles).toHaveLength(1);
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminKeycloakRoleDetailRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );

    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the helper raises unauthorized", async () => {
    const result = await Effect.runPromise(
      loadAdminKeycloakRoleDetailRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        deniedDependencies,
      ),
    );

    expect(result.kind).toBe("denied");
  });

  it("returns not-found when the helper returns Option.none()", async () => {
    const result = await Effect.runPromise(
      loadAdminKeycloakRoleDetailRouteDataFromRequest(
        buildRequest("sess-missing"),
        {},
        baseInput,
        missingRoleDependencies,
      ),
    );

    expect(result.kind).toBe("not-found");
    if (result.kind !== "not-found") return;
    expect(result.title).toBe("Keycloak role not found");
  });

  it("returns error when an untagged Error escapes the helper", async () => {
    const result = await Effect.runPromise(
      loadAdminKeycloakRoleDetailRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(new Error("Keycloak role reader unavailable.")),
      ),
    );

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Keycloak role detail unavailable");
    expect(result.description).toBe("Keycloak role reader unavailable.");
  });
});
