/**
 * Capability snapshot v2 app-helper smoke tests (admin-app
 * implementation plan §9 item 13). Confirms the two canonical
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
  getCapabilitySnapshotV2FromEnvironment,
  invalidateCapabilitySnapshotV2CacheFromEnvironment,
} from "@comvestec/platform";

const baseRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_capability_snapshot_v2_helpers_test",
  sessionId: "sess_capability_snapshot_v2_helpers_test",
  correlationId: "corr_capability_snapshot_v2_helpers_test",
  reason: "capability snapshot v2 app helpers smoke",
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

describe("capability-snapshot-v2 app helpers", () => {
  it("exposes the two canonical *FromEnvironment helpers as functions", () => {
    expect(typeof getCapabilitySnapshotV2FromEnvironment).toBe("function");
    expect(getCapabilitySnapshotV2FromEnvironment.length).toBe(2);
    expect(typeof invalidateCapabilitySnapshotV2CacheFromEnvironment).toBe(
      "function",
    );
    expect(invalidateCapabilitySnapshotV2CacheFromEnvironment.length).toBe(2);
  });

  it("getCapabilitySnapshotV2FromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      getCapabilitySnapshotV2FromEnvironment(
        {},
        { requestContext: baseRequestContext },
      ),
    );
  });

  it("invalidateCapabilitySnapshotV2CacheFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      invalidateCapabilitySnapshotV2CacheFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          actorId: "usr_target_to_evict",
        },
      ),
    );
  });

  it("re-uses the shared loadRuntimeModuleOrDie seam and shapes no Request/Response payloads", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/apps/capability-snapshot-v2-actions.ts",
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
