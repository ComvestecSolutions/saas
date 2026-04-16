import { Effect } from "effect";
import {
  actorType,
  billingAndMeteringFeatureFlag,
  billingEnforcementMode,
  billingMeteringMode,
  billingPlanInterval,
  billingPlanVisibility,
  billingWebhookEventType,
  platformModuleId,
  platformScope,
  usageQuotaPeriod,
} from "@comvestec/contracts";
import {
  BillingMeteringModule,
  BillingStatePostgresRepository,
  BillingWebhookReplayPostgresRepository,
  BillingWebhookPostgresRepository,
  BillingWebhookService,
  billingEntitlementsTable,
  billingPaymentEventsTable,
  billingSubscriptionsTable,
  identitySessionAuditTable,
  IdentitySessionModule,
  IdentitySessionPostgresRepository,
  makeBillingMeteringModule,
  makeBillingWebhookReplayPostgresRepository,
  makeBillingStatePostgresRepository,
  makeBillingWebhookPostgresRepository,
  makeBillingWebhookService,
  makeIdentitySessionModule,
  makeIdentitySessionPostgresRepository,
  makeTenantManagementModule,
  makeTenantOnboardingPostgresRepository,
  makeTenantProvisioningPostgresRepository,
  TenantManagementModule,
  TenantOnboardingPostgresRepository,
  TenantProvisioningPostgresRepository,
  tenantProvisioningReceiptsTable,
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
  webhookReceiptsTable,
  type BillingStatePostgresQueryable,
  type BillingWebhookReplayPostgresQueryable,
  type PostgresDatabase,
  type PostgresInsertBuilder,
} from "@comvestec/modules";
import {
  KeycloakAdapter,
  makeKeycloakAdapter,
  makeOryKetoAdapter,
  makePolarAdapter,
  makeSubscriberJourneyService,
  OryKetoAdapter,
  PolarAdapter,
  platformAdapterServiceName,
  makeValkeyAdapter,
  ValkeyAdapter,
} from "@comvestec/platform";
import {
  createKeycloakTestOptions,
  createOryKetoTestOptions,
  createPolarTestOptions,
  createValkeyTestClient,
} from "../platform-adapter-doubles";

const createSubscriberJourneyTestDatabase = () => {
  type PersistedTable = Parameters<PostgresDatabase["insert"]>[0];
  type PersistedValues = Parameters<
    PostgresInsertBuilder<PersistedTable>["values"]
  >[0];
  type BillingEntitlementSelectRow =
    typeof billingEntitlementsTable.$inferSelect;
  type BillingSubscriptionSelectRow =
    typeof billingSubscriptionsTable.$inferSelect;

  const identitySessionEvents = new Map<
    string,
    typeof identitySessionAuditTable.$inferInsert
  >();
  const onboardingRuns = new Map<
    string,
    typeof tenantOnboardingRunsTable.$inferInsert
  >();
  const onboardingSteps = new Map<
    string,
    typeof tenantOnboardingStepsTable.$inferInsert
  >();
  const provisioningReceipts = new Map<
    string,
    typeof tenantProvisioningReceiptsTable.$inferInsert
  >();
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

  const persistRows = (table: PersistedTable, values: PersistedValues) => {
    const rows = Array.isArray(values) ? values : [values];

    for (const row of rows) {
      if (table === identitySessionAuditTable) {
        const event = row as typeof identitySessionAuditTable.$inferInsert;
        identitySessionEvents.set(event.eventId, event);
        continue;
      }

      if (table === tenantOnboardingRunsTable) {
        const run = row as typeof tenantOnboardingRunsTable.$inferInsert;
        onboardingRuns.set(run.runId, run);
        continue;
      }

      if (table === tenantOnboardingStepsTable) {
        const step = row as typeof tenantOnboardingStepsTable.$inferInsert;
        onboardingSteps.set(`${step.runId}:${step.stepId}`, step);
        continue;
      }

      if (table === tenantProvisioningReceiptsTable) {
        const receipt =
          row as typeof tenantProvisioningReceiptsTable.$inferInsert;
        provisioningReceipts.set(receipt.provisioningId, receipt);
        continue;
      }

      if (table === webhookReceiptsTable) {
        const receipt = row as typeof webhookReceiptsTable.$inferInsert;
        receipts.set(`${receipt.provider}:${receipt.deliveryId}`, receipt);
        continue;
      }

      if (table === billingSubscriptionsTable) {
        const subscription =
          row as typeof billingSubscriptionsTable.$inferInsert;
        subscriptions.set(
          `${subscription.scope}:${subscription.scopeId}`,
          subscription,
        );
        continue;
      }

      if (table === billingPaymentEventsTable) {
        const paymentEvent =
          row as typeof billingPaymentEventsTable.$inferInsert;
        paymentEvents.set(paymentEvent.eventId, paymentEvent);
        continue;
      }

      if (table === billingEntitlementsTable) {
        const entitlement = row as typeof billingEntitlementsTable.$inferInsert;
        entitlements.set(
          [
            entitlement.scope,
            entitlement.scopeId,
            entitlement.moduleId,
            entitlement.featureKey,
          ].join(":"),
          entitlement,
        );
      }
    }
  };

  const transaction = {
    insert: (table: PersistedTable) => ({
      values: (values: PersistedValues) => ({
        onConflictDoUpdate: () => ({
          execute: async () => {
            persistRows(table, values);
          },
        }),
      }),
    }),
  };

  const writeDatabase: PostgresDatabase = {
    ...transaction,
    transaction: async (callback) => callback(transaction),
  };

  const toBillingEntitlementSelectRow = (
    row: typeof billingEntitlementsTable.$inferInsert,
  ): BillingEntitlementSelectRow => ({
    entitlementId: row.entitlementId,
    moduleId: row.moduleId,
    featureKey: row.featureKey,
    scope: row.scope,
    scopeId: row.scopeId,
    active: row.active ?? true,
    quotaSnapshot: row.quotaSnapshot ?? null,
    grantedAt: row.grantedAt ?? new Date(),
    expiresAt: row.expiresAt ?? null,
  });

  const toBillingSubscriptionSelectRow = (
    row: typeof billingSubscriptionsTable.$inferInsert,
  ): BillingSubscriptionSelectRow => ({
    subscriptionId: row.subscriptionId,
    provider: row.provider,
    providerSubscriptionId: row.providerSubscriptionId,
    accountId: row.accountId,
    scope: row.scope,
    scopeId: row.scopeId,
    planId: row.planId,
    priceId: row.priceId ?? null,
    status: row.status,
    checkoutSessionId: row.checkoutSessionId ?? null,
    currentPeriodStart: row.currentPeriodStart ?? null,
    currentPeriodEnd: row.currentPeriodEnd ?? null,
    cancelAt: row.cancelAt ?? null,
    canceledAt: row.canceledAt ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  });

  const readDatabase: BillingStatePostgresQueryable = {
    listEntitlementsByScope: async (scope, scopeId) =>
      [...entitlements.values()]
        .filter((row) => row.scope === scope && row.scopeId === scopeId)
        .map(toBillingEntitlementSelectRow),
    getLatestSubscriptionByScope: async (scope, scopeId) =>
      (() => {
        const subscription = [...subscriptions.values()].find(
          (row) => row.scope === scope && row.scopeId === scopeId,
        );

        return subscription === undefined
          ? undefined
          : toBillingSubscriptionSelectRow(subscription);
      })(),
  };
  const replayDatabase: BillingWebhookReplayPostgresQueryable = {
    getWebhookReceiptByProviderAndDeliveryId: async (provider, deliveryId) => {
      const receipt = receipts.get(`${provider}:${deliveryId}`);

      return receipt === undefined
        ? undefined
        : {
            receiptId: receipt.receiptId,
            provider: receipt.provider,
            deliveryId: receipt.deliveryId,
            eventType: receipt.eventType,
            processingState: receipt.processingState ?? "pending",
            verifiedSignature: receipt.verifiedSignature ?? false,
            scope: receipt.scope ?? null,
            scopeId: receipt.scopeId ?? null,
            payload: receipt.payload ?? {},
            receivedAt: receipt.receivedAt ?? new Date(),
            processedAt: receipt.processedAt ?? null,
          };
    },
  };

  return {
    writeDatabase,
    readDatabase,
    replayDatabase,
    identitySessionEvents,
    onboardingRuns,
    onboardingSteps,
    provisioningReceipts,
    receipts,
    subscriptions,
    paymentEvents,
    entitlements,
  };
};

const createSubscriberJourneyHarness = async () => {
  const database = createSubscriberJourneyTestDatabase();
  const keycloak = await Effect.runPromise(
    makeKeycloakAdapter(createKeycloakTestOptions()),
  );
  const valkey = await Effect.runPromise(
    makeValkeyAdapter({
      url: "redis://localhost:6379",
      client: createValkeyTestClient(),
    }),
  );
  const oryKeto = await Effect.runPromise(
    makeOryKetoAdapter(createOryKetoTestOptions()),
  );
  const polar = await Effect.runPromise(
    makePolarAdapter(createPolarTestOptions()),
  );
  const tenantManagement = await Effect.runPromise(
    makeTenantManagementModule(),
  );
  const billingMetering = await Effect.runPromise(makeBillingMeteringModule());
  const identityRepository = await Effect.runPromise(
    makeIdentitySessionPostgresRepository(database.writeDatabase),
  );
  const onboardingRepository = await Effect.runPromise(
    makeTenantOnboardingPostgresRepository(database.writeDatabase),
  );
  const provisioningRepository = await Effect.runPromise(
    makeTenantProvisioningPostgresRepository(database.writeDatabase),
  );
  const billingWebhookRepository = await Effect.runPromise(
    makeBillingWebhookPostgresRepository(database.writeDatabase),
  );
  const billingStateRepository = await Effect.runPromise(
    makeBillingStatePostgresRepository(database.readDatabase),
  );
  const billingWebhookReplayRepository = await Effect.runPromise(
    makeBillingWebhookReplayPostgresRepository(database.replayDatabase),
  );
  const identitySession = await Effect.runPromise(
    makeIdentitySessionModule().pipe(
      Effect.provideService(KeycloakAdapter, keycloak),
      Effect.provideService(OryKetoAdapter, oryKeto),
      Effect.provideService(ValkeyAdapter, valkey),
      Effect.provideService(TenantManagementModule, tenantManagement),
      Effect.provideService(
        IdentitySessionPostgresRepository,
        identityRepository,
      ),
      Effect.provideService(
        TenantProvisioningPostgresRepository,
        provisioningRepository,
      ),
      Effect.provideService(
        TenantOnboardingPostgresRepository,
        onboardingRepository,
      ),
    ),
  );
  const billingWebhookService = await Effect.runPromise(
    makeBillingWebhookService().pipe(
      Effect.provideService(PolarAdapter, polar),
      Effect.provideService(BillingMeteringModule, billingMetering),
      Effect.provideService(
        BillingWebhookPostgresRepository,
        billingWebhookRepository,
      ),
    ),
  );
  const subscriberJourney = await Effect.runPromise(
    makeSubscriberJourneyService().pipe(
      Effect.provideService(OryKetoAdapter, oryKeto),
      Effect.provideService(PolarAdapter, polar),
      Effect.provideService(IdentitySessionModule, identitySession),
      Effect.provideService(BillingWebhookService, billingWebhookService),
      Effect.provideService(
        BillingWebhookReplayPostgresRepository,
        billingWebhookReplayRepository,
      ),
      Effect.provideService(
        BillingStatePostgresRepository,
        billingStateRepository,
      ),
    ),
  );

  return {
    database,
    subscriberJourney,
    valkey,
  };
};

describe("platform subscriber journey", () => {
  it("runs the backend-ready subscriber slice from auth start to product bootstrap", async () => {
    const database = createSubscriberJourneyTestDatabase();
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter(createKeycloakTestOptions()),
    );
    const valkey = await Effect.runPromise(
      makeValkeyAdapter({
        url: "redis://localhost:6379",
        client: createValkeyTestClient(),
      }),
    );
    const oryKeto = await Effect.runPromise(
      makeOryKetoAdapter(createOryKetoTestOptions()),
    );
    const polar = await Effect.runPromise(
      makePolarAdapter(createPolarTestOptions()),
    );
    const tenantManagement = await Effect.runPromise(
      makeTenantManagementModule(),
    );
    const billingMetering = await Effect.runPromise(
      makeBillingMeteringModule(),
    );
    const identityRepository = await Effect.runPromise(
      makeIdentitySessionPostgresRepository(database.writeDatabase),
    );
    const onboardingRepository = await Effect.runPromise(
      makeTenantOnboardingPostgresRepository(database.writeDatabase),
    );
    const provisioningRepository = await Effect.runPromise(
      makeTenantProvisioningPostgresRepository(database.writeDatabase),
    );
    const billingWebhookRepository = await Effect.runPromise(
      makeBillingWebhookPostgresRepository(database.writeDatabase),
    );
    const billingStateRepository = await Effect.runPromise(
      makeBillingStatePostgresRepository(database.readDatabase),
    );
    const billingWebhookReplayRepository = await Effect.runPromise(
      makeBillingWebhookReplayPostgresRepository(database.replayDatabase),
    );
    const identitySession = await Effect.runPromise(
      makeIdentitySessionModule().pipe(
        Effect.provideService(KeycloakAdapter, keycloak),
        Effect.provideService(OryKetoAdapter, oryKeto),
        Effect.provideService(ValkeyAdapter, valkey),
        Effect.provideService(TenantManagementModule, tenantManagement),
        Effect.provideService(
          IdentitySessionPostgresRepository,
          identityRepository,
        ),
        Effect.provideService(
          TenantProvisioningPostgresRepository,
          provisioningRepository,
        ),
        Effect.provideService(
          TenantOnboardingPostgresRepository,
          onboardingRepository,
        ),
      ),
    );
    const billingWebhookService = await Effect.runPromise(
      makeBillingWebhookService().pipe(
        Effect.provideService(PolarAdapter, polar),
        Effect.provideService(BillingMeteringModule, billingMetering),
        Effect.provideService(
          BillingWebhookPostgresRepository,
          billingWebhookRepository,
        ),
      ),
    );
    const subscriberJourney = await Effect.runPromise(
      makeSubscriberJourneyService().pipe(
        Effect.provideService(OryKetoAdapter, oryKeto),
        Effect.provideService(PolarAdapter, polar),
        Effect.provideService(IdentitySessionModule, identitySession),
        Effect.provideService(BillingWebhookService, billingWebhookService),
        Effect.provideService(
          BillingWebhookReplayPostgresRepository,
          billingWebhookReplayRepository,
        ),
        Effect.provideService(
          BillingStatePostgresRepository,
          billingStateRepository,
        ),
      ),
    );

    const plans = await Effect.runPromise(subscriberJourney.listPublicPlans);
    const authStart = await Effect.runPromise(
      subscriberJourney.startAuthentication({
        requestContext: {
          actorType: "anonymous",
          correlationId: "corr_journey",
          host: "product.example.com",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        tenantHint: "org_1",
        returnHost: "product.example.com",
      }),
    );
    const authCompletion = await Effect.runPromise(
      subscriberJourney.completeAuthentication({
        session: {
          authenticated: true,
          sessionId: "sess_journey",
          actorId: "usr_owner_1",
          realm: "comvestec",
          tenantHint: "org_1",
        },
        correlationId: "corr_journey",
        host: "product.example.com",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          enterpriseId: "ent_1",
          organizationId: "org_1",
          individualId: "usr_owner_1",
        },
        enabledModules: [
          platformModuleId.tenantManagement,
          platformModuleId.identitySession,
          platformModuleId.billingAndMetering,
        ],
      }),
    );
    const checkout = await Effect.runPromise(
      subscriberJourney.createCheckoutSession({
        planId: plans[0]?.planId ?? "plan_starter",
        priceId: plans[0]?.prices[0]?.priceId ?? "price_starter_month",
        successUrl: "http://localhost:3002/billing/success",
        cancelUrl: "http://localhost:3002/billing/cancel",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
      }),
    );
    const webhook = await Effect.runPromise(
      subscriberJourney.processBillingWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_journey",
        eventId: "evt_journey",
        eventType: billingWebhookEventType.checkoutCompleted,
        occurredAt: new Date().toISOString(),
        verifiedSignature: true,
        subscriptionId: "sub_journey",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        planId: checkout.planId,
        priceId: checkout.priceId,
        customerId: "cus_journey",
        currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );
    const bootstrap = await Effect.runPromise(
      subscriberJourney.buildProductBootstrap({
        sessionId: authCompletion.session.sessionId,
      }),
    );
    const replay = await Effect.runPromise(
      subscriberJourney.replayBillingWebhook({
        provider: platformAdapterServiceName.polar,
        deliveryId: "wh_journey",
      }),
    );

    expect(plans.length).toBeGreaterThan(0);
    expect(authStart.redirect.tenantHint).toBe("org_1");
    expect(authCompletion.requestContext.actorId).toBe("usr_owner_1");
    expect(authCompletion.provisioning.status).toBe("provisioned");
    expect(webhook.reconciliation.event.subscriptionId).toBe("sub_journey");
    expect(
      database.provisioningReceipts.get(
        ["tenant-provisioning", platformScope.organization, "org_1"].join(":"),
      ),
    ).toMatchObject({
      ownerActorId: "usr_owner_1",
      status: "provisioned",
    });
    expect(
      database.receipts.get(
        [platformAdapterServiceName.polar, "wh_journey"].join(":"),
      ),
    ).toMatchObject({
      payload: expect.objectContaining({
        occurredAt: expect.any(String),
      }),
      verifiedSignature: true,
    });
    expect(replay.reconciliation.event.deliveryId).toBe("wh_journey");
    expect(database.subscriptions.get("organization:org_1")).toMatchObject({
      planId: checkout.planId,
      status: "active",
    });
    expect(bootstrap.requestContext.sessionId).toBe("sess_journey");
    expect(bootstrap.snapshot.application).toBe("Product app");
    expect(bootstrap.authorization.allowed).toBe(true);
    expect(bootstrap.billingStatus).toMatchObject({
      plan: checkout.planId,
      status: "active",
      usage: [
        {
          featureKey: billingAndMeteringFeatureFlag.apiRequests,
          quotaSnapshot: {
            meteringMode: billingMeteringMode.rateLimit,
            meterKey: billingAndMeteringFeatureFlag.apiRequests,
            unit: "request",
            quotaLimit: 60,
            quotaPeriod: usageQuotaPeriod.minute,
            enforcementMode: billingEnforcementMode.rateLimit,
          },
        },
      ],
    });
    expect(bootstrap.entitlements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.tenantManagement,
        }),
      ]),
    );
  });

  it("allows platform operators to create managed billing plans", async () => {
    const { subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_admin_plan_create",
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_admin_plan_create",
          correlationId: "corr_admin_plan_create",
          reason: "Create managed recurring plan",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
      }),
    );

    const result = await Effect.runPromise(
      subscriberJourney.createManagedBillingPlan({
        sessionId: "sess_admin_plan_create",
        plan: {
          planKey: "scale",
          displayName: "Scale",
          description: "Operator-created recurring plan.",
          visibility: billingPlanVisibility.draft,
          price: {
            interval: billingPlanInterval.month,
            currency: "USD",
            amountMinor: 4900,
          },
          entitlements: [
            {
              moduleId: platformModuleId.tenantManagement,
              included: true,
              meteringMode: billingMeteringMode.none,
              enforcementMode: billingEnforcementMode.none,
            },
          ],
        },
      }),
    );

    expect(result).toMatchObject({
      plan: expect.objectContaining({
        planKey: "scale",
        displayName: "Scale",
      }),
      visibility: billingPlanVisibility.draft,
      provider: platformAdapterServiceName.polar,
    });
  });

  it("denies non-platform sessions from creating managed billing plans", async () => {
    const { subscriberJourney, valkey } =
      await createSubscriberJourneyHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_org_member_plan_create",
        requestContext: {
          actorType: actorType.organizationMember,
          actorId: "usr_member_1",
          sessionId: "sess_org_member_plan_create",
          correlationId: "corr_org_member_plan_create",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
            enterpriseId: "ent_1",
            organizationId: "org_1",
            individualId: "usr_member_1",
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          subscriberJourney.createManagedBillingPlan({
            sessionId: "sess_org_member_plan_create",
            plan: {
              planKey: "scale",
              displayName: "Scale",
              visibility: billingPlanVisibility.draft,
              price: {
                interval: billingPlanInterval.month,
                currency: "USD",
                amountMinor: 4900,
              },
              entitlements: [
                {
                  moduleId: platformModuleId.tenantManagement,
                  included: true,
                  meteringMode: billingMeteringMode.none,
                  enforcementMode: billingEnforcementMode.none,
                },
              ],
            },
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ManagedBillingPlanAccessDeniedError",
    });
  });
});
