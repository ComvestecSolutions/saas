import { Schema } from "effect";
import { PlatformScopeSchema } from "../access/platform-scopes";
import { RequestContextSchema } from "../access/request-context";
import {
  DeclaredModuleMeterKeySchema,
  GovernanceEntitlementFeatureKeySchema,
  type DeclaredModuleMeterKey,
  type GovernanceEntitlementFeatureKey,
} from "../module-registry/key-factories";
import { PlatformModuleIdSchema } from "../module-registry/modules";

const BillingPlanIntervalConstantSchema = Schema.Struct({
  month: Schema.Literal("month"),
  year: Schema.Literal("year"),
});

export const billingPlanInterval = Schema.validateSync(
  BillingPlanIntervalConstantSchema,
)({
  month: "month",
  year: "year",
} satisfies Schema.Schema.Type<typeof BillingPlanIntervalConstantSchema>);

export const billingPlanIntervals = [
  billingPlanInterval.month,
  billingPlanInterval.year,
] as const;

export const BillingPlanIntervalSchema = Schema.Literal(
  ...billingPlanIntervals,
);

export type BillingPlanInterval = Schema.Schema.Type<
  typeof BillingPlanIntervalSchema
>;

const BillingMeteringModeConstantSchema = Schema.Struct({
  none: Schema.Literal("none"),
  usage: Schema.Literal("usage"),
  rateLimit: Schema.Literal("rate-limit"),
});

export const billingMeteringMode = Schema.validateSync(
  BillingMeteringModeConstantSchema,
)({
  none: "none",
  usage: "usage",
  rateLimit: "rate-limit",
} satisfies Schema.Schema.Type<typeof BillingMeteringModeConstantSchema>);

export const billingMeteringModes = [
  billingMeteringMode.none,
  billingMeteringMode.usage,
  billingMeteringMode.rateLimit,
] as const;

export const BillingMeteringModeSchema = Schema.Literal(
  ...billingMeteringModes,
);

export type BillingMeteringMode = Schema.Schema.Type<
  typeof BillingMeteringModeSchema
>;

const BillingEnforcementModeConstantSchema = Schema.Struct({
  none: Schema.Literal("none"),
  observe: Schema.Literal("observe"),
  rateLimit: Schema.Literal("rate-limit"),
  block: Schema.Literal("block"),
});

export const billingEnforcementMode = Schema.validateSync(
  BillingEnforcementModeConstantSchema,
)({
  none: "none",
  observe: "observe",
  rateLimit: "rate-limit",
  block: "block",
} satisfies Schema.Schema.Type<typeof BillingEnforcementModeConstantSchema>);

export const billingEnforcementModes = [
  billingEnforcementMode.none,
  billingEnforcementMode.observe,
  billingEnforcementMode.rateLimit,
  billingEnforcementMode.block,
] as const;

export const BillingEnforcementModeSchema = Schema.Literal(
  ...billingEnforcementModes,
);

export type BillingEnforcementMode = Schema.Schema.Type<
  typeof BillingEnforcementModeSchema
>;

const UsageQuotaPeriodConstantSchema = Schema.Struct({
  minute: Schema.Literal("minute"),
  hour: Schema.Literal("hour"),
  day: Schema.Literal("day"),
  month: Schema.Literal("month"),
});

export const usageQuotaPeriod = Schema.validateSync(
  UsageQuotaPeriodConstantSchema,
)({
  minute: "minute",
  hour: "hour",
  day: "day",
  month: "month",
} satisfies Schema.Schema.Type<typeof UsageQuotaPeriodConstantSchema>);

export const usageQuotaPeriods = [
  usageQuotaPeriod.minute,
  usageQuotaPeriod.hour,
  usageQuotaPeriod.day,
  usageQuotaPeriod.month,
] as const;

export const UsageQuotaPeriodSchema = Schema.Literal(...usageQuotaPeriods);

export type UsageQuotaPeriod = Schema.Schema.Type<
  typeof UsageQuotaPeriodSchema
>;

export const BillingFeatureKeySchema = GovernanceEntitlementFeatureKeySchema;

export type BillingFeatureKey = GovernanceEntitlementFeatureKey;

export const BillingMeterKeySchema = DeclaredModuleMeterKeySchema;

export type BillingMeterKey = DeclaredModuleMeterKey;

export const BillingPlanPriceSchema = Schema.Struct({
  priceId: Schema.NonEmptyString,
  interval: BillingPlanIntervalSchema,
  currency: Schema.NonEmptyString,
  amountMinor: Schema.Number,
  active: Schema.Boolean,
  providerPriceId: Schema.optional(Schema.NonEmptyString),
});

export type BillingPlanPrice = Schema.Schema.Type<
  typeof BillingPlanPriceSchema
>;

export const BillingEntitlementItemSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  featureKey: Schema.optional(BillingFeatureKeySchema),
  included: Schema.Boolean,
  meteringMode: BillingMeteringModeSchema,
  meterKey: Schema.optional(BillingMeterKeySchema),
  unit: Schema.optional(Schema.NonEmptyString),
  quotaLimit: Schema.optional(Schema.Number),
  quotaPeriod: Schema.optional(UsageQuotaPeriodSchema),
  enforcementMode: BillingEnforcementModeSchema,
});

export type BillingEntitlementItem = Schema.Schema.Type<
  typeof BillingEntitlementItemSchema
>;

const BillingPlanPublicFields = {
  planId: Schema.NonEmptyString,
  planKey: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
  description: Schema.optional(Schema.NonEmptyString),
  active: Schema.Boolean,
  prices: Schema.Array(BillingPlanPriceSchema),
};

export const BillingPlanSchema = Schema.Struct({
  ...BillingPlanPublicFields,
  entitlements: Schema.Array(BillingEntitlementItemSchema),
});

export type BillingPlan = Schema.Schema.Type<typeof BillingPlanSchema>;

export const PublicBillingPlanSchema = Schema.Struct(BillingPlanPublicFields);

export type PublicBillingPlan = Schema.Schema.Type<
  typeof PublicBillingPlanSchema
>;

export const PublicBillingPlanCatalogSchema = Schema.Array(
  PublicBillingPlanSchema,
);

export type PublicBillingPlanCatalog = Schema.Schema.Type<
  typeof PublicBillingPlanCatalogSchema
>;

export const BillingCheckoutSessionInputSchema = Schema.Struct({
  planId: Schema.NonEmptyString,
  priceId: Schema.NonEmptyString,
  successUrl: Schema.NonEmptyString,
  cancelUrl: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
});

export type BillingCheckoutSessionInput = Schema.Schema.Type<
  typeof BillingCheckoutSessionInputSchema
>;

export const BillingCheckoutSessionSchema = Schema.Struct({
  checkoutSessionId: Schema.NonEmptyString,
  checkoutUrl: Schema.NonEmptyString,
  planId: Schema.NonEmptyString,
  priceId: Schema.NonEmptyString,
  interval: BillingPlanIntervalSchema,
  provider: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
});

export type BillingCheckoutSession = Schema.Schema.Type<
  typeof BillingCheckoutSessionSchema
>;

const BillingSubscriptionStatusConstantSchema = Schema.Struct({
  pending: Schema.Literal("pending"),
  active: Schema.Literal("active"),
  pastDue: Schema.Literal("past-due"),
  canceled: Schema.Literal("canceled"),
});

export const billingSubscriptionStatus = Schema.validateSync(
  BillingSubscriptionStatusConstantSchema,
)({
  pending: "pending",
  active: "active",
  pastDue: "past-due",
  canceled: "canceled",
} satisfies Schema.Schema.Type<typeof BillingSubscriptionStatusConstantSchema>);

export const billingSubscriptionStatuses = [
  billingSubscriptionStatus.pending,
  billingSubscriptionStatus.active,
  billingSubscriptionStatus.pastDue,
  billingSubscriptionStatus.canceled,
] as const;

export const BillingSubscriptionStatusSchema = Schema.Literal(
  ...billingSubscriptionStatuses,
);

export type BillingSubscriptionStatus = Schema.Schema.Type<
  typeof BillingSubscriptionStatusSchema
>;

const BillingPaymentEventStatusConstantSchema = Schema.Struct({
  succeeded: Schema.Literal("succeeded"),
  failed: Schema.Literal("failed"),
  canceled: Schema.Literal("canceled"),
  synced: Schema.Literal("synced"),
});

export const billingPaymentEventStatus = Schema.validateSync(
  BillingPaymentEventStatusConstantSchema,
)({
  succeeded: "succeeded",
  failed: "failed",
  canceled: "canceled",
  synced: "synced",
} satisfies Schema.Schema.Type<typeof BillingPaymentEventStatusConstantSchema>);

export const billingPaymentEventStatuses = [
  billingPaymentEventStatus.succeeded,
  billingPaymentEventStatus.failed,
  billingPaymentEventStatus.canceled,
  billingPaymentEventStatus.synced,
] as const;

export const BillingPaymentEventStatusSchema = Schema.Literal(
  ...billingPaymentEventStatuses,
);

export type BillingPaymentEventStatus = Schema.Schema.Type<
  typeof BillingPaymentEventStatusSchema
>;

const BillingWebhookReceiptProcessingStateConstantSchema = Schema.Struct({
  pending: Schema.Literal("pending"),
  processed: Schema.Literal("processed"),
  rejected: Schema.Literal("rejected"),
});

export const billingWebhookReceiptProcessingState = Schema.validateSync(
  BillingWebhookReceiptProcessingStateConstantSchema,
)({
  pending: "pending",
  processed: "processed",
  rejected: "rejected",
} satisfies Schema.Schema.Type<
  typeof BillingWebhookReceiptProcessingStateConstantSchema
>);

export const billingWebhookReceiptProcessingStates = [
  billingWebhookReceiptProcessingState.pending,
  billingWebhookReceiptProcessingState.processed,
  billingWebhookReceiptProcessingState.rejected,
] as const;

export const BillingWebhookReceiptProcessingStateSchema = Schema.Literal(
  ...billingWebhookReceiptProcessingStates,
);

export type BillingWebhookReceiptProcessingState = Schema.Schema.Type<
  typeof BillingWebhookReceiptProcessingStateSchema
>;

const BillingWebhookEventTypeConstantSchema = Schema.Struct({
  checkoutCompleted: Schema.Literal("checkout.completed"),
  subscriptionRenewed: Schema.Literal("subscription.renewed"),
  subscriptionCanceled: Schema.Literal("subscription.canceled"),
  paymentFailed: Schema.Literal("payment.failed"),
  entitlementUpdated: Schema.Literal("entitlement.updated"),
});

export const billingWebhookEventType = Schema.validateSync(
  BillingWebhookEventTypeConstantSchema,
)({
  checkoutCompleted: "checkout.completed",
  subscriptionRenewed: "subscription.renewed",
  subscriptionCanceled: "subscription.canceled",
  paymentFailed: "payment.failed",
  entitlementUpdated: "entitlement.updated",
} satisfies Schema.Schema.Type<typeof BillingWebhookEventTypeConstantSchema>);

export const billingWebhookEventTypes = [
  billingWebhookEventType.checkoutCompleted,
  billingWebhookEventType.subscriptionRenewed,
  billingWebhookEventType.subscriptionCanceled,
  billingWebhookEventType.paymentFailed,
  billingWebhookEventType.entitlementUpdated,
] as const;

export const BillingWebhookEventTypeSchema = Schema.Literal(
  ...billingWebhookEventTypes,
);

export type BillingWebhookEventType = Schema.Schema.Type<
  typeof BillingWebhookEventTypeSchema
>;

const BillingWebhookReconciliationActionConstantSchema = Schema.Struct({
  activate: Schema.Literal("activate"),
  renew: Schema.Literal("renew"),
  deactivate: Schema.Literal("deactivate"),
  flagPastDue: Schema.Literal("flag-past-due"),
  sync: Schema.Literal("sync"),
});

export const billingWebhookReconciliationAction = Schema.validateSync(
  BillingWebhookReconciliationActionConstantSchema,
)({
  activate: "activate",
  renew: "renew",
  deactivate: "deactivate",
  flagPastDue: "flag-past-due",
  sync: "sync",
} satisfies Schema.Schema.Type<
  typeof BillingWebhookReconciliationActionConstantSchema
>);

export const billingWebhookReconciliationActions = [
  billingWebhookReconciliationAction.activate,
  billingWebhookReconciliationAction.renew,
  billingWebhookReconciliationAction.deactivate,
  billingWebhookReconciliationAction.flagPastDue,
  billingWebhookReconciliationAction.sync,
] as const;

export const BillingWebhookReconciliationActionSchema = Schema.Literal(
  ...billingWebhookReconciliationActions,
);

export type BillingWebhookReconciliationAction = Schema.Schema.Type<
  typeof BillingWebhookReconciliationActionSchema
>;

export const BillingProviderWebhookInputSchema = Schema.Struct({
  provider: Schema.NonEmptyString,
  deliveryId: Schema.NonEmptyString,
  eventId: Schema.NonEmptyString,
  eventType: BillingWebhookEventTypeSchema,
  occurredAt: Schema.NonEmptyString,
  verifiedSignature: Schema.Boolean,
  subscriptionId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  planId: Schema.NonEmptyString,
  priceId: Schema.NonEmptyString,
  customerId: Schema.optional(Schema.NonEmptyString),
  currentPeriodEnd: Schema.optional(Schema.NonEmptyString),
  cancelAt: Schema.optional(Schema.NonEmptyString),
});

export type BillingProviderWebhookInput = Schema.Schema.Type<
  typeof BillingProviderWebhookInputSchema
>;

export const BillingWebhookEventSchema = Schema.Struct({
  provider: Schema.NonEmptyString,
  deliveryId: Schema.NonEmptyString,
  eventId: Schema.NonEmptyString,
  eventType: BillingWebhookEventTypeSchema,
  occurredAt: Schema.NonEmptyString,
  subscriptionId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  planId: Schema.NonEmptyString,
  priceId: Schema.NonEmptyString,
  customerId: Schema.optional(Schema.NonEmptyString),
});

export type BillingWebhookEvent = Schema.Schema.Type<
  typeof BillingWebhookEventSchema
>;

export const BillingSubscriptionSnapshotSchema = Schema.Struct({
  subscriptionId: Schema.NonEmptyString,
  planId: Schema.NonEmptyString,
  priceId: Schema.NonEmptyString,
  status: BillingSubscriptionStatusSchema,
  interval: BillingPlanIntervalSchema,
  currentPeriodEnd: Schema.optional(Schema.NonEmptyString),
  cancelAt: Schema.optional(Schema.NonEmptyString),
  entitlements: Schema.Array(BillingEntitlementItemSchema),
});

export type BillingSubscriptionSnapshot = Schema.Schema.Type<
  typeof BillingSubscriptionSnapshotSchema
>;

export const BillingWebhookReconciliationSchema = Schema.Struct({
  action: BillingWebhookReconciliationActionSchema,
  event: BillingWebhookEventSchema,
  subscription: BillingSubscriptionSnapshotSchema,
  entitlementsActive: Schema.Boolean,
});

export type BillingWebhookReconciliation = Schema.Schema.Type<
  typeof BillingWebhookReconciliationSchema
>;

export const UsageQuotaSchema = Schema.Struct({
  featureKey: GovernanceEntitlementFeatureKeySchema,
  limit: Schema.Number,
  period: UsageQuotaPeriodSchema,
  enforcementMode: BillingEnforcementModeSchema,
});

export type UsageQuota = Schema.Schema.Type<typeof UsageQuotaSchema>;

export const UsageMeterEventSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  featureKey: GovernanceEntitlementFeatureKeySchema,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  quantity: Schema.Number,
  unit: Schema.NonEmptyString,
  capturedAt: Schema.NonEmptyString,
});

export type UsageMeterEvent = Schema.Schema.Type<typeof UsageMeterEventSchema>;

export const UsageQuotaEvaluationRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  quota: UsageQuotaSchema,
  consumed: Schema.Number,
  event: UsageMeterEventSchema,
});

export type UsageQuotaEvaluationRequest = Schema.Schema.Type<
  typeof UsageQuotaEvaluationRequestSchema
>;

export const UsageQuotaDecisionSchema = Schema.Struct({
  allowed: Schema.Boolean,
  remaining: Schema.Number,
  exceededBy: Schema.Number,
  reason: Schema.NonEmptyString,
});

export type UsageQuotaDecision = Schema.Schema.Type<
  typeof UsageQuotaDecisionSchema
>;

export const InternalCostSampleSchema = Schema.Struct({
  resource: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  quantity: Schema.Number,
  unitCost: Schema.Number,
});

export type InternalCostSample = Schema.Schema.Type<
  typeof InternalCostSampleSchema
>;

export const InternalCostAllocationSchema = Schema.Struct({
  resource: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  quantity: Schema.Number,
  unitCost: Schema.Number,
  totalCost: Schema.Number,
});

export type InternalCostAllocation = Schema.Schema.Type<
  typeof InternalCostAllocationSchema
>;
