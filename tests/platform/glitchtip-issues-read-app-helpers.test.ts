/**
 * GlitchTip issues read app-helper smoke tests (admin-app implementation
 * plan §9 item 10 — batch B vendor #3). Confirms the three canonical
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
  getGlitchTipIssueByIdFromEnvironment,
  listGlitchTipIssuesByLevelFromEnvironment,
  listGlitchTipIssuesByProjectFromEnvironment,
} from "@comvestec/platform";

const baseRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_glitchtip_app_helpers_test",
  sessionId: "sess_glitchtip_app_helpers_test",
  correlationId: "corr_glitchtip_app_helpers_test",
  reason: "glitchtip issues read app helpers smoke",
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

describe("glitchtip-issues-read app helpers", () => {
  it("exposes the three canonical *FromEnvironment helpers as functions", () => {
    expect(typeof getGlitchTipIssueByIdFromEnvironment).toBe("function");
    expect(getGlitchTipIssueByIdFromEnvironment.length).toBe(2);
    expect(typeof listGlitchTipIssuesByProjectFromEnvironment).toBe("function");
    expect(listGlitchTipIssuesByProjectFromEnvironment.length).toBe(2);
    expect(typeof listGlitchTipIssuesByLevelFromEnvironment).toBe("function");
    expect(listGlitchTipIssuesByLevelFromEnvironment.length).toBe(2);
  });

  it("getGlitchTipIssueByIdFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      getGlitchTipIssueByIdFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          query: {
            tenant: targetTenant,
            issueId: "issue_test_001",
            reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
          },
        },
      ),
    );
  });

  it("listGlitchTipIssuesByProjectFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      listGlitchTipIssuesByProjectFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          query: {
            tenant: targetTenant,
            projectSlug: "platform-api",
            reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
          },
        },
      ),
    );
  });

  it("listGlitchTipIssuesByLevelFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      listGlitchTipIssuesByLevelFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          query: {
            tenant: targetTenant,
            level: "error",
            reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
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
        "packages/platform/src/services/apps/glitchtip-issues-read-actions.ts",
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
