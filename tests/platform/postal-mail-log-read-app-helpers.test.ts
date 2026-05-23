/**
 * Postal mail log read app-helper smoke tests (admin-app implementation
 * plan §9 item 10 — batch B vendor #2). Confirms the three canonical
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
  getPostalMailLogByIdFromEnvironment,
  listPostalMailLogByRecipientFromEnvironment,
  listPostalMailLogByStatusFromEnvironment,
} from "@comvestec/platform";

const baseRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_postal_app_helpers_test",
  sessionId: "sess_postal_app_helpers_test",
  correlationId: "corr_postal_app_helpers_test",
  reason: "postal mail log read app helpers smoke",
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

describe("postal-mail-log-read app helpers", () => {
  it("exposes the three canonical *FromEnvironment helpers as functions", () => {
    expect(typeof getPostalMailLogByIdFromEnvironment).toBe("function");
    expect(getPostalMailLogByIdFromEnvironment.length).toBe(2);
    expect(typeof listPostalMailLogByRecipientFromEnvironment).toBe("function");
    expect(listPostalMailLogByRecipientFromEnvironment.length).toBe(2);
    expect(typeof listPostalMailLogByStatusFromEnvironment).toBe("function");
    expect(listPostalMailLogByStatusFromEnvironment.length).toBe(2);
  });

  it("getPostalMailLogByIdFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      getPostalMailLogByIdFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          query: {
            tenant: targetTenant,
            messageId: "msg_test_001",
            reasonCatalogId: reasonCatalogId.postalMailLogRead,
          },
        },
      ),
    );
  });

  it("listPostalMailLogByRecipientFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      listPostalMailLogByRecipientFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          query: {
            tenant: targetTenant,
            emailAddress: "to@example.test",
            reasonCatalogId: reasonCatalogId.postalMailLogRead,
          },
        },
      ),
    );
  });

  it("listPostalMailLogByStatusFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      listPostalMailLogByStatusFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          query: {
            tenant: targetTenant,
            status: "sent",
            reasonCatalogId: reasonCatalogId.postalMailLogRead,
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
        "packages/platform/src/services/apps/postal-mail-log-read-actions.ts",
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
