/**
 * Keycloak user read app-helper smoke tests (admin-app implementation
 * plan §9 item 10 — batch A vendor #1). Confirms the three canonical
 * `*FromEnvironment` helpers reach the env-bound boundary decoder via
 * the shared `loadRuntimeModuleOrDie` seam and that the helper source
 * contains no `Request` / `Response` shaping or per-helper
 * `Effect.tryPromise` duplication.
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  reasonCatalogId,
  type RequestContext,
} from "@comvestec/contracts";
import {
  getKeycloakUserByIdFromEnvironment,
  listKeycloakUsersByEmailFromEnvironment,
  listKeycloakUsersByUsernameFromEnvironment,
} from "@comvestec/platform";

const baseRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_kc_app_helpers_test",
  sessionId: "sess_kc_app_helpers_test",
  correlationId: "corr_kc_app_helpers_test",
  reason: "keycloak user read app helpers smoke",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
} as const;

const expectEnvParseFailure = async (
  effect: Effect.Effect<unknown, unknown>,
) => {
  const exit = await Effect.runPromiseExit(effect);
  expect(exit._tag).toBe("Failure");
  if (exit._tag === "Failure") {
    const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
    expect(failure).toBeDefined();
    expect(
      typeof failure === "object" &&
        failure !== null &&
        "_tag" in failure &&
        (failure as { readonly _tag: string })._tag === "ParseError",
    ).toBe(true);
  }
};

describe("keycloak-user-read app helpers", () => {
  it("exposes the three canonical *FromEnvironment helpers as functions", () => {
    expect(typeof getKeycloakUserByIdFromEnvironment).toBe("function");
    expect(getKeycloakUserByIdFromEnvironment.length).toBe(2);
    expect(typeof listKeycloakUsersByEmailFromEnvironment).toBe("function");
    expect(listKeycloakUsersByEmailFromEnvironment.length).toBe(2);
    expect(typeof listKeycloakUsersByUsernameFromEnvironment).toBe("function");
    expect(listKeycloakUsersByUsernameFromEnvironment.length).toBe(2);
  });

  it("getKeycloakUserByIdFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      getKeycloakUserByIdFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          query: {
            tenant: targetTenant,
            userId: "kc-user-001",
            reasonCatalogId: reasonCatalogId.keycloakUserRead,
          },
        },
      ),
    );
  });

  it("listKeycloakUsersByEmailFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      listKeycloakUsersByEmailFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          query: {
            tenant: targetTenant,
            email: "owner@acme.test",
            reasonCatalogId: reasonCatalogId.keycloakUserRead,
          },
        },
      ),
    );
  });

  it("listKeycloakUsersByUsernameFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      listKeycloakUsersByUsernameFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          query: {
            tenant: targetTenant,
            username: "acme-owner",
            reasonCatalogId: reasonCatalogId.keycloakUserRead,
          },
        },
      ),
    );
  });

  it("re-uses the shared loadRuntimeModuleOrDie seam and shapes no Request/Response payloads", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/apps/keycloak-user-read-actions.ts",
      ),
      "utf8",
    );
    const sourceWithoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[\t ]*\/\/.*$/gm, "");
    const loadRuntimeModuleOrDieMatches = sourceWithoutComments.match(
      /loadRuntimeModuleOrDie\(/g,
    );
    expect(loadRuntimeModuleOrDieMatches).not.toBeNull();
    expect(loadRuntimeModuleOrDieMatches?.length).toBe(1);
    expect(sourceWithoutComments.includes("Effect.tryPromise")).toBe(false);
    expect(sourceWithoutComments.includes("new Request(")).toBe(false);
    expect(sourceWithoutComments.includes("new Response(")).toBe(false);
    expect(/\bResponse\.json\b/.test(sourceWithoutComments)).toBe(false);
  });
});
