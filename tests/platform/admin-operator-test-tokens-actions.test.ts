/**
 * Admin-operator-test-tokens app-helper smoke tests
 * (admin-app implementation plan §9 item 17 — Phase 7a-2b-iii).
 *
 * Mirrors `notification-center-admin-actions.test.ts`: confirms the
 * three canonical `*FromEnvironment` helpers reach the env-bound
 * boundary decoder through the shared `loadRuntimeModuleOrDie`
 * seam and that the helper source contains exactly one
 * `loadRuntimeModuleOrDie(` call, no `Effect.tryPromise`, no
 * `Request` / `Response` shaping, no `Response.json` references,
 * and no imports of `*-http.ts`.
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
  issueAdminOperatorTestTokenFromEnvironment,
  listAdminOperatorTestTokensFromEnvironment,
  revokeAdminOperatorTestTokenFromEnvironment,
} from "@comvestec/platform";

const baseRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_admin_operator_test_tokens_helpers_test",
  sessionId: "sess_admin_operator_test_tokens_helpers_test",
  correlationId: "corr_admin_operator_test_tokens_helpers_test",
  reason: "admin-operator-test-tokens app helpers smoke",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

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

describe("admin-operator-test-tokens app helpers", () => {
  it("exposes the three canonical *FromEnvironment helpers as functions", () => {
    expect(typeof listAdminOperatorTestTokensFromEnvironment).toBe("function");
    expect(listAdminOperatorTestTokensFromEnvironment.length).toBe(2);
    expect(typeof issueAdminOperatorTestTokenFromEnvironment).toBe("function");
    expect(issueAdminOperatorTestTokenFromEnvironment.length).toBe(2);
    expect(typeof revokeAdminOperatorTestTokenFromEnvironment).toBe("function");
    expect(revokeAdminOperatorTestTokenFromEnvironment.length).toBe(2);
  });

  it("listAdminOperatorTestTokensFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      listAdminOperatorTestTokensFromEnvironment(
        {},
        { requestContext: baseRequestContext },
      ),
    );
  });

  it("issueAdminOperatorTestTokenFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      issueAdminOperatorTestTokenFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          label: "smoke",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          reasonCatalogId: reasonCatalogId.adminOperatorTestTokensIssue,
          reasonAttachmentText: "smoke-ticket",
        },
      ),
    );
  });

  it("revokeAdminOperatorTestTokenFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      revokeAdminOperatorTestTokenFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          id: "tok_smoke_revoke",
          reasonCatalogId: reasonCatalogId.adminOperatorTestTokensRevoke,
        },
      ),
    );
  });

  it("re-uses the shared loadRuntimeModuleOrDie seam and shapes no Request/Response/HTTP payloads", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/apps/admin-operator-test-tokens-actions.ts",
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
    // The helper must never import a backend-owned `*-http.ts`
    // handler — admin-app transport stays out of internal HTTP hops.
    expect(/from\s+["'][^"']*-http["']/.test(sourceWithoutComments)).toBe(
      false,
    );
  });
});
