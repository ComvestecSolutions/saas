/**
 * OpenMeter usage query app-helper smoke tests (admin-app
 * implementation plan §9 item 8 follow-up). Confirms the two canonical
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
  getOpenMeterUsageQueryFromEnvironment,
  requestOpenMeterUsageBackfillFromEnvironment,
} from "@comvestec/platform";

const baseRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_omu_app_helpers_test",
  sessionId: "sess_omu_app_helpers_test",
  correlationId: "corr_omu_app_helpers_test",
  reason: "open meter usage query app helpers smoke",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
} as const;

const sampleWindow = {
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-02T00:00:00.000Z",
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

describe("open-meter-usage-query app helpers", () => {
  it("exposes the two canonical *FromEnvironment helpers as functions", () => {
    expect(typeof getOpenMeterUsageQueryFromEnvironment).toBe("function");
    expect(getOpenMeterUsageQueryFromEnvironment.length).toBe(2);
    expect(typeof requestOpenMeterUsageBackfillFromEnvironment).toBe(
      "function",
    );
    expect(requestOpenMeterUsageBackfillFromEnvironment.length).toBe(2);
  });

  it("getOpenMeterUsageQueryFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      getOpenMeterUsageQueryFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          query: {
            tenant: targetTenant,
            subject: "subj-acme",
            meterSlug: "api-requests",
            window: sampleWindow,
            granularity: "HOUR",
          },
        },
      ),
    );
  });

  it("requestOpenMeterUsageBackfillFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      requestOpenMeterUsageBackfillFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          backfill: {
            tenant: targetTenant,
            subject: "subj-acme",
            meterSlug: "api-requests",
            window: sampleWindow,
            granularity: "HOUR",
            reasonCatalogId: reasonCatalogId.openMeterUsageQueryBackfill,
            reasonNarrative: "smoke test backfill",
            reasonAttachmentText: "runbook://usage/smoke",
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
        "packages/platform/src/services/apps/open-meter-usage-query-actions.ts",
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
