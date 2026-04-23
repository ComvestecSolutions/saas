import { Effect, Schema } from "effect";
import {
  billingWebhookEventType,
  billingWebhookReconciliationAction,
  billingSubscriptionStatus,
  platformScope,
} from "@comvestec/contracts";
import { BillingWebhookProcessingResultSchema } from "@comvestec/modules";
import {
  createWebhooksApiHttpHandler,
  platformAdapterServiceName,
  type SubscriberJourneyService,
  webhooksApiPath,
} from "@comvestec/platform";

type WebhooksApiService = Pick<
  SubscriberJourneyService,
  "processBillingWebhook" | "replayBillingWebhook"
>;

const unexpectedWebhooksApiServiceEffect = <A>() =>
  Effect.die(new Error("Unexpected webhook API test service call."));

const defaultProcessBillingWebhook: WebhooksApiService["processBillingWebhook"] =
  () => unexpectedWebhooksApiServiceEffect();

const defaultReplayBillingWebhook: WebhooksApiService["replayBillingWebhook"] =
  () => unexpectedWebhooksApiServiceEffect();

const createWebhooksApiServiceDouble = (
  overrides: Partial<WebhooksApiService>,
): WebhooksApiService => ({
  processBillingWebhook:
    overrides.processBillingWebhook ?? defaultProcessBillingWebhook,
  replayBillingWebhook:
    overrides.replayBillingWebhook ?? defaultReplayBillingWebhook,
});

const createTestHandler = (
  service: Partial<WebhooksApiService>,
  options?: Parameters<typeof createWebhooksApiHttpHandler>[1],
) =>
  createWebhooksApiHttpHandler(
    (use) => use(createWebhooksApiServiceDouble(service)),
    options,
  );

describe("platform webhooks api http", () => {
  it("processes verified polar webhook requests through the dedicated HTTP surface", async () => {
    const processBillingWebhook: WebhooksApiService["processBillingWebhook"] = (
      input,
    ) =>
      Schema.decodeUnknown(BillingWebhookProcessingResultSchema)({
        reconciliation: {
          action: billingWebhookReconciliationAction.activate,
          event: {
            provider: input.provider,
            deliveryId: input.deliveryId,
            eventId: input.eventId,
            eventType: input.eventType,
            occurredAt: input.occurredAt,
            subscriptionId: input.subscriptionId,
            tenantScope: input.tenantScope,
            tenantScopeId: input.tenantScopeId,
            planId: input.planId,
            priceId: input.priceId,
            ...(input.customerId !== undefined
              ? { customerId: input.customerId }
              : {}),
          },
          subscription: {
            subscriptionId: input.subscriptionId,
            planId: input.planId,
            priceId: input.priceId,
            status: billingSubscriptionStatus.active,
            interval: "month",
            entitlements: [],
          },
          entitlementsActive: true,
        },
        projection: {
          webhookReceipt: {
            receiptId: `${input.provider}:${input.deliveryId}`,
            provider: platformAdapterServiceName.polar,
            deliveryId: input.deliveryId,
            eventType: input.eventType,
            processingState: "processed",
            verifiedSignature: true,
            scope: input.tenantScope,
            scopeId: input.tenantScopeId,
            payload: {
              eventId: input.eventId,
              subscriptionId: input.subscriptionId,
              planId: input.planId,
              priceId: input.priceId,
              occurredAt: input.occurredAt,
              action: billingWebhookReconciliationAction.activate,
              entitlementsActive: true,
              ...(input.customerId !== undefined
                ? { customerId: input.customerId }
                : {}),
            },
            receivedAt: input.occurredAt,
            processedAt: input.occurredAt,
          },
          subscription: {
            subscriptionId: input.subscriptionId,
            provider: platformAdapterServiceName.polar,
            providerSubscriptionId: input.subscriptionId,
            scope: input.tenantScope,
            scopeId: input.tenantScopeId,
            planId: input.planId,
            priceId: input.priceId,
            status: billingSubscriptionStatus.active,
            metadata: {
              action: billingWebhookReconciliationAction.activate,
              interval: "month",
              entitlementsActive: true,
              ...(input.customerId !== undefined
                ? { customerId: input.customerId }
                : {}),
            },
          },
          paymentEvent: {
            eventId: `${input.provider}:${input.eventId}`,
            provider: platformAdapterServiceName.polar,
            providerEventId: input.eventId,
            subscriptionId: input.subscriptionId,
            scope: input.tenantScope,
            scopeId: input.tenantScopeId,
            eventType: input.eventType,
            status: "succeeded",
            effectiveAt: input.occurredAt,
            payload: {
              planId: input.planId,
              priceId: input.priceId,
              action: billingWebhookReconciliationAction.activate,
              ...(input.customerId !== undefined
                ? { customerId: input.customerId }
                : {}),
            },
          },
          entitlements: [],
        },
      });

    const handler = createTestHandler(
      {
        processBillingWebhook,
      },
      {
        parsePolarWebhookRequest: () =>
          Effect.succeed({
            provider: platformAdapterServiceName.polar,
            deliveryId: "wh_http_1",
            eventId: "evt_http_1",
            eventType: billingWebhookEventType.checkoutCompleted,
            occurredAt: new Date().toISOString(),
            verifiedSignature: true,
            subscriptionId: "sub_http_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_http_1",
            planId: "plan_starter",
            priceId: "price_starter_month",
            customerId: "cus_http_1",
          }),
      },
    );

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${webhooksApiPath.processPolarWebhook}`, {
          method: "POST",
          body: JSON.stringify({ type: "order.paid" }),
        }),
      ),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        reconciliation: expect.objectContaining({
          action: billingWebhookReconciliationAction.activate,
        }),
      }),
    );
  });

  it("replays stored webhook receipts through the dedicated HTTP surface", async () => {
    const replayBillingWebhook: WebhooksApiService["replayBillingWebhook"] = (
      input,
    ) =>
      Schema.decodeUnknown(BillingWebhookProcessingResultSchema)({
        reconciliation: {
          action: billingWebhookReconciliationAction.activate,
          event: {
            provider: input.provider,
            deliveryId: input.deliveryId,
            eventId: "evt_replay_http_1",
            eventType: billingWebhookEventType.checkoutCompleted,
            occurredAt: new Date().toISOString(),
            subscriptionId: "sub_replay_http_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_replay_http_1",
            planId: "plan_starter",
            priceId: "price_starter_month",
          },
          subscription: {
            subscriptionId: "sub_replay_http_1",
            planId: "plan_starter",
            priceId: "price_starter_month",
            status: billingSubscriptionStatus.active,
            interval: "month",
            entitlements: [],
          },
          entitlementsActive: true,
        },
        projection: {
          webhookReceipt: {
            receiptId: `${input.provider}:${input.deliveryId}`,
            provider: platformAdapterServiceName.polar,
            deliveryId: input.deliveryId,
            eventType: billingWebhookEventType.checkoutCompleted,
            processingState: "processed",
            verifiedSignature: true,
            scope: platformScope.organization,
            scopeId: "org_replay_http_1",
            payload: {
              eventId: "evt_replay_http_1",
              subscriptionId: "sub_replay_http_1",
              planId: "plan_starter",
              priceId: "price_starter_month",
              occurredAt: new Date().toISOString(),
              action: billingWebhookReconciliationAction.activate,
              entitlementsActive: true,
            },
            receivedAt: new Date().toISOString(),
            processedAt: new Date().toISOString(),
          },
          subscription: {
            subscriptionId: "sub_replay_http_1",
            provider: platformAdapterServiceName.polar,
            providerSubscriptionId: "sub_replay_http_1",
            scope: platformScope.organization,
            scopeId: "org_replay_http_1",
            planId: "plan_starter",
            priceId: "price_starter_month",
            status: billingSubscriptionStatus.active,
            metadata: {
              action: billingWebhookReconciliationAction.activate,
              interval: "month",
              entitlementsActive: true,
            },
          },
          paymentEvent: {
            eventId: `${input.provider}:evt_replay_http_1`,
            provider: platformAdapterServiceName.polar,
            providerEventId: "evt_replay_http_1",
            subscriptionId: "sub_replay_http_1",
            scope: platformScope.organization,
            scopeId: "org_replay_http_1",
            eventType: billingWebhookEventType.checkoutCompleted,
            status: "succeeded",
            effectiveAt: new Date().toISOString(),
            payload: {
              planId: "plan_starter",
              priceId: "price_starter_month",
              action: billingWebhookReconciliationAction.activate,
            },
          },
          entitlements: [],
        },
      });

    const handler = createTestHandler({
      replayBillingWebhook,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${webhooksApiPath.replayPolarWebhook}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ deliveryId: "wh_replay_http_1" }),
        }),
      ),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        reconciliation: expect.objectContaining({
          event: expect.objectContaining({
            deliveryId: "wh_replay_http_1",
          }),
        }),
      }),
    );
  });

  it("returns 401 when raw polar webhook verification fails", async () => {
    const handler = createTestHandler(
      {},
      {
        parsePolarWebhookRequest: () =>
          Effect.fail({
            _tag: "PolarWebhookSignatureError",
            deliveryId: "wh_http_bad",
          }),
      },
    );

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${webhooksApiPath.processPolarWebhook}`, {
          method: "POST",
          body: JSON.stringify({ type: "order.paid" }),
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication or signature validation failed.",
    });
  });
});
