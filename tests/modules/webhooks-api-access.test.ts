import { Effect, Schema } from "effect";
import {
  billingPlanInterval,
  billingSubscriptionStatus,
  billingWebhookEventType,
  billingWebhookReceiptProcessingState,
  billingWebhookReconciliationAction,
  platformScope,
  type WebhookApiKeyRecord,
  type WebhookOutboundDeliveryRecord,
  webhookApiKeyStatus,
  webhookOutboundDeliveryStatus,
} from "@comvestec/contracts";
import {
  BillingWebhookProcessingResultSchema,
  makeWebhookApiKeyPostgresRepository,
  BillingWebhookReplayPostgresRepository,
  BillingWebhookService,
  makeWebhookSubscriptionPostgresRepository,
  makeWebhooksApiAccessModule,
  WebhookApiKeyPostgresRepository,
  WebhookOutboundDeliveryPostgresRepository,
  WebhookSubscriptionPostgresRepository,
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

const createUnexpectedWebhookOutboundDeliveryRepository = () => ({
  createWebhookOutboundDelivery: () =>
    Effect.die(
      new Error("Unexpected webhook outbound delivery repository call."),
    ),
  getWebhookOutboundDelivery: () =>
    Effect.die(
      new Error("Unexpected webhook outbound delivery repository call."),
    ),
  listWebhookOutboundDeliveries: () =>
    Effect.die(
      new Error("Unexpected webhook outbound delivery repository call."),
    ),
  updateWebhookOutboundDelivery: () =>
    Effect.die(
      new Error("Unexpected webhook outbound delivery repository call."),
    ),
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
        Effect.provideService(
          WebhookOutboundDeliveryPostgresRepository,
          createUnexpectedWebhookOutboundDeliveryRepository(),
        ),
        Effect.provideService(WebhookApiKeyPostgresRepository, {
          createWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          listWebhookApiKeys: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          rotateWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          revokeWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          restoreWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
        }),
        Effect.provideService(WebhookSubscriptionPostgresRepository, {
          createWebhookSubscription: () =>
            Effect.die(
              new Error("Unexpected webhook subscription repository call."),
            ),
          listWebhookSubscriptions: () =>
            Effect.die(
              new Error("Unexpected webhook subscription repository call."),
            ),
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
        Effect.provideService(
          WebhookOutboundDeliveryPostgresRepository,
          createUnexpectedWebhookOutboundDeliveryRepository(),
        ),
        Effect.provideService(WebhookApiKeyPostgresRepository, {
          createWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          listWebhookApiKeys: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          rotateWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          revokeWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          restoreWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
        }),
        Effect.provideService(WebhookSubscriptionPostgresRepository, {
          createWebhookSubscription: () =>
            Effect.die(
              new Error("Unexpected webhook subscription repository call."),
            ),
          listWebhookSubscriptions: () =>
            Effect.die(
              new Error("Unexpected webhook subscription repository call."),
            ),
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

  it("creates and lists webhook subscriptions through the module repository boundary", async () => {
    const subscriptions = new Map<
      string,
      { readonly scope: string; readonly scopeId: string }
    >();
    const module = await Effect.runPromise(
      makeWebhooksApiAccessModule().pipe(
        Effect.provideService(BillingWebhookService, {
          processPolarWebhook: () =>
            Effect.die(new Error("Unexpected billing webhook call.")),
        }),
        Effect.provideService(BillingWebhookReplayPostgresRepository, {
          getWebhookReceipt: () =>
            Effect.die(new Error("Unexpected replay repository call.")),
        }),
        Effect.provideService(
          WebhookOutboundDeliveryPostgresRepository,
          createUnexpectedWebhookOutboundDeliveryRepository(),
        ),
        Effect.provideService(WebhookApiKeyPostgresRepository, {
          createWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          listWebhookApiKeys: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          rotateWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          revokeWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          restoreWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
        }),
        Effect.provideService(WebhookSubscriptionPostgresRepository, {
          createWebhookSubscription: (record) => {
            subscriptions.set(record.subscriptionId, {
              scope: record.scope,
              scopeId: record.scopeId,
            });

            return Effect.succeed(record);
          },
          listWebhookSubscriptions: (request) =>
            Effect.succeed(
              [...subscriptions.entries()]
                .filter(
                  ([, record]) =>
                    record.scope === request.scope &&
                    record.scopeId === request.scopeId,
                )
                .map(([subscriptionId]) => ({
                  subscriptionId,
                  scope: platformScope.organization,
                  scopeId: "org_webhook_1",
                  url: "https://hooks.example.com/outbound",
                  events: ["billing.subscription.activated"],
                  status: "active" as const,
                  createdAt: "2026-04-27T18:00:00.000Z",
                  updatedAt: "2026-04-27T18:00:00.000Z",
                })),
            ),
        }),
      ),
    );

    const created = await Effect.runPromise(
      module.createWebhookSubscription({
        scope: platformScope.organization,
        scopeId: "org_webhook_1",
        url: "https://hooks.example.com/outbound",
        events: ["billing.subscription.activated"],
      }),
    );

    const listed = await Effect.runPromise(
      module.listWebhookSubscriptions({
        scope: platformScope.organization,
        scopeId: "org_webhook_1",
      }),
    );

    expect(created).toMatchObject({
      scope: platformScope.organization,
      scopeId: "org_webhook_1",
      url: "https://hooks.example.com/outbound",
      events: ["billing.subscription.activated"],
      status: "active",
    });
    expect(created.subscriptionId).toMatch(
      /^webhook-subscription:organization:org_webhook_1:/,
    );
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      subscriptionId: created.subscriptionId,
      scope: platformScope.organization,
      scopeId: "org_webhook_1",
    });
  });

  it("creates, reads, and compare-and-set updates webhook outbound deliveries through the module repository boundary", async () => {
    const deliveries = new Map<string, WebhookOutboundDeliveryRecord>();
    const repository = {
      createWebhookOutboundDelivery: (record: WebhookOutboundDeliveryRecord) =>
        Effect.sync(() => {
          deliveries.set(record.deliveryId, record);

          return record;
        }),
      getWebhookOutboundDelivery: ({
        deliveryId,
      }: {
        readonly deliveryId: string;
      }) => Effect.succeed(deliveries.get(deliveryId)),
      listWebhookOutboundDeliveries: () => Effect.succeed([]),
      updateWebhookOutboundDelivery: (input: {
        readonly record: WebhookOutboundDeliveryRecord;
        readonly expectedCurrentRecord: WebhookOutboundDeliveryRecord;
      }) => {
        const current = deliveries.get(input.record.deliveryId);

        if (
          current === undefined ||
          current.updatedAt !== input.expectedCurrentRecord.updatedAt
        ) {
          return Effect.fail({
            _tag: "WebhookOutboundDeliveryMutationConflictError",
            deliveryId: input.record.deliveryId,
          } as const);
        }

        return Effect.sync(() => {
          deliveries.set(input.record.deliveryId, input.record);

          return input.record;
        });
      },
    };
    const module = await Effect.runPromise(
      makeWebhooksApiAccessModule().pipe(
        Effect.provideService(BillingWebhookService, {
          processPolarWebhook: () =>
            Effect.die(new Error("Unexpected billing webhook call.")),
        }),
        Effect.provideService(BillingWebhookReplayPostgresRepository, {
          getWebhookReceipt: () =>
            Effect.die(new Error("Unexpected replay repository call.")),
        }),
        Effect.provideService(
          WebhookOutboundDeliveryPostgresRepository,
          repository,
        ),
        Effect.provideService(WebhookApiKeyPostgresRepository, {
          createWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          listWebhookApiKeys: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          rotateWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          revokeWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
          restoreWebhookApiKey: () =>
            Effect.die(
              new Error("Unexpected webhook api key repository call."),
            ),
        }),
        Effect.provideService(WebhookSubscriptionPostgresRepository, {
          createWebhookSubscription: () =>
            Effect.die(
              new Error("Unexpected webhook subscription repository call."),
            ),
          listWebhookSubscriptions: () =>
            Effect.die(
              new Error("Unexpected webhook subscription repository call."),
            ),
        }),
      ),
    );

    const created = await Effect.runPromise(
      module.createWebhookOutboundDelivery({
        scope: platformScope.organization,
        scopeId: "org_webhook_1",
        subscriptionId: "webhook-subscription:organization:org_webhook_1:1",
        eventType: "billing.subscription.activated",
        payload: '{"subscriptionId":"sub_123"}',
        maxAttempts: 3,
      }),
    );
    const loaded = await Effect.runPromise(
      module.getWebhookOutboundDelivery({
        deliveryId: created.deliveryId,
      }),
    );
    const updated = await Effect.runPromise(
      module.updateWebhookOutboundDelivery({
        record: {
          ...created,
          status: webhookOutboundDeliveryStatus.delivered,
          attemptCount: 1,
          deliveredAt: "2026-05-07T10:05:00.000Z",
          updatedAt: "2026-05-07T10:05:00.000Z",
        },
        expectedCurrentRecord: created,
      }),
    );
    const conflict = await Effect.runPromise(
      Effect.either(
        module.updateWebhookOutboundDelivery({
          record: {
            ...created,
            status: webhookOutboundDeliveryStatus.blocked,
            attemptCount: 2,
            exhaustedAt: "2026-05-07T10:06:00.000Z",
            lastError: "stale update",
            updatedAt: "2026-05-07T10:06:00.000Z",
          },
          expectedCurrentRecord: created,
        }),
      ),
    );

    expect(created.deliveryId).toMatch(
      /^webhook-outbound-delivery:organization:org_webhook_1:/,
    );
    expect(created).toMatchObject({
      scope: platformScope.organization,
      scopeId: "org_webhook_1",
      subscriptionId: "webhook-subscription:organization:org_webhook_1:1",
      status: webhookOutboundDeliveryStatus.pending,
      attemptCount: 0,
      maxAttempts: 3,
    });
    expect(created.nextAttemptAt).toEqual(expect.any(String));
    expect(loaded.deliveryId).toBe(created.deliveryId);
    expect(updated).toMatchObject({
      deliveryId: created.deliveryId,
      status: webhookOutboundDeliveryStatus.delivered,
      attemptCount: 1,
      deliveredAt: "2026-05-07T10:05:00.000Z",
    });
    expect(conflict).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhookOutboundDeliveryMutationConflictError",
        deliveryId: created.deliveryId,
      },
    });
  });

  it("creates, lists, rotates, and revokes webhook api keys through the module repository boundary", async () => {
    const apiKeys = new Map<string, WebhookApiKeyRecord>();
    const module = await Effect.runPromise(
      makeWebhooksApiAccessModule().pipe(
        Effect.provideService(BillingWebhookService, {
          processPolarWebhook: () =>
            Effect.die(new Error("Unexpected billing webhook call.")),
        }),
        Effect.provideService(BillingWebhookReplayPostgresRepository, {
          getWebhookReceipt: () =>
            Effect.die(new Error("Unexpected replay repository call.")),
        }),
        Effect.provideService(
          WebhookOutboundDeliveryPostgresRepository,
          createUnexpectedWebhookOutboundDeliveryRepository(),
        ),
        Effect.provideService(WebhookApiKeyPostgresRepository, {
          createWebhookApiKey: (record) => {
            apiKeys.set(record.apiKeyId, record);

            return Effect.succeed(record);
          },
          listWebhookApiKeys: (request) =>
            Effect.succeed(
              [...apiKeys.values()].filter(
                (record) =>
                  record.scope === request.scope &&
                  record.scopeId === request.scopeId,
              ),
            ),
          rotateWebhookApiKey: (input) => {
            const current = apiKeys.get(input.apiKeyId);

            if (current === undefined) {
              return Effect.die(
                new Error("Expected webhook api key to exist."),
              );
            }

            const rotated = {
              ...current,
              secretHash: input.secretHash,
              prefix: input.prefix,
              rotatedAt: input.rotatedAt,
              updatedAt: input.updatedAt,
            };

            apiKeys.set(input.apiKeyId, rotated);

            return Effect.succeed({
              previousRecord: current,
              record: rotated,
            });
          },
          revokeWebhookApiKey: (input) => {
            const current = apiKeys.get(input.apiKeyId);

            if (current === undefined) {
              return Effect.die(
                new Error("Expected webhook api key to exist."),
              );
            }

            const revoked = {
              ...current,
              status: webhookApiKeyStatus.revoked,
              revokedAt: input.revokedAt,
              updatedAt: input.updatedAt,
            };

            apiKeys.set(input.apiKeyId, revoked);

            return Effect.succeed(revoked);
          },
          restoreWebhookApiKey: (input) => {
            apiKeys.set(input.record.apiKeyId, input.record);

            return Effect.succeed(input.record);
          },
        }),
        Effect.provideService(WebhookSubscriptionPostgresRepository, {
          createWebhookSubscription: () =>
            Effect.die(
              new Error("Unexpected webhook subscription repository call."),
            ),
          listWebhookSubscriptions: () =>
            Effect.die(
              new Error("Unexpected webhook subscription repository call."),
            ),
        }),
      ),
    );

    const created = await Effect.runPromise(
      module.createWebhookApiKey({
        scope: platformScope.organization,
        scopeId: "org_webhook_1",
        label: "Partner export",
      }),
    );
    const listed = await Effect.runPromise(
      module.listWebhookApiKeys({
        scope: platformScope.organization,
        scopeId: "org_webhook_1",
      }),
    );
    const rotated = await Effect.runPromise(
      module.rotateWebhookApiKey({
        scope: platformScope.organization,
        scopeId: "org_webhook_1",
        apiKeyId: created.record.apiKeyId,
      }),
    );
    const revoked = await Effect.runPromise(
      module.revokeWebhookApiKey({
        scope: platformScope.organization,
        scopeId: "org_webhook_1",
        apiKeyId: created.record.apiKeyId,
      }),
    );

    expect(created.record.apiKeyId).toMatch(
      /^webhook-api-key:organization:org_webhook_1:/,
    );
    expect(created.secret).toMatch(/^wkai_/);
    expect(created.record.secretHash).not.toBe(created.secret);
    expect(created.record.prefix).toBe(created.secret.slice(0, 18));
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      apiKeyId: created.record.apiKeyId,
      scope: platformScope.organization,
      scopeId: "org_webhook_1",
      label: "Partner export",
      status: webhookApiKeyStatus.active,
    });
    expect(rotated.record.apiKeyId).toBe(created.record.apiKeyId);
    expect(rotated.previousRecord.secretHash).toBe(created.record.secretHash);
    expect(rotated.secret).toMatch(/^wkai_/);
    expect(rotated.secret).not.toBe(created.secret);
    expect(rotated.record.rotatedAt).toBeDefined();
    expect(revoked).toMatchObject({
      apiKeyId: created.record.apiKeyId,
      status: webhookApiKeyStatus.revoked,
    });
    expect(revoked.revokedAt).toBeDefined();
  });

  it("surfaces duplicate webhook subscriptions as conflicts", async () => {
    const repository = await Effect.runPromise(
      makeWebhookSubscriptionPostgresRepository({
        createWebhookSubscription: async () => {
          throw { code: "23505" };
        },
        listWebhookSubscriptionsByScope: async () => [],
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        repository.createWebhookSubscription({
          subscriptionId: "webhook-subscription:organization:org_webhook_1:1",
          scope: platformScope.organization,
          scopeId: "org_webhook_1",
          url: "https://hooks.example.com/outbound",
          events: ["billing.subscription.activated"],
          status: "active",
          createdAt: "2026-04-27T18:00:00.000Z",
          updatedAt: "2026-04-27T18:00:00.000Z",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhookSubscriptionAlreadyExistsError",
        scope: platformScope.organization,
        scopeId: "org_webhook_1",
        url: "https://hooks.example.com/outbound",
      },
    });
  });

  it("surfaces revoked webhook api keys during rotation", async () => {
    const repository = await Effect.runPromise(
      makeWebhookApiKeyPostgresRepository({
        createWebhookApiKey: async () => {
          throw new Error("Unexpected create call.");
        },
        listWebhookApiKeysByScope: async () => [],
        getWebhookApiKey: async () => ({
          apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
          scope: platformScope.organization,
          scopeId: "org_webhook_1",
          label: "Partner export",
          secretHash: "hash_revoked",
          prefix: "wkai_revoked_pref",
          status: webhookApiKeyStatus.revoked,
          createdAt: new Date("2026-05-06T00:00:00.000Z"),
          updatedAt: new Date("2026-05-06T00:00:00.000Z"),
          rotatedAt: null,
          revokedAt: new Date("2026-05-06T01:00:00.000Z"),
        }),
        rotateWebhookApiKey: async () => undefined,
        revokeWebhookApiKey: async () => undefined,
        restoreWebhookApiKey: async () => undefined,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        repository.rotateWebhookApiKey({
          scope: platformScope.organization,
          scopeId: "org_webhook_1",
          apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
          secretHash: "hash_rotated",
          prefix: "wkai_rotated_pref",
          rotatedAt: "2026-05-06T02:00:00.000Z",
          updatedAt: "2026-05-06T02:00:00.000Z",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhookApiKeyRevokedError",
        scope: platformScope.organization,
        scopeId: "org_webhook_1",
        apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
      },
    });
  });

  it("surfaces concurrent webhook api key mutation conflicts during rotation", async () => {
    let lookupCount = 0;
    const repository = await Effect.runPromise(
      makeWebhookApiKeyPostgresRepository({
        createWebhookApiKey: async () => {
          throw new Error("Unexpected create call.");
        },
        listWebhookApiKeysByScope: async () => [],
        getWebhookApiKey: async () => {
          lookupCount += 1;

          return {
            apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
            scope: platformScope.organization,
            scopeId: "org_webhook_1",
            label: "Partner export",
            secretHash: lookupCount === 1 ? "hash_created" : "hash_concurrent",
            prefix:
              lookupCount === 1 ? "wkai_created_pref" : "wkai_concurrent_pref",
            status: webhookApiKeyStatus.active,
            createdAt: new Date("2026-05-06T00:00:00.000Z"),
            updatedAt: new Date(
              lookupCount === 1
                ? "2026-05-06T00:00:00.000Z"
                : "2026-05-06T00:05:00.000Z",
            ),
            rotatedAt:
              lookupCount === 1 ? null : new Date("2026-05-06T00:05:00.000Z"),
            revokedAt: null,
          };
        },
        rotateWebhookApiKey: async () => undefined,
        revokeWebhookApiKey: async () => undefined,
        restoreWebhookApiKey: async () => undefined,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        repository.rotateWebhookApiKey({
          scope: platformScope.organization,
          scopeId: "org_webhook_1",
          apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
          secretHash: "hash_rotated",
          prefix: "wkai_rotated_pref",
          rotatedAt: "2026-05-06T02:00:00.000Z",
          updatedAt: "2026-05-06T02:00:00.000Z",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhookApiKeyMutationConflictError",
        scope: platformScope.organization,
        scopeId: "org_webhook_1",
        apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
      },
    });
  });

  it("does not overwrite a later webhook api key revocation during restore", async () => {
    const repository = await Effect.runPromise(
      makeWebhookApiKeyPostgresRepository({
        createWebhookApiKey: async () => {
          throw new Error("Unexpected create call.");
        },
        listWebhookApiKeysByScope: async () => [],
        getWebhookApiKey: async () => ({
          apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
          scope: platformScope.organization,
          scopeId: "org_webhook_1",
          label: "Partner export",
          secretHash: "hash_rotated",
          prefix: "wkai_rotated_pref",
          status: webhookApiKeyStatus.revoked,
          createdAt: new Date("2026-05-06T00:00:00.000Z"),
          updatedAt: new Date("2026-05-06T00:10:00.000Z"),
          rotatedAt: new Date("2026-05-06T00:05:00.000Z"),
          revokedAt: new Date("2026-05-06T00:10:00.000Z"),
        }),
        rotateWebhookApiKey: async () => undefined,
        revokeWebhookApiKey: async () => undefined,
        restoreWebhookApiKey: async () => undefined,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        repository.restoreWebhookApiKey({
          record: {
            apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
            scope: platformScope.organization,
            scopeId: "org_webhook_1",
            label: "Partner export",
            secretHash: "hash_created",
            prefix: "wkai_created_pref",
            status: webhookApiKeyStatus.active,
            createdAt: "2026-05-06T00:00:00.000Z",
            updatedAt: "2026-05-06T00:00:00.000Z",
          },
          expectedCurrentRecord: {
            apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
            scope: platformScope.organization,
            scopeId: "org_webhook_1",
            label: "Partner export",
            secretHash: "hash_rotated",
            prefix: "wkai_rotated_pref",
            status: webhookApiKeyStatus.active,
            createdAt: "2026-05-06T00:00:00.000Z",
            updatedAt: "2026-05-06T00:05:00.000Z",
            rotatedAt: "2026-05-06T00:05:00.000Z",
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhookApiKeyRevokedError",
        scope: platformScope.organization,
        scopeId: "org_webhook_1",
        apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
      },
    });
  });

  it("does not revoke a later webhook api key rotation during expected-state revocation", async () => {
    const seen: {
      readonly revokeInputs: Array<{
        readonly expectedUpdatedAt: Date;
        readonly expectedStatus: (typeof webhookApiKeyStatus)[keyof typeof webhookApiKeyStatus];
        readonly expectedSecretHash: string;
        readonly expectedPrefix: string;
        readonly expectedRotatedAt: Date | null;
        readonly expectedRevokedAt: Date | null;
      }>;
    } = {
      revokeInputs: [],
    };
    const repository = await Effect.runPromise(
      makeWebhookApiKeyPostgresRepository({
        createWebhookApiKey: async () => {
          throw new Error("Unexpected create call.");
        },
        listWebhookApiKeysByScope: async () => [],
        getWebhookApiKey: async () => ({
          apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
          scope: platformScope.organization,
          scopeId: "org_webhook_1",
          label: "Partner export",
          secretHash: "hash_rotated",
          prefix: "wkai_rotated_pref",
          status: webhookApiKeyStatus.active,
          createdAt: new Date("2026-05-06T00:00:00.000Z"),
          updatedAt: new Date("2026-05-06T00:00:00.000Z"),
          rotatedAt: new Date("2026-05-06T00:00:00.000Z"),
          revokedAt: null,
        }),
        rotateWebhookApiKey: async () => undefined,
        revokeWebhookApiKey: async (input) => {
          seen.revokeInputs.push({
            expectedUpdatedAt: input.expectedUpdatedAt,
            expectedStatus: input.expectedStatus,
            expectedSecretHash: input.expectedSecretHash,
            expectedPrefix: input.expectedPrefix,
            expectedRotatedAt: input.expectedRotatedAt,
            expectedRevokedAt: input.expectedRevokedAt,
          });

          return undefined;
        },
        restoreWebhookApiKey: async () => undefined,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        repository.revokeWebhookApiKey({
          scope: platformScope.organization,
          scopeId: "org_webhook_1",
          apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
          revokedAt: "2026-05-06T00:06:00.000Z",
          updatedAt: "2026-05-06T00:06:00.000Z",
          expectedCurrentRecord: {
            apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
            scope: platformScope.organization,
            scopeId: "org_webhook_1",
            label: "Partner export",
            secretHash: "hash_created",
            prefix: "wkai_created_pref",
            status: webhookApiKeyStatus.active,
            createdAt: "2026-05-06T00:00:00.000Z",
            updatedAt: "2026-05-06T00:00:00.000Z",
          },
        }),
      ),
    );

    expect(seen.revokeInputs).toEqual([
      {
        expectedUpdatedAt: new Date("2026-05-06T00:00:00.000Z"),
        expectedStatus: webhookApiKeyStatus.active,
        expectedSecretHash: "hash_created",
        expectedPrefix: "wkai_created_pref",
        expectedRotatedAt: null,
        expectedRevokedAt: null,
      },
    ]);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhookApiKeyMutationConflictError",
        scope: platformScope.organization,
        scopeId: "org_webhook_1",
        apiKeyId: "webhook-api-key:organization:org_webhook_1:1",
      },
    });
  });
});
