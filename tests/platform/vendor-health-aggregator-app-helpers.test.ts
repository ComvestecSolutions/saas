/**
 * Vendor-health aggregator app-helper smoke tests (admin-app
 * implementation plan §9 item 9 follow-up). Confirms the
 * canonical `*FromEnvironment` helper reaches the env-bound
 * boundary decoder via the shared `loadRuntimeModuleOrDie` seam
 * and that the helper source contains no `Request` / `Response`
 * shaping or per-helper `Effect.tryPromise` duplication.
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  type RequestContext,
} from "@comvestec/contracts";
import { getVendorHealthAggregateFromEnvironment } from "@comvestec/platform";

const baseRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_vh_app_helpers_test",
  sessionId: "sess_vh_app_helpers_test",
  correlationId: "corr_vh_app_helpers_test",
  reason: "vendor-health aggregator app helpers smoke",
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

describe("vendor-health-aggregator app helpers", () => {
  it("exposes the canonical *FromEnvironment helper as a function with the expected arity", () => {
    expect(typeof getVendorHealthAggregateFromEnvironment).toBe("function");
    expect(getVendorHealthAggregateFromEnvironment.length).toBe(2);
  });

  it("getVendorHealthAggregateFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      getVendorHealthAggregateFromEnvironment(
        {},
        { requestContext: baseRequestContext },
      ),
    );
  });

  it("re-uses the shared loadRuntimeModuleOrDie seam and shapes no Request/Response payloads", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/apps/vendor-health-aggregator-actions.ts",
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
