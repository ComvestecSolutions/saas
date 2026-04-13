import { Effect } from "effect";
import {
  billingAndMeteringFeatureFlag,
  billingEnforcementMode,
  billingMeteringMode,
  billingPaymentEventStatus,
  billingPlanInterval,
  billingSubscriptionStatus,
  billingWebhookReceiptProcessingState,
  billingWebhookEventType,
  billingWebhookReconciliationAction,
  platformModuleId,
  platformScope,
  tenantManagementFeatureFlag,
  usageQuotaPeriod,
} from "@comvestec/contracts";
import {
  BillingMeteringModule,
  BillingWebhookPostgresRepository,
  billingEntitlementsTable,
  billingPaymentEventsTable,
  billingSubscriptionsTable,
  type BillingWebhookPostgresDatabase,
  makeBillingMeteringModule,
  makeBillingWebhookPostgresRepository,
  makeBillingWebhookService,
  webhookReceiptsTable,
} from "@comvestec/modules";
import {
  makePolarAdapter,
  platformAdapterServiceName,
  PolarAdapter,
} from "@comvestec/platform";

const tenantManagementModuleAccessKey = tenantManagementFeatureFlag.enabled;

const createBillingWebhookTestDatabase = () => {
  const receipts = new Map<string, typeof webhookReceiptsTable.$inferInsert>();
  const subscriptions = new Map<
    string,
    typeof billingSubscriptionsTable.$inferInsert
  >();
  const paymentEvents = new Map<
    string,
    typeof billingPaymentEventsTable.$inferInsert
  >();
  const entitlements = new Map<
    string,
    typeof billingEntitlementsTable.$inferInsert
  >();

  const persistRows = (table: unknown, values: unknown) => {
    const rows = Array.isArray(values) ? values : [values];

    for (const row of rows) {
      if (table === webhookReceiptsTable) {
        const receipt = row as typeof webhookReceiptsTable.$inferInsert;
        receipts.set(`${receipt.provider}:${receipt.deliveryId}`, receipt);
        continue;
      }

      if (table === billingSubscriptionsTable) {
        const subscription =
          row as typeof billingSubscriptionsTable.$inferInsert;
        subscriptions.set(
          `${subscription.provider}:${subscription.providerSubscriptionId}`,
          subscription,
        );
        continue;
      }

      if (table === billingPaymentEventsTable) {
        const paymentEvent =
          row as typeof billingPaymentEventsTable.$inferInsert;
        paymentEvents.set(
          `${paymentEvent.provider}:${paymentEvent.providerEventId}`,
          paymentEvent,
        );
        continue;
      }

      if (table === billingEntitlementsTable) {
        const entitlement = row as typeof billingEntitlementsTable.$inferInsert;
        entitlements.set(
          [
            entitlement.moduleId,
            entitlement.featureKey,
            entitlement.scope,
            entitlement.scopeId,
          ].join(":"),
          entitlement,
        );
      }
    }
  };

  const transaction = {
    insert: (table: unknown) => ({
      values: (values: unknown) => ({
        onConflictDoUpdate: () => ({
          execute: async () => {
            persistRows(table, values);
          },
        }),
      }),
    }),
  };

  const database: BillingWebhookPostgresDatabase = {
    ...transaction,
    transaction: async (callback) => callback(transaction),
  };

  return {
    database,
    receipts,
    subscriptions,
    paymentEvents,
    entitlements,
  };
};

describe("billing webhook processing", () => {
  it("reconciles polar webhooks and persists durable billing state", async () => {
    const occurredAt = new Date().toISOString();
    const database = createBillingWebhookTestDatabase();
    const billingMetering = await Effect.runPromise(
      makeBillingMeteringModule(),
    );
    const repository = await Effect.runPromise(
      makeBillingWebhookPostgresRepository(database.database),
    );
    const polar = await Effect.runPromise(
      makePolarAdapter({
        apiKey: "polar-key",
        apiUrl: "http://localhost:8888",
      }),
    );
    const billingWebhookService = await Effect.runPromise(
      makeBillingWebhookService().pipe(
        Effect.provideService(PolarAdapter, polar),
        Effect.provideService(BillingMeteringModule, billingMetering),
        Effect.provideService(BillingWebhookPostgresRepository, repository),
      ),
    );

    const result = await Effect.runPromise(
      billingWebhookService.processPolarWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_1",
        eventId: "evt_1",
        eventType: billingWebhookEventType.checkoutCompleted,
        occurredAt,
        verifiedSignature: true,
        subscriptionId: "sub_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        planId: "plan_starter",
        priceId: "price_starter_month",
        customerId: "cus_1",
        currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );

    expect(result.reconciliation.action).toBe(
      billingWebhookReconciliationAction.activate,
    );
    expect(result.projection.webhookReceipt.processingState).toBe(
      billingWebhookReceiptProcessingState.processed,
    );
    expect(result.projection.paymentEvent.status).toBe(
      billingPaymentEventStatus.succeeded,
    );
    expect(database.receipts.get("polar:wh_1")).toMatchObject({
      eventType: billingWebhookEventType.checkoutCompleted,
      verifiedSignature: true,
    });
    expect(database.subscriptions.get("polar:sub_1")).toMatchObject({
      planId: "plan_starter",
      status: billingSubscriptionStatus.active,
    });
    expect(database.paymentEvents.get("polar:evt_1")).toMatchObject({
      status: billingPaymentEventStatus.succeeded,
    });
    expect(
      database.entitlements.get(
        [
          platformModuleId.tenantManagement,
          tenantManagementModuleAccessKey,
          platformScope.organization,
          "org_1",
        ].join(":"),
      ),
    ).toMatchObject({
      active: true,
      featureKey: tenantManagementModuleAccessKey,
    });
    expect(
      database.entitlements.get(
        [
          platformModuleId.billingAndMetering,
          billingAndMeteringFeatureFlag.apiRequests,
          platformScope.organization,
          "org_1",
        ].join(":"),
      ),
    ).toMatchObject({
      active: true,
      featureKey: billingAndMeteringFeatureFlag.apiRequests,
      quotaSnapshot: {
        meteringMode: billingMeteringMode.rateLimit,
        meterKey: billingAndMeteringFeatureFlag.apiRequests,
        quotaLimit: 60,
        quotaPeriod: usageQuotaPeriod.minute,
        enforcementMode: billingEnforcementMode.rateLimit,
      },
    });
  });

  it("upserts durable billing rows from normalized webhook projections", async () => {
    const occurredAt = new Date().toISOString();
    const repository = await Effect.runPromise(
      makeBillingWebhookPostgresRepository(
        createBillingWebhookTestDatabase().database,
      ),
    );

    const projection = await Effect.runPromise(
      repository.persistWebhookProjection({
        webhookReceipt: {
          receiptId: "polar:wh_projection",
          provider: platformAdapterServiceName.polar,
          deliveryId: "wh_projection",
          eventType: billingWebhookEventType.paymentFailed,
          processingState: billingWebhookReceiptProcessingState.processed,
          verifiedSignature: true,
          scope: platformScope.organization,
          scopeId: "org_2",
          payload: {
            eventId: "evt_projection",
            subscriptionId: "sub_projection",
            planId: "plan_starter",
            priceId: "price_starter_year",
            action: billingWebhookReconciliationAction.flagPastDue,
            entitlementsActive: false,
            customerId: "cus_2",
          },
          receivedAt: occurredAt,
          processedAt: occurredAt,
        },
        subscription: {
          subscriptionId: "sub_projection",
          provider: platformAdapterServiceName.polar,
          providerSubscriptionId: "sub_projection",
          scope: platformScope.organization,
          scopeId: "org_2",
          planId: "plan_starter",
          priceId: "price_starter_year",
          status: billingSubscriptionStatus.pastDue,
          currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
          metadata: {
            action: billingWebhookReconciliationAction.flagPastDue,
            interval: billingPlanInterval.year,
            entitlementsActive: false,
            customerId: "cus_2",
          },
        },
        paymentEvent: {
          eventId: "polar:evt_projection",
          provider: platformAdapterServiceName.polar,
          providerEventId: "evt_projection",
          subscriptionId: "sub_projection",
          scope: platformScope.organization,
          scopeId: "org_2",
          eventType: billingWebhookEventType.paymentFailed,
          status: billingPaymentEventStatus.failed,
          effectiveAt: occurredAt,
          payload: {
            planId: "plan_starter",
            priceId: "price_starter_year",
            action: billingWebhookReconciliationAction.flagPastDue,
            customerId: "cus_2",
          },
        },
        entitlements: [
          {
            entitlementId: [
              platformScope.organization,
              "org_2",
              "plan_starter",
              platformModuleId.billingAndMetering,
              billingAndMeteringFeatureFlag.apiRequests,
            ].join(":"),
            moduleId: platformModuleId.billingAndMetering,
            featureKey: billingAndMeteringFeatureFlag.apiRequests,
            scope: platformScope.organization,
            scopeId: "org_2",
            active: false,
            quotaSnapshot: {
              meteringMode: billingMeteringMode.rateLimit,
              meterKey: billingAndMeteringFeatureFlag.apiRequests,
              unit: "request",
              quotaLimit: 60,
              quotaPeriod: usageQuotaPeriod.minute,
              enforcementMode: billingEnforcementMode.rateLimit,
            },
            grantedAt: occurredAt,
            expiresAt: occurredAt,
          },
        ],
      }),
    );

    expect(projection.subscription.status).toBe(
      billingSubscriptionStatus.pastDue,
    );
    expect(projection.paymentEvent.status).toBe(
      billingPaymentEventStatus.failed,
    );
  });
});
