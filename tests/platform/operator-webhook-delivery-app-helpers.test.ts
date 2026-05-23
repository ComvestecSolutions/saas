/**
 * Operator-facing webhook delivery envelope app-helper smoke tests
 * (admin-app implementation plan §9 item 6 follow-up). Confirms the
 * seven canonical `*FromEnvironment` helpers reach the env-bound
 * boundary decoder via the shared `loadRuntimeModuleOrDie` seam and
 * that the helper source contains no `Request`/`Response` shaping or
 * per-helper `Effect.tryPromise` duplication.
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
  cancelOperatorWebhookDeliveryFromEnvironment,
  enqueueOperatorWebhookDeliveryFromEnvironment,
  getOperatorWebhookDeliveryFromEnvironment,
  listOperatorWebhookDeliveriesFromEnvironment,
  recomputeOperatorWebhookDeliverySignatureFromEnvironment,
  replayOperatorWebhookDeliveryFromEnvironment,
  retryOperatorWebhookDeliveryFromEnvironment,
} from "@comvestec/platform";

const baseRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_owd_app_helpers_test",
  sessionId: "sess_owd_app_helpers_test",
  correlationId: "corr_owd_app_helpers_test",
  reason: "operator webhook delivery app helpers smoke",
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

describe("operator-webhook-delivery app helpers", () => {
  it("exposes the seven canonical *FromEnvironment helpers as functions", () => {
    expect(typeof enqueueOperatorWebhookDeliveryFromEnvironment).toBe(
      "function",
    );
    expect(enqueueOperatorWebhookDeliveryFromEnvironment.length).toBe(2);
    expect(typeof getOperatorWebhookDeliveryFromEnvironment).toBe("function");
    expect(getOperatorWebhookDeliveryFromEnvironment.length).toBe(2);
    expect(typeof listOperatorWebhookDeliveriesFromEnvironment).toBe(
      "function",
    );
    expect(listOperatorWebhookDeliveriesFromEnvironment.length).toBe(2);
    expect(typeof replayOperatorWebhookDeliveryFromEnvironment).toBe(
      "function",
    );
    expect(replayOperatorWebhookDeliveryFromEnvironment.length).toBe(2);
    expect(typeof retryOperatorWebhookDeliveryFromEnvironment).toBe("function");
    expect(retryOperatorWebhookDeliveryFromEnvironment.length).toBe(2);
    expect(typeof cancelOperatorWebhookDeliveryFromEnvironment).toBe(
      "function",
    );
    expect(cancelOperatorWebhookDeliveryFromEnvironment.length).toBe(2);
    expect(
      typeof recomputeOperatorWebhookDeliverySignatureFromEnvironment,
    ).toBe("function");
    expect(
      recomputeOperatorWebhookDeliverySignatureFromEnvironment.length,
    ).toBe(2);
  });

  it("enqueueOperatorWebhookDeliveryFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      enqueueOperatorWebhookDeliveryFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          delivery: {
            subscriptionId: "sub_owd_smoke",
            targetTenant: {
              scope: platformScope.platform,
              scopeId: platformScope.platform,
            },
            eventType: "operator.smoke.event",
            requestUrl: "https://example.test/webhook",
            requestBody: '{"v":1}',
            correlationId: baseRequestContext.correlationId,
          },
        },
      ),
    );
  });

  it("replayOperatorWebhookDeliveryFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      replayOperatorWebhookDeliveryFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          replay: {
            id: "owd_smoke_id",
            replayReasonCatalogId:
              reasonCatalogId.operatorWebhookDeliveryReplay,
            reasonAttachmentText: "runbook://smoke",
          },
        },
      ),
    );
  });

  it("retryOperatorWebhookDeliveryFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      retryOperatorWebhookDeliveryFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          retry: {
            id: "owd_smoke_id",
            retryReasonCatalogId: reasonCatalogId.operatorWebhookDeliveryRetry,
          },
        },
      ),
    );
  });

  it("cancelOperatorWebhookDeliveryFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      cancelOperatorWebhookDeliveryFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          cancel: {
            id: "owd_smoke_id",
            cancelReasonCatalogId:
              reasonCatalogId.operatorWebhookDeliveryCancel,
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
        "packages/platform/src/services/apps/operator-webhook-delivery-actions.ts",
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
