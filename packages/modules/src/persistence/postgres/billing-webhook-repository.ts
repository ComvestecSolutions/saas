import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { billingSubscriptionStatus } from "@comvestec/contracts";
import {
  type BillingWebhookPersistenceProjection,
  BillingWebhookPersistenceProjectionSchema,
} from "../../domains/billing-metering";
import {
  billingEntitlementsTable,
  billingPaymentEventsTable,
  billingSubscriptionsTable,
  webhookReceiptsTable,
} from "./billing";

type BillingWebhookPostgresConflictTarget = unknown | readonly unknown[];

type BillingWebhookPostgresInsertCommand = {
  readonly execute: () => Promise<unknown>;
};

type BillingWebhookPostgresValuesBuilder = {
  readonly onConflictDoUpdate: (options: {
    readonly target: BillingWebhookPostgresConflictTarget;
    readonly set: Record<string, unknown>;
  }) => BillingWebhookPostgresInsertCommand;
};

type BillingWebhookPostgresInsertBuilder = {
  readonly values: (values: unknown) => BillingWebhookPostgresValuesBuilder;
};

export type BillingWebhookPostgresTransaction = {
  readonly insert: (table: unknown) => BillingWebhookPostgresInsertBuilder;
};

export type BillingWebhookPostgresDatabase =
  BillingWebhookPostgresTransaction & {
    readonly transaction: <T>(
      callback: (tx: BillingWebhookPostgresTransaction) => Promise<T>,
    ) => Promise<T>;
  };

export type BillingWebhookPostgresUpsertSet = {
  readonly webhookReceipt: typeof webhookReceiptsTable.$inferInsert;
  readonly subscription: typeof billingSubscriptionsTable.$inferInsert;
  readonly paymentEvent: typeof billingPaymentEventsTable.$inferInsert;
  readonly entitlements: ReadonlyArray<
    typeof billingEntitlementsTable.$inferInsert
  >;
};

export type BillingWebhookPostgresRepositoryPersistenceError = {
  readonly _tag: "BillingWebhookPostgresRepositoryPersistenceError";
  readonly operation: "persistWebhookProjection";
  readonly cause: unknown;
};

export type BillingWebhookPostgresRepositoryError =
  | ParseResult.ParseError
  | BillingWebhookPostgresRepositoryPersistenceError;

const parseTimestamp = (value: string | undefined) =>
  value === undefined ? undefined : new Date(value);

const resolveCustomerAccountId = (
  projection: BillingWebhookPersistenceProjection,
) => {
  const customerId = projection.subscription.metadata.customerId;

  return customerId !== undefined
    ? [projection.subscription.provider, customerId].join(":")
    : [
        projection.subscription.provider,
        projection.subscription.scope,
        projection.subscription.scopeId,
      ].join(":");
};

export const buildBillingWebhookPostgresUpsertSet = (input: unknown) =>
  Schema.decodeUnknown(BillingWebhookPersistenceProjectionSchema)(input).pipe(
    Effect.map(
      (projection): BillingWebhookPostgresUpsertSet => ({
        webhookReceipt: {
          receiptId: projection.webhookReceipt.receiptId,
          provider: projection.webhookReceipt.provider,
          deliveryId: projection.webhookReceipt.deliveryId,
          eventType: projection.webhookReceipt.eventType,
          processingState: projection.webhookReceipt.processingState,
          verifiedSignature: projection.webhookReceipt.verifiedSignature,
          scope: projection.webhookReceipt.scope,
          scopeId: projection.webhookReceipt.scopeId,
          payload: projection.webhookReceipt.payload,
          receivedAt: parseTimestamp(projection.webhookReceipt.receivedAt),
          processedAt: parseTimestamp(projection.webhookReceipt.processedAt),
        },
        subscription: {
          subscriptionId: projection.subscription.subscriptionId,
          provider: projection.subscription.provider,
          providerSubscriptionId:
            projection.subscription.providerSubscriptionId,
          accountId: resolveCustomerAccountId(projection),
          scope: projection.subscription.scope,
          scopeId: projection.subscription.scopeId,
          planId: projection.subscription.planId,
          priceId: projection.subscription.priceId,
          status: projection.subscription.status,
          ...(projection.subscription.currentPeriodEnd !== undefined
            ? {
                currentPeriodEnd: parseTimestamp(
                  projection.subscription.currentPeriodEnd,
                ),
              }
            : {}),
          ...(projection.subscription.cancelAt !== undefined
            ? { cancelAt: parseTimestamp(projection.subscription.cancelAt) }
            : {}),
          ...(projection.subscription.status ===
          billingSubscriptionStatus.canceled
            ? {
                canceledAt: parseTimestamp(
                  projection.webhookReceipt.processedAt,
                ),
              }
            : {}),
          metadata: projection.subscription.metadata,
          updatedAt: parseTimestamp(projection.webhookReceipt.processedAt),
        },
        paymentEvent: {
          eventId: projection.paymentEvent.eventId,
          provider: projection.paymentEvent.provider,
          providerEventId: projection.paymentEvent.providerEventId,
          subscriptionId: projection.paymentEvent.subscriptionId,
          scope: projection.paymentEvent.scope,
          scopeId: projection.paymentEvent.scopeId,
          eventType: projection.paymentEvent.eventType,
          status: projection.paymentEvent.status,
          effectiveAt: parseTimestamp(projection.paymentEvent.effectiveAt),
          payload: projection.paymentEvent.payload,
          recordedAt: parseTimestamp(projection.webhookReceipt.processedAt),
        },
        entitlements: projection.entitlements.map((entitlement) => ({
          entitlementId: entitlement.entitlementId,
          moduleId: entitlement.moduleId,
          featureKey: entitlement.featureKey,
          scope: entitlement.scope,
          scopeId: entitlement.scopeId,
          active: entitlement.active,
          ...(entitlement.quotaSnapshot !== undefined
            ? { quotaSnapshot: entitlement.quotaSnapshot }
            : {}),
          grantedAt: parseTimestamp(entitlement.grantedAt),
          ...(entitlement.expiresAt !== undefined
            ? { expiresAt: parseTimestamp(entitlement.expiresAt) }
            : {}),
        })),
      }),
    ),
  );

export type BillingWebhookPostgresRepositoryService = {
  readonly persistWebhookProjection: (
    input: unknown,
  ) => Effect.Effect<
    BillingWebhookPersistenceProjection,
    BillingWebhookPostgresRepositoryError
  >;
};

export class BillingWebhookPostgresRepository extends Context.Tag(
  "BillingWebhookPostgresRepository",
)<
  BillingWebhookPostgresRepository,
  BillingWebhookPostgresRepositoryService
>() {}

export const makeBillingWebhookPostgresRepository = (
  database: BillingWebhookPostgresDatabase,
) =>
  Effect.succeed<BillingWebhookPostgresRepositoryService>({
    persistWebhookProjection: (input: unknown) =>
      Schema.decodeUnknown(BillingWebhookPersistenceProjectionSchema)(
        input,
      ).pipe(
        Effect.flatMap((projection) =>
          buildBillingWebhookPostgresUpsertSet(projection).pipe(
            Effect.flatMap((upsertSet) =>
              Effect.tryPromise({
                try: () =>
                  database.transaction(async (tx) => {
                    await tx
                      .insert(webhookReceiptsTable)
                      .values(upsertSet.webhookReceipt)
                      .onConflictDoUpdate({
                        target: [
                          webhookReceiptsTable.provider,
                          webhookReceiptsTable.deliveryId,
                        ],
                        set: {
                          eventType: upsertSet.webhookReceipt.eventType,
                          processingState:
                            upsertSet.webhookReceipt.processingState,
                          verifiedSignature:
                            upsertSet.webhookReceipt.verifiedSignature,
                          scope: upsertSet.webhookReceipt.scope,
                          scopeId: upsertSet.webhookReceipt.scopeId,
                          payload: upsertSet.webhookReceipt.payload,
                          receivedAt: upsertSet.webhookReceipt.receivedAt,
                          processedAt: upsertSet.webhookReceipt.processedAt,
                        },
                      })
                      .execute();

                    await tx
                      .insert(billingSubscriptionsTable)
                      .values(upsertSet.subscription)
                      .onConflictDoUpdate({
                        target: [
                          billingSubscriptionsTable.provider,
                          billingSubscriptionsTable.providerSubscriptionId,
                        ],
                        set: {
                          accountId: upsertSet.subscription.accountId,
                          scope: upsertSet.subscription.scope,
                          scopeId: upsertSet.subscription.scopeId,
                          planId: upsertSet.subscription.planId,
                          priceId: upsertSet.subscription.priceId,
                          status: upsertSet.subscription.status,
                          currentPeriodEnd:
                            upsertSet.subscription.currentPeriodEnd,
                          cancelAt: upsertSet.subscription.cancelAt,
                          canceledAt: upsertSet.subscription.canceledAt,
                          metadata: upsertSet.subscription.metadata,
                          updatedAt: upsertSet.subscription.updatedAt,
                        },
                      })
                      .execute();

                    await tx
                      .insert(billingPaymentEventsTable)
                      .values(upsertSet.paymentEvent)
                      .onConflictDoUpdate({
                        target: [
                          billingPaymentEventsTable.provider,
                          billingPaymentEventsTable.providerEventId,
                        ],
                        set: {
                          subscriptionId: upsertSet.paymentEvent.subscriptionId,
                          scope: upsertSet.paymentEvent.scope,
                          scopeId: upsertSet.paymentEvent.scopeId,
                          eventType: upsertSet.paymentEvent.eventType,
                          status: upsertSet.paymentEvent.status,
                          effectiveAt: upsertSet.paymentEvent.effectiveAt,
                          payload: upsertSet.paymentEvent.payload,
                          recordedAt: upsertSet.paymentEvent.recordedAt,
                        },
                      })
                      .execute();

                    for (const entitlement of upsertSet.entitlements) {
                      await tx
                        .insert(billingEntitlementsTable)
                        .values(entitlement)
                        .onConflictDoUpdate({
                          target: [
                            billingEntitlementsTable.moduleId,
                            billingEntitlementsTable.featureKey,
                            billingEntitlementsTable.scope,
                            billingEntitlementsTable.scopeId,
                          ],
                          set: {
                            active: entitlement.active,
                            quotaSnapshot: entitlement.quotaSnapshot,
                            grantedAt: entitlement.grantedAt,
                            expiresAt: entitlement.expiresAt,
                          },
                        })
                        .execute();
                    }

                    return projection;
                  }),
                catch: (cause) =>
                  ({
                    _tag: "BillingWebhookPostgresRepositoryPersistenceError",
                    operation: "persistWebhookProjection",
                    cause,
                  }) satisfies BillingWebhookPostgresRepositoryPersistenceError,
              }),
            ),
          ),
        ),
      ),
  });

export const makeBillingWebhookPostgresRepositoryLayer = (
  database: BillingWebhookPostgresDatabase,
) =>
  Layer.effect(
    BillingWebhookPostgresRepository,
    makeBillingWebhookPostgresRepository(database),
  );
