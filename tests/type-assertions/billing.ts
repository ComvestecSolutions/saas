import {
  billingEnforcementMode,
  billingMeteringMode,
  billingPaymentEventStatus,
  billingPlanInterval,
  billingSubscriptionStatus,
  billingWebhookReceiptProcessingState,
  billingWebhookEventType,
  billingWebhookReconciliationAction,
  platformModuleId,
  tenantManagementFeatureFlag,
  usageQuotaPeriod,
} from "@comvestec/contracts";
import type {
  BillingEnforcementMode,
  BillingEntitlementItem,
  BillingFeatureKey,
  BillingMeterKey,
  BillingMeteringMode,
  BillingPaymentEventStatus,
  BillingPlanInterval,
  BillingPlanPrice,
  BillingSubscriptionStatus,
  BillingWebhookReceiptProcessingState,
  BillingWebhookEventType,
  BillingWebhookReconciliationAction,
  UsageQuotaPeriod,
} from "@comvestec/contracts";
import { billingAndMeteringFeatureFlag } from "@comvestec/config";

const validBillingPlanIntervalSeed =
  billingPlanInterval.year satisfies BillingPlanInterval;

void validBillingPlanIntervalSeed;

const invalidBillingPlanIntervalSeed =
  // @ts-expect-error billing plan intervals must use shared literals
  "quarter" satisfies BillingPlanInterval;

void invalidBillingPlanIntervalSeed;

const validBillingMeteringModeSeed =
  billingMeteringMode.none satisfies BillingMeteringMode;

void validBillingMeteringModeSeed;

const invalidBillingEnforcementModeSeed =
  // @ts-expect-error billing enforcement modes must use shared literals
  "throttle" satisfies BillingEnforcementMode;

void invalidBillingEnforcementModeSeed;

const validModuleEnabledBillingFeatureKeySeed =
  tenantManagementFeatureFlag.enabled satisfies BillingFeatureKey;

void validModuleEnabledBillingFeatureKeySeed;

const validDeclaredBillingFeatureKeySeed =
  billingAndMeteringFeatureFlag.apiRequests satisfies BillingFeatureKey;

void validDeclaredBillingFeatureKeySeed;

const invalidDeclaredBillingFeatureKeySeed =
  // @ts-expect-error billing entitlement keys must use declared module literals
  "billing-and-metering.api.calls" satisfies typeof billingAndMeteringFeatureFlag.apiRequests;

void invalidDeclaredBillingFeatureKeySeed;

const validBillingFeatureKeySeed =
  billingAndMeteringFeatureFlag.apiRequests satisfies BillingFeatureKey;

void validBillingFeatureKeySeed;

const validBillingMeterKeySeed =
  billingAndMeteringFeatureFlag.apiRequests satisfies BillingMeterKey;

void validBillingMeterKeySeed;

const validDeclaredBillingMeterKeySeed =
  billingAndMeteringFeatureFlag.apiRequests satisfies BillingMeterKey;

void validDeclaredBillingMeterKeySeed;

const invalidDeclaredBillingMeterKeySeed =
  // @ts-expect-error billing meter keys must use declared module literals
  "billing-and-metering.requests.api" satisfies typeof billingAndMeteringFeatureFlag.apiRequests;

void invalidDeclaredBillingMeterKeySeed;

const validBillingPaymentEventStatusSeed =
  billingPaymentEventStatus.succeeded satisfies BillingPaymentEventStatus;

void validBillingPaymentEventStatusSeed;

const invalidBillingPaymentEventStatusSeed =
  // @ts-expect-error billing payment event statuses must use shared literals
  "settled" satisfies BillingPaymentEventStatus;

void invalidBillingPaymentEventStatusSeed;

const validBillingWebhookReceiptProcessingStateSeed =
  billingWebhookReceiptProcessingState.processed satisfies BillingWebhookReceiptProcessingState;

void validBillingWebhookReceiptProcessingStateSeed;

const invalidBillingWebhookReceiptProcessingStateSeed =
  // @ts-expect-error webhook receipt processing states must use shared literals
  "done" satisfies BillingWebhookReceiptProcessingState;

void invalidBillingWebhookReceiptProcessingStateSeed;

const validBillingSubscriptionStatusSeed =
  billingSubscriptionStatus.active satisfies BillingSubscriptionStatus;

void validBillingSubscriptionStatusSeed;

const invalidBillingSubscriptionStatusSeed =
  // @ts-expect-error billing subscription statuses must use shared literals
  "expired" satisfies BillingSubscriptionStatus;

void invalidBillingSubscriptionStatusSeed;

const validBillingWebhookEventTypeSeed =
  billingWebhookEventType.subscriptionRenewed satisfies BillingWebhookEventType;

void validBillingWebhookEventTypeSeed;

const invalidBillingWebhookEventTypeSeed =
  // @ts-expect-error billing webhook event types must use shared literals
  "subscription.paused" satisfies BillingWebhookEventType;

void invalidBillingWebhookEventTypeSeed;

const validBillingWebhookReconciliationActionSeed =
  billingWebhookReconciliationAction.flagPastDue satisfies BillingWebhookReconciliationAction;

void validBillingWebhookReconciliationActionSeed;

const invalidBillingWebhookReconciliationActionSeed =
  // @ts-expect-error billing webhook reconciliation actions must use shared literals
  "pause" satisfies BillingWebhookReconciliationAction;

void invalidBillingWebhookReconciliationActionSeed;

const validBillingPlanPriceSeed = {
  priceId: "price_growth_year",
  interval: billingPlanInterval.year,
  currency: "USD",
  amountMinor: 29000,
  active: true,
  providerPriceId: "polar_price_year",
} satisfies BillingPlanPrice;

void validBillingPlanPriceSeed;

const validBillingEntitlementItemSeed = {
  moduleId: platformModuleId.billingAndMetering,
  featureKey: billingAndMeteringFeatureFlag.apiRequests,
  included: true,
  meteringMode: billingMeteringMode.rateLimit,
  meterKey: billingAndMeteringFeatureFlag.apiRequests,
  unit: "request",
  quotaLimit: 120,
  quotaPeriod: usageQuotaPeriod.minute,
  enforcementMode: billingEnforcementMode.rateLimit,
} satisfies BillingEntitlementItem;

void validBillingEntitlementItemSeed;

const validUsageQuotaPeriodSeed =
  usageQuotaPeriod.month satisfies UsageQuotaPeriod;

void validUsageQuotaPeriodSeed;

const invalidUsageQuotaPeriodSeed =
  // @ts-expect-error usage quota periods must use shared literals
  "year" satisfies UsageQuotaPeriod;

void invalidUsageQuotaPeriodSeed;

export {};
