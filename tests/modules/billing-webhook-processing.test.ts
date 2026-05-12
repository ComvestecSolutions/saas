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
  billingCustomerAccountLinkageSource,
  type BillingCustomerAccountRecord,
  type BillingCustomerAccountResolverApi,
  BillingCustomerAccountResolver,
  BillingMeteringModule,
  BillingWebhookPostgresRepository,
  billingCustomerAccountsTable,
  billingEntitlementsTable,
  billingPaymentEventsTable,
  billingSubscriptionsTable,
  type BillingWebhookPostgresDatabase,
  type PostgresInsertBuilder,
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
import { createPolarTestOptions } from "../platform-adapter-doubles";

const tenantManagementModuleAccessKey = tenantManagementFeatureFlag.enabled;

const createBillingWebhookTestDatabase = () => {
  type PersistedTable = Parameters<BillingWebhookPostgresDatabase["insert"]>[0];
  type PersistedValues = Parameters<
    PostgresInsertBuilder<PersistedTable>["values"]
  >[0];
  const receipts = new Map<string, typeof webhookReceiptsTable.$inferInsert>();
  const customerAccounts = new Map<
    string,
    typeof billingCustomerAccountsTable.$inferInsert
  >();
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

  const mergeCustomerAccountOnConflict = (
    incoming: typeof billingCustomerAccountsTable.$inferInsert,
  ) => {
    const customerAccountKey = [
      incoming.provider,
      incoming.providerCustomerId,
    ].join(":");
    const existing = customerAccounts.get(customerAccountKey);

    customerAccounts.set(
      customerAccountKey,
      existing === undefined
        ? incoming
        : {
            ...incoming,
            actorId: existing.actorId,
            scope: existing.scope,
            scopeId: existing.scopeId,
            email: incoming.email ?? existing.email,
            metadata: existing.metadata,
          },
    );
  };

  const persistRows = (table: PersistedTable, values: PersistedValues) => {
    const rows = Array.isArray(values) ? values : [values];

    for (const row of rows) {
      if (table === webhookReceiptsTable) {
        const receipt = row as typeof webhookReceiptsTable.$inferInsert;
        receipts.set(`${receipt.provider}:${receipt.deliveryId}`, receipt);
        continue;
      }

      if (table === billingCustomerAccountsTable) {
        const customerAccount =
          row as typeof billingCustomerAccountsTable.$inferInsert;
        mergeCustomerAccountOnConflict(customerAccount);
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
    insert: (table: PersistedTable) => ({
      values: (values: PersistedValues) => ({
        execute: async () => {
          persistRows(table, values);
        },
        onConflictDoUpdate: () => ({
          execute: async () => {
            persistRows(table, values);
          },
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: async () => [],
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
    customerAccounts,
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
      makePolarAdapter(createPolarTestOptions()),
    );
    const customerAccountResolver = {
      resolveCustomerAccount: (input) =>
        Effect.succeed({
          accountId: [platformAdapterServiceName.polar, input.customerId].join(
            ":",
          ),
          provider: platformAdapterServiceName.polar,
          providerCustomerId: input.customerId,
          actorId: "usr_owner_1",
          scope: input.scope,
          scopeId: input.scopeId,
          status: input.subscriptionStatus,
          metadata: {
            linkageSource:
              billingCustomerAccountLinkageSource.tenantProvisioning,
            subscriptionId: input.subscriptionId,
            action: input.action,
          },
        } satisfies BillingCustomerAccountRecord),
    } satisfies BillingCustomerAccountResolverApi;
    const billingWebhookService = await Effect.runPromise(
      makeBillingWebhookService().pipe(
        Effect.provideService(PolarAdapter, polar),
        Effect.provideService(BillingMeteringModule, billingMetering),
        Effect.provideService(
          BillingCustomerAccountResolver,
          customerAccountResolver,
        ),
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
    expect(database.customerAccounts.get("polar:cus_1")).toMatchObject({
      actorId: "usr_owner_1",
      scope: platformScope.organization,
      scopeId: "org_1",
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
    const database = createBillingWebhookTestDatabase();
    const occurredAt = new Date().toISOString();
    const repository = await Effect.runPromise(
      makeBillingWebhookPostgresRepository(database.database),
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
            occurredAt,
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
        customerAccount: {
          accountId: "polar:cus_2",
          provider: platformAdapterServiceName.polar,
          providerCustomerId: "cus_2",
          actorId: "usr_owner_2",
          scope: platformScope.organization,
          scopeId: "org_2",
          status: billingSubscriptionStatus.pastDue,
          metadata: {
            linkageSource:
              billingCustomerAccountLinkageSource.identitySessionAudit,
            subscriptionId: "sub_projection",
            action: billingWebhookReconciliationAction.flagPastDue,
          },
        },
      }),
    );

    expect(projection.subscription.status).toBe(
      billingSubscriptionStatus.pastDue,
    );
    expect(projection.paymentEvent.status).toBe(
      billingPaymentEventStatus.failed,
    );
    expect(database.customerAccounts.get("polar:cus_2")).toMatchObject({
      actorId: "usr_owner_2",
      status: billingSubscriptionStatus.pastDue,
    });
  });

  it("does not persist a customer-account link when owner evidence is absent", async () => {
    const occurredAt = new Date().toISOString();
    const database = createBillingWebhookTestDatabase();
    const billingMetering = await Effect.runPromise(
      makeBillingMeteringModule(),
    );
    const repository = await Effect.runPromise(
      makeBillingWebhookPostgresRepository(database.database),
    );
    const polar = await Effect.runPromise(
      makePolarAdapter(createPolarTestOptions()),
    );
    const customerAccountResolver = {
      resolveCustomerAccount: () =>
        Effect.succeed<BillingCustomerAccountRecord | undefined>(undefined),
    } satisfies BillingCustomerAccountResolverApi;
    const billingWebhookService = await Effect.runPromise(
      makeBillingWebhookService().pipe(
        Effect.provideService(PolarAdapter, polar),
        Effect.provideService(BillingMeteringModule, billingMetering),
        Effect.provideService(
          BillingCustomerAccountResolver,
          customerAccountResolver,
        ),
        Effect.provideService(BillingWebhookPostgresRepository, repository),
      ),
    );

    const result = await Effect.runPromise(
      billingWebhookService.processPolarWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_no_owner",
        eventId: "evt_no_owner",
        eventType: billingWebhookEventType.checkoutCompleted,
        occurredAt,
        verifiedSignature: true,
        subscriptionId: "sub_no_owner",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_no_owner",
        planId: "plan_starter",
        priceId: "price_starter_month",
        customerId: "cus_no_owner",
        currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );

    expect(result.projection.customerAccount).toBeUndefined();
    expect(database.customerAccounts.size).toBe(0);
    expect(database.subscriptions.get("polar:sub_no_owner")).toMatchObject({
      accountId: "polar:cus_no_owner",
      scope: platformScope.organization,
      scopeId: "org_no_owner",
    });
  });

  it("preserves the first durable owner linkage for an existing provider customer", async () => {
    const database = createBillingWebhookTestDatabase();
    const occurredAt = new Date().toISOString();
    const repository = await Effect.runPromise(
      makeBillingWebhookPostgresRepository(database.database),
    );

    await Effect.runPromise(
      repository.persistWebhookProjection({
        webhookReceipt: {
          receiptId: "polar:wh_link_initial",
          provider: platformAdapterServiceName.polar,
          deliveryId: "wh_link_initial",
          eventType: billingWebhookEventType.checkoutCompleted,
          processingState: billingWebhookReceiptProcessingState.processed,
          verifiedSignature: true,
          scope: platformScope.organization,
          scopeId: "org_linked",
          payload: {
            eventId: "evt_link_initial",
            subscriptionId: "sub_linked",
            planId: "plan_starter",
            priceId: "price_starter_month",
            occurredAt,
            action: billingWebhookReconciliationAction.activate,
            entitlementsActive: true,
            customerId: "cus_linked",
          },
          receivedAt: occurredAt,
          processedAt: occurredAt,
        },
        subscription: {
          subscriptionId: "sub_linked",
          provider: platformAdapterServiceName.polar,
          providerSubscriptionId: "sub_linked",
          scope: platformScope.organization,
          scopeId: "org_linked",
          planId: "plan_starter",
          priceId: "price_starter_month",
          status: billingSubscriptionStatus.active,
          currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
          metadata: {
            action: billingWebhookReconciliationAction.activate,
            interval: billingPlanInterval.month,
            entitlementsActive: true,
            customerId: "cus_linked",
          },
        },
        paymentEvent: {
          eventId: "polar:evt_link_initial",
          provider: platformAdapterServiceName.polar,
          providerEventId: "evt_link_initial",
          subscriptionId: "sub_linked",
          scope: platformScope.organization,
          scopeId: "org_linked",
          eventType: billingWebhookEventType.checkoutCompleted,
          status: billingPaymentEventStatus.succeeded,
          effectiveAt: occurredAt,
          payload: {
            planId: "plan_starter",
            priceId: "price_starter_month",
            action: billingWebhookReconciliationAction.activate,
            customerId: "cus_linked",
          },
        },
        entitlements: [],
        customerAccount: {
          accountId: "polar:cus_linked",
          provider: platformAdapterServiceName.polar,
          providerCustomerId: "cus_linked",
          actorId: "usr_owner_original",
          scope: platformScope.organization,
          scopeId: "org_linked",
          status: billingSubscriptionStatus.active,
          metadata: {
            linkageSource:
              billingCustomerAccountLinkageSource.tenantProvisioning,
            subscriptionId: "sub_linked",
            action: billingWebhookReconciliationAction.activate,
          },
        },
      }),
    );

    await Effect.runPromise(
      repository.persistWebhookProjection({
        webhookReceipt: {
          receiptId: "polar:wh_link_followup",
          provider: platformAdapterServiceName.polar,
          deliveryId: "wh_link_followup",
          eventType: billingWebhookEventType.paymentFailed,
          processingState: billingWebhookReceiptProcessingState.processed,
          verifiedSignature: true,
          scope: platformScope.organization,
          scopeId: "org_linked",
          payload: {
            eventId: "evt_link_followup",
            subscriptionId: "sub_linked",
            planId: "plan_starter",
            priceId: "price_starter_month",
            occurredAt,
            action: billingWebhookReconciliationAction.flagPastDue,
            entitlementsActive: false,
            customerId: "cus_linked",
          },
          receivedAt: occurredAt,
          processedAt: occurredAt,
        },
        subscription: {
          subscriptionId: "sub_linked",
          provider: platformAdapterServiceName.polar,
          providerSubscriptionId: "sub_linked",
          scope: platformScope.organization,
          scopeId: "org_linked",
          planId: "plan_starter",
          priceId: "price_starter_month",
          status: billingSubscriptionStatus.pastDue,
          currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
          metadata: {
            action: billingWebhookReconciliationAction.flagPastDue,
            interval: billingPlanInterval.month,
            entitlementsActive: false,
            customerId: "cus_linked",
          },
        },
        paymentEvent: {
          eventId: "polar:evt_link_followup",
          provider: platformAdapterServiceName.polar,
          providerEventId: "evt_link_followup",
          subscriptionId: "sub_linked",
          scope: platformScope.organization,
          scopeId: "org_linked",
          eventType: billingWebhookEventType.paymentFailed,
          status: billingPaymentEventStatus.failed,
          effectiveAt: occurredAt,
          payload: {
            planId: "plan_starter",
            priceId: "price_starter_month",
            action: billingWebhookReconciliationAction.flagPastDue,
            customerId: "cus_linked",
          },
        },
        entitlements: [],
        customerAccount: {
          accountId: "polar:cus_linked",
          provider: platformAdapterServiceName.polar,
          providerCustomerId: "cus_linked",
          actorId: "usr_owner_rebound",
          scope: platformScope.organization,
          scopeId: "org_linked",
          status: billingSubscriptionStatus.pastDue,
          metadata: {
            linkageSource:
              billingCustomerAccountLinkageSource.identitySessionAudit,
            subscriptionId: "sub_linked",
            action: billingWebhookReconciliationAction.flagPastDue,
          },
        },
      }),
    );

    expect(database.customerAccounts.get("polar:cus_linked")).toMatchObject({
      actorId: "usr_owner_original",
      status: billingSubscriptionStatus.pastDue,
      metadata: {
        linkageSource: billingCustomerAccountLinkageSource.tenantProvisioning,
        subscriptionId: "sub_linked",
        action: billingWebhookReconciliationAction.activate,
      },
    });
  });
});
