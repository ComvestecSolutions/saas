/**
 * Manual break-glass app-helper smoke tests (admin-app
 * implementation plan §9 item 5 follow-up). Confirms the four
 * canonical `*FromEnvironment` helpers reach the env-bound
 * boundary decoder via the shared `loadRuntimeModuleOrDie` seam
 * and that the helper source contains no `Request`/`Response`
 * shaping or per-helper `Effect.tryPromise` duplication.
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
  currentBreakGlassContextForActorFromEnvironment,
  issueBreakGlassGrantFromEnvironment,
  listActiveBreakGlassGrantsForSubjectFromEnvironment,
  releaseBreakGlassGrantFromEnvironment,
} from "@comvestec/platform";

const baseRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_mbg_app_helpers_test",
  sessionId: "sess_mbg_app_helpers_test",
  correlationId: "corr_mbg_app_helpers_test",
  reason: "manual break-glass app helpers smoke",
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

describe("manual-break-glass app helpers", () => {
  it("exposes the four canonical *FromEnvironment helpers as functions", () => {
    expect(typeof issueBreakGlassGrantFromEnvironment).toBe("function");
    expect(issueBreakGlassGrantFromEnvironment.length).toBe(2);
    expect(typeof releaseBreakGlassGrantFromEnvironment).toBe("function");
    expect(releaseBreakGlassGrantFromEnvironment.length).toBe(2);
    expect(typeof listActiveBreakGlassGrantsForSubjectFromEnvironment).toBe(
      "function",
    );
    expect(listActiveBreakGlassGrantsForSubjectFromEnvironment.length).toBe(2);
    expect(typeof currentBreakGlassContextForActorFromEnvironment).toBe(
      "function",
    );
    expect(currentBreakGlassContextForActorFromEnvironment.length).toBe(2);
  });

  it("issueBreakGlassGrantFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      issueBreakGlassGrantFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          grant: {
            grantedTo: "usr_mbg_grantee",
            targetTenant: {
              scope: platformScope.platform,
              scopeId: platformScope.platform,
            },
            reasonCatalogId: reasonCatalogId.breakGlassIssue,
            reasonNarrative: "smoke",
            reasonAttachmentText: "runbook://incident/INC-smoke",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        },
      ),
    );
  });

  it("releaseBreakGlassGrantFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      releaseBreakGlassGrantFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          release: {
            id: "mbg_smoke_id",
            releaseReasonCatalogId: reasonCatalogId.breakGlassRelease,
          },
        },
      ),
    );
  });

  it("listActiveBreakGlassGrantsForSubjectFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      listActiveBreakGlassGrantsForSubjectFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          subjectId: "usr_mbg_grantee",
        },
      ),
    );
  });

  it("currentBreakGlassContextForActorFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      currentBreakGlassContextForActorFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          subjectId: "usr_mbg_grantee",
        },
      ),
    );
  });

  it("re-uses the shared loadRuntimeModuleOrDie seam and shapes no Request/Response payloads", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/apps/manual-break-glass-actions.ts",
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
