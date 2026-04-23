import { Effect, Schema } from "effect";
import {
  billingPlanInterval,
  billingSubscriptionStatus,
  billingWebhookEventType,
  billingWebhookReceiptProcessingState,
  billingWebhookReconciliationAction,
  platformScope,
} from "@comvestec/contracts";
import {
  BillingWebhookProcessingResultSchema,
  BillingWebhookReplayPostgresRepository,
  BillingWebhookService,
  makeWebhooksApiAccessModule,
} from "@comvestec/modules";
import { platformAdapterServiceName } from "@comvestec/platform";

const validateProcessingResult = Schema.validateSync(
  BillingWebhookProcessingResultSchema,
);

const createProcessingResult = (input: {
  readonly deliveryId: string;
  readonly eventId: string;
  readonly occurredAt: string;
  readonly subscriptionId: string;
  readonly scopeId: string;
  readonly planId: string;
  readonly priceId: string;
}) =>
  validateProcessingResult({
    reconciliation: {
      action: billingWebhookReconciliationAction.activate,
      event: {
        provider: platformAdapterServiceName.polar,
        deliveryId: input.deliveryId,
        eventId: input.eventId,
        eventType: billingWebhookEventType.checkoutCompleted,
        occurredAt: input.occurredAt,
        subscriptionId: input.subscriptionId,
        tenantScope: platformScope.organization,
        tenantScopeId: input.scopeId,
        planId: input.planId,
        priceId: input.priceId,
      },
      subscription: {
        subscriptionId: input.subscriptionId,
        planId: input.planId,
        priceId: input.priceId,
        status: billingSubscriptionStatus.active,
        interval: billingPlanInterval.month,
        entitlements: [],
      },
      entitlementsActive: true,
    },
    projection: {
      webhookReceipt: {
        receiptId: `${platformAdapterServiceName.polar}:${input.deliveryId}`,
        provider: platformAdapterServiceName.polar,
        deliveryId: input.deliveryId,
        eventType: billingWebhookEventType.checkoutCompleted,
        processingState: billingWebhookReceiptProcessingState.processed,
        verifiedSignature: true,
        scope: platformScope.organization,
        scopeId: input.scopeId,
        payload: {
          eventId: input.eventId,
          subscriptionId: input.subscriptionId,
          planId: input.planId,
          priceId: input.priceId,
          occurredAt: input.occurredAt,
          action: billingWebhookReconciliationAction.activate,
          entitlementsActive: true,
        },
        receivedAt: input.occurredAt,
        processedAt: input.occurredAt,
      },
      subscription: {
        subscriptionId: input.subscriptionId,
        provider: platformAdapterServiceName.polar,
        providerSubscriptionId: input.subscriptionId,
        scope: platformScope.organization,
        scopeId: input.scopeId,
        planId: input.planId,
        priceId: input.priceId,
        status: billingSubscriptionStatus.active,
        metadata: {
          action: billingWebhookReconciliationAction.activate,
          interval: billingPlanInterval.month,
          entitlementsActive: true,
        },
      },
      paymentEvent: {
        eventId: `${platformAdapterServiceName.polar}:${input.eventId}`,
        provider: platformAdapterServiceName.polar,
        providerEventId: input.eventId,
        subscriptionId: input.subscriptionId,
        scope: platformScope.organization,
        scopeId: input.scopeId,
        eventType: billingWebhookEventType.checkoutCompleted,
        status: "succeeded",
        effectiveAt: input.occurredAt,
        payload: {
          planId: input.planId,
          priceId: input.priceId,
          action: billingWebhookReconciliationAction.activate,
        },
      },
      entitlements: [],
    },
  });

describe("webhooks api access", () => {
  it("delegates verified webhook processing to the billing webhook service", async () => {
    const occurredAt = new Date().toISOString();
    const seen: Array<{ readonly deliveryId: string }> = [];
    const result = createProcessingResult({
      deliveryId: "wh_process",
      eventId: "evt_process",
      occurredAt,
      subscriptionId: "sub_process",
      scopeId: "org_process",
      planId: "plan_starter",
      priceId: "price_starter_month",
    });
    const module = await Effect.runPromise(
      makeWebhooksApiAccessModule().pipe(
        Effect.provideService(BillingWebhookService, {
          processPolarWebhook: (input) => {
            seen.push({ deliveryId: input.deliveryId });
            return Effect.succeed(result);
          },
        }),
        Effect.provideService(BillingWebhookReplayPostgresRepository, {
          getWebhookReceipt: () =>
            Effect.die(new Error("Unexpected replay repository call.")),
        }),
      ),
    );

    const processed = await Effect.runPromise(
      module.processVerifiedProviderWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_process",
        eventId: "evt_process",
        eventType: billingWebhookEventType.checkoutCompleted,
        occurredAt,
        verifiedSignature: true,
        subscriptionId: "sub_process",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_process",
        planId: "plan_starter",
        priceId: "price_starter_month",
      }),
    );

    expect(seen).toEqual([{ deliveryId: "wh_process" }]);
    expect(processed.reconciliation.event.deliveryId).toBe("wh_process");
  });

  it("replays stored provider webhook receipts through the billing webhook service", async () => {
    const occurredAt = new Date().toISOString();
    const seen: Array<{
      readonly deliveryId: string;
      readonly eventId: string;
      readonly subscriptionId: string;
    }> = [];
    const result = createProcessingResult({
      deliveryId: "wh_replay",
      eventId: "evt_replay",
      occurredAt,
      subscriptionId: "sub_replay",
      scopeId: "org_replay",
      planId: "plan_starter",
      priceId: "price_starter_month",
    });
    const module = await Effect.runPromise(
      makeWebhooksApiAccessModule().pipe(
        Effect.provideService(BillingWebhookService, {
          processPolarWebhook: (input) => {
            seen.push({
              deliveryId: input.deliveryId,
              eventId: input.eventId,
              subscriptionId: input.subscriptionId,
            });
            return Effect.succeed(result);
          },
        }),
        Effect.provideService(BillingWebhookReplayPostgresRepository, {
          getWebhookReceipt: () =>
            Effect.succeed({
              receiptId: `${platformAdapterServiceName.polar}:wh_replay`,
              provider: platformAdapterServiceName.polar,
              deliveryId: "wh_replay",
              eventType: billingWebhookEventType.checkoutCompleted,
              processingState: billingWebhookReceiptProcessingState.processed,
              verifiedSignature: true,
              scope: platformScope.organization,
              scopeId: "org_replay",
              payload: {
                eventId: "evt_replay",
                subscriptionId: "sub_replay",
                planId: "plan_starter",
                priceId: "price_starter_month",
                occurredAt,
                action: billingWebhookReconciliationAction.activate,
                entitlementsActive: true,
              },
              receivedAt: occurredAt,
              processedAt: occurredAt,
            }),
        }),
      ),
    );

    const replayed = await Effect.runPromise(
      module.replayProviderWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_replay",
      }),
    );

    expect(seen).toEqual([
      {
        deliveryId: "wh_replay",
        eventId: "evt_replay",
        subscriptionId: "sub_replay",
      },
    ]);
    expect(replayed.reconciliation.event.eventId).toBe("evt_replay");
  });
});
