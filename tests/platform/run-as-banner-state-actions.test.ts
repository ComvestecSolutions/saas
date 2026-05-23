/**
 * Run-as banner state app-helper smoke tests (admin-app
 * implementation plan §9 item 14). Confirms the two canonical
 * `*FromEnvironment` helpers reach the env-bound boundary decoder
 * via the shared `loadRuntimeModuleOrDie` seam and that the helper
 * source contains no `Request` / `Response` shaping or per-helper
 * `Effect.tryPromise` duplication.
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  type RequestContext,
} from "@comvestec/contracts";
import {
  getRunAsBannerStateFromEnvironment,
  releaseRunAsGrantFromEnvironment,
} from "@comvestec/platform";

const baseRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_run_as_banner_state_helpers_test",
  sessionId: "sess_run_as_banner_state_helpers_test",
  correlationId: "corr_run_as_banner_state_helpers_test",
  reason: "run-as banner state app helpers smoke",
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

describe("run-as-banner-state app helpers", () => {
  it("exposes the two canonical *FromEnvironment helpers as functions", () => {
    expect(typeof getRunAsBannerStateFromEnvironment).toBe("function");
    expect(getRunAsBannerStateFromEnvironment.length).toBe(2);
    expect(typeof releaseRunAsGrantFromEnvironment).toBe("function");
    expect(releaseRunAsGrantFromEnvironment.length).toBe(2);
  });

  it("getRunAsBannerStateFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      getRunAsBannerStateFromEnvironment(
        {},
        { requestContext: baseRequestContext },
      ),
    );
  });

  it("releaseRunAsGrantFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      releaseRunAsGrantFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          grantId: "mbg_target_release",
          reason: "run-as-banner-state.release",
          reasonAttachmentText: "ticket-link-or-evidence",
        },
      ),
    );
  });

  it("re-uses the shared loadRuntimeModuleOrDie seam and shapes no Request/Response payloads", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/apps/run-as-banner-state-actions.ts",
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
