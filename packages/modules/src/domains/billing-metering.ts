import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  billingEnforcementMode,
  BillingMeterKeySchema,
  BillingEnforcementModeSchema,
  billingMeteringMode,
  BillingMeteringModeSchema,
  billingPaymentEventStatus,
  BillingPlanInterval,
  BillingPlanIntervalSchema,
  BillingPlanPrice,
  BillingSubscriptionStatusSchema,
  BillingWebhookEventType,
  BillingWebhookEventTypeSchema,
  billingWebhookEventType,
  BillingWebhookReceiptProcessingStateSchema,
  billingWebhookReceiptProcessingState,
  BillingWebhookReconciliationActionSchema,
  BillingWebhookReconciliationSchema,
  BillingPlanSchema,
  getModuleEnabledFeatureFlagKey,
  InternalCostAllocation,
  InternalCostAllocationSchema,
  InternalCostSample,
  GovernanceEntitlementFeatureKeySchema,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
  UsageQuotaPeriodSchema,
  UsageQuotaDecision,
  UsageQuotaDecisionSchema,
  UsageQuotaEvaluationRequestSchema,
} from "@comvestec/contracts";

export {
  BillingPlanPriceSchema,
  InternalCostAllocationSchema,
  InternalCostSampleSchema,
  UsageMeterEventSchema,
  UsageQuotaDecisionSchema,
  UsageQuotaEvaluationRequestSchema,
  UsageQuotaSchema,
} from "@comvestec/contracts";
export type {
  BillingPlanPrice,
  InternalCostAllocation,
  InternalCostSample,
  UsageQuotaDecision,
} from "@comvestec/contracts";

const BillingScopedFields = {
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
};

const BillingPlanPriceReferenceFields = {
  planId: Schema.NonEmptyString,
  priceId: Schema.NonEmptyString,
};

const BillingActionCustomerFields = {
  action: BillingWebhookReconciliationActionSchema,
  customerId: Schema.optional(Schema.NonEmptyString),
};

const BillingWebhookReceiptPayloadSchema = Schema.Struct({
  eventId: Schema.NonEmptyString,
  subscriptionId: Schema.NonEmptyString,
  ...BillingPlanPriceReferenceFields,
  ...BillingActionCustomerFields,
  entitlementsActive: Schema.Boolean,
});

const BillingWebhookReceiptRecordSchema = Schema.Struct({
  receiptId: Schema.NonEmptyString,
  provider: Schema.NonEmptyString,
  deliveryId: Schema.NonEmptyString,
  eventType: BillingWebhookEventTypeSchema,
  processingState: BillingWebhookReceiptProcessingStateSchema,
  verifiedSignature: Schema.Boolean,
  ...BillingScopedFields,
  payload: BillingWebhookReceiptPayloadSchema,
  receivedAt: Schema.NonEmptyString,
  processedAt: Schema.NonEmptyString,
});

export type BillingWebhookReceiptRecord = Schema.Schema.Type<
  typeof BillingWebhookReceiptRecordSchema
>;

const BillingSubscriptionMetadataSchema = Schema.Struct({
  action: BillingWebhookReconciliationActionSchema,
  interval: BillingPlanIntervalSchema,
  entitlementsActive: Schema.Boolean,
  customerId: Schema.optional(Schema.NonEmptyString),
});

const BillingSubscriptionRecordSchema = Schema.Struct({
  subscriptionId: Schema.NonEmptyString,
  provider: Schema.NonEmptyString,
  providerSubscriptionId: Schema.NonEmptyString,
  ...BillingScopedFields,
  ...BillingPlanPriceReferenceFields,
  status: BillingSubscriptionStatusSchema,
  currentPeriodEnd: Schema.optional(Schema.NonEmptyString),
  cancelAt: Schema.optional(Schema.NonEmptyString),
  metadata: BillingSubscriptionMetadataSchema,
});

export type BillingSubscriptionRecord = Schema.Schema.Type<
  typeof BillingSubscriptionRecordSchema
>;

const BillingPaymentEventPayloadSchema = Schema.Struct({
  ...BillingPlanPriceReferenceFields,
  ...BillingActionCustomerFields,
});

const BillingPaymentEventRecordSchema = Schema.Struct({
  eventId: Schema.NonEmptyString,
  provider: Schema.NonEmptyString,
  providerEventId: Schema.NonEmptyString,
  subscriptionId: Schema.NonEmptyString,
  ...BillingScopedFields,
  eventType: BillingWebhookEventTypeSchema,
  status: Schema.Literal(
    billingPaymentEventStatus.succeeded,
    billingPaymentEventStatus.failed,
    billingPaymentEventStatus.canceled,
    billingPaymentEventStatus.synced,
  ),
  effectiveAt: Schema.NonEmptyString,
  payload: BillingPaymentEventPayloadSchema,
});

export type BillingPaymentEventRecord = Schema.Schema.Type<
  typeof BillingPaymentEventRecordSchema
>;

const BillingEntitlementQuotaSnapshotSchema = Schema.Struct({
  meteringMode: BillingMeteringModeSchema,
  meterKey: Schema.optional(BillingMeterKeySchema),
  unit: Schema.optional(Schema.NonEmptyString),
  quotaLimit: Schema.optional(Schema.Number),
  quotaPeriod: Schema.optional(UsageQuotaPeriodSchema),
  enforcementMode: BillingEnforcementModeSchema,
});

export type BillingEntitlementQuotaSnapshot = Schema.Schema.Type<
  typeof BillingEntitlementQuotaSnapshotSchema
>;

const BillingEntitlementRecordSchema = Schema.Struct({
  entitlementId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  featureKey: GovernanceEntitlementFeatureKeySchema,
  ...BillingScopedFields,
  active: Schema.Boolean,
  quotaSnapshot: Schema.optional(BillingEntitlementQuotaSnapshotSchema),
  grantedAt: Schema.NonEmptyString,
  expiresAt: Schema.optional(Schema.NonEmptyString),
});

export type BillingEntitlementRecord = Schema.Schema.Type<
  typeof BillingEntitlementRecordSchema
>;

const BillingWebhookPersistenceProjectionSchema = Schema.Struct({
  webhookReceipt: BillingWebhookReceiptRecordSchema,
  subscription: BillingSubscriptionRecordSchema,
  paymentEvent: BillingPaymentEventRecordSchema,
  entitlements: Schema.Array(BillingEntitlementRecordSchema),
});

export type BillingWebhookPersistenceProjection = Schema.Schema.Type<
  typeof BillingWebhookPersistenceProjectionSchema
>;

export {
  BillingEntitlementQuotaSnapshotSchema,
  BillingEntitlementRecordSchema,
  BillingPaymentEventRecordSchema,
  BillingSubscriptionRecordSchema,
  BillingWebhookPersistenceProjectionSchema,
  BillingWebhookReceiptRecordSchema,
};

const BillingPlanPriceSelectionInputSchema = Schema.Struct({
  plan: BillingPlanSchema,
  priceId: Schema.optional(Schema.NonEmptyString),
  interval: Schema.optional(BillingPlanIntervalSchema),
});

export type BillingPlanPriceNotFoundError = {
  readonly _tag: "BillingPlanPriceNotFoundError";
  readonly planId: string;
  readonly priceId?: string;
  readonly interval?: BillingPlanInterval;
};

export type BillingMeteringModuleService = {
  readonly resolvePlanPrice: (
    input: unknown,
  ) => Effect.Effect<
    BillingPlanPrice,
    ParseResult.ParseError | BillingPlanPriceNotFoundError
  >;
  readonly evaluateQuota: (
    input: unknown,
  ) => Effect.Effect<UsageQuotaDecision, ParseResult.ParseError>;
  readonly allocateInternalCosts: (
    samples: readonly InternalCostSample[],
  ) => Effect.Effect<readonly InternalCostAllocation[], ParseResult.ParseError>;
  readonly buildWebhookPersistenceProjection: (
    input: unknown,
  ) => Effect.Effect<
    BillingWebhookPersistenceProjection,
    ParseResult.ParseError
  >;
};

export class BillingMeteringModule extends Context.Tag("BillingMeteringModule")<
  BillingMeteringModule,
  BillingMeteringModuleService
>() {}

export const makeBillingMeteringModule = () =>
  Effect.succeed<BillingMeteringModuleService>({
    resolvePlanPrice: (input: unknown) =>
      Schema.decodeUnknown(BillingPlanPriceSelectionInputSchema)(input).pipe(
        Effect.flatMap((request) => {
          const matchedPrice = request.priceId
            ? request.plan.prices.find(
                (price) => price.priceId === request.priceId && price.active,
              )
            : request.interval
              ? request.plan.prices.find(
                  (price) =>
                    price.interval === request.interval && price.active,
                )
              : request.plan.prices.find((price) => price.active);

          return matchedPrice === undefined
            ? Effect.fail({
                _tag: "BillingPlanPriceNotFoundError",
                planId: request.plan.planId,
                ...(request.priceId !== undefined
                  ? { priceId: request.priceId }
                  : {}),
                ...(request.interval !== undefined
                  ? { interval: request.interval }
                  : {}),
              } satisfies BillingPlanPriceNotFoundError)
            : Effect.succeed(matchedPrice);
        }),
      ),
    evaluateQuota: (input: unknown) =>
      Schema.decodeUnknown(UsageQuotaEvaluationRequestSchema)(input).pipe(
        Effect.flatMap((request) => {
          const nextConsumed = request.consumed + request.event.quantity;
          const remaining = Math.max(request.quota.limit - nextConsumed, 0);
          const exceededBy = Math.max(nextConsumed - request.quota.limit, 0);
          const enforcementMode = request.quota.enforcementMode;

          return Schema.decodeUnknown(UsageQuotaDecisionSchema)({
            allowed:
              exceededBy === 0 ||
              enforcementMode === billingEnforcementMode.none ||
              enforcementMode === billingEnforcementMode.observe,
            remaining,
            exceededBy,
            reason:
              exceededBy === 0
                ? "Quota available."
                : enforcementMode === billingEnforcementMode.rateLimit
                  ? "Quota exhausted and rate-limit enforcement throttles the request."
                  : enforcementMode === billingEnforcementMode.block
                    ? "Quota exhausted and block enforcement denies the request."
                    : "Quota exhausted but observe mode allows the request.",
          });
        }),
      ),
    allocateInternalCosts: (samples) =>
      Effect.forEach(samples, (sample) =>
        Schema.decodeUnknown(InternalCostAllocationSchema)({
          resource: sample.resource,
          scope: sample.scope,
          scopeId: sample.scopeId,
          quantity: sample.quantity,
          unitCost: sample.unitCost,
          totalCost: sample.quantity * sample.unitCost,
        }),
      ),
    buildWebhookPersistenceProjection: (input: unknown) =>
      Schema.decodeUnknown(BillingWebhookReconciliationSchema)(input).pipe(
        Effect.flatMap((reconciliation) => {
          const entitlementExpiresAt = reconciliation.entitlementsActive
            ? reconciliation.subscription.currentPeriodEnd
            : (reconciliation.subscription.cancelAt ??
              reconciliation.subscription.currentPeriodEnd);
          const paymentStatus = (eventType: BillingWebhookEventType) => {
            switch (eventType) {
              case billingWebhookEventType.checkoutCompleted:
              case billingWebhookEventType.subscriptionRenewed:
                return billingPaymentEventStatus.succeeded;
              case billingWebhookEventType.subscriptionCanceled:
                return billingPaymentEventStatus.canceled;
              case billingWebhookEventType.paymentFailed:
                return billingPaymentEventStatus.failed;
              case billingWebhookEventType.entitlementUpdated:
                return billingPaymentEventStatus.synced;
            }
          };

          return Schema.decodeUnknown(
            BillingWebhookPersistenceProjectionSchema,
          )({
            webhookReceipt: {
              receiptId: [
                reconciliation.event.provider,
                reconciliation.event.deliveryId,
              ].join(":"),
              provider: reconciliation.event.provider,
              deliveryId: reconciliation.event.deliveryId,
              eventType: reconciliation.event.eventType,
              processingState: billingWebhookReceiptProcessingState.processed,
              verifiedSignature: true,
              scope: reconciliation.event.tenantScope,
              scopeId: reconciliation.event.tenantScopeId,
              payload: {
                eventId: reconciliation.event.eventId,
                subscriptionId: reconciliation.event.subscriptionId,
                planId: reconciliation.event.planId,
                priceId: reconciliation.event.priceId,
                action: reconciliation.action,
                entitlementsActive: reconciliation.entitlementsActive,
                ...(reconciliation.event.customerId !== undefined
                  ? { customerId: reconciliation.event.customerId }
                  : {}),
              },
              receivedAt: reconciliation.event.occurredAt,
              processedAt: reconciliation.event.occurredAt,
            },
            subscription: {
              subscriptionId: reconciliation.subscription.subscriptionId,
              provider: reconciliation.event.provider,
              providerSubscriptionId:
                reconciliation.subscription.subscriptionId,
              scope: reconciliation.event.tenantScope,
              scopeId: reconciliation.event.tenantScopeId,
              planId: reconciliation.subscription.planId,
              priceId: reconciliation.subscription.priceId,
              status: reconciliation.subscription.status,
              ...(reconciliation.subscription.currentPeriodEnd !== undefined
                ? {
                    currentPeriodEnd:
                      reconciliation.subscription.currentPeriodEnd,
                  }
                : {}),
              ...(reconciliation.subscription.cancelAt !== undefined
                ? { cancelAt: reconciliation.subscription.cancelAt }
                : {}),
              metadata: {
                action: reconciliation.action,
                interval: reconciliation.subscription.interval,
                entitlementsActive: reconciliation.entitlementsActive,
                ...(reconciliation.event.customerId !== undefined
                  ? { customerId: reconciliation.event.customerId }
                  : {}),
              },
            },
            paymentEvent: {
              eventId: [
                reconciliation.event.provider,
                reconciliation.event.eventId,
              ].join(":"),
              provider: reconciliation.event.provider,
              providerEventId: reconciliation.event.eventId,
              subscriptionId: reconciliation.event.subscriptionId,
              scope: reconciliation.event.tenantScope,
              scopeId: reconciliation.event.tenantScopeId,
              eventType: reconciliation.event.eventType,
              status: paymentStatus(reconciliation.event.eventType),
              effectiveAt: reconciliation.event.occurredAt,
              payload: {
                planId: reconciliation.event.planId,
                priceId: reconciliation.event.priceId,
                action: reconciliation.action,
                ...(reconciliation.event.customerId !== undefined
                  ? { customerId: reconciliation.event.customerId }
                  : {}),
              },
            },
            entitlements: reconciliation.subscription.entitlements
              .filter((entitlement) => entitlement.included)
              .map((entitlement) => {
                const featureKey =
                  entitlement.featureKey ??
                  getModuleEnabledFeatureFlagKey(entitlement.moduleId);

                return {
                  entitlementId: [
                    reconciliation.event.tenantScope,
                    reconciliation.event.tenantScopeId,
                    reconciliation.subscription.planId,
                    entitlement.moduleId,
                    featureKey,
                  ].join(":"),
                  moduleId: entitlement.moduleId,
                  featureKey,
                  scope: reconciliation.event.tenantScope,
                  scopeId: reconciliation.event.tenantScopeId,
                  active: reconciliation.entitlementsActive,
                  ...(entitlement.meteringMode !== billingMeteringMode.none
                    ? {
                        quotaSnapshot: {
                          meteringMode: entitlement.meteringMode,
                          ...(entitlement.meterKey !== undefined
                            ? { meterKey: entitlement.meterKey }
                            : {}),
                          ...(entitlement.unit !== undefined
                            ? { unit: entitlement.unit }
                            : {}),
                          ...(entitlement.quotaLimit !== undefined
                            ? { quotaLimit: entitlement.quotaLimit }
                            : {}),
                          ...(entitlement.quotaPeriod !== undefined
                            ? { quotaPeriod: entitlement.quotaPeriod }
                            : {}),
                          enforcementMode: entitlement.enforcementMode,
                        },
                      }
                    : {}),
                  grantedAt: reconciliation.event.occurredAt,
                  ...(entitlementExpiresAt !== undefined
                    ? { expiresAt: entitlementExpiresAt }
                    : {}),
                };
              }),
          });
        }),
      ),
  });

export const BillingMeteringModuleLive = Layer.effect(
  BillingMeteringModule,
  makeBillingMeteringModule(),
);
