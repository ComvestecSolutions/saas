import {
  billingAndMeteringFeatureFlag,
  billingEnforcementMode,
  billingMeteringMode,
  billingPlanInterval,
  billingPlanVisibility,
  platformModuleId,
  tenantBrandingFeatureFlag,
  tenantManagementFeatureFlag,
  usageQuotaPeriod,
  type BillingPlan,
  type BillingPlanCreateInput,
} from "@comvestec/contracts";

type ComparablePlan = Pick<
  BillingPlan,
  "planKey" | "displayName" | "description" | "prices"
>;

export const seedPlans = [
  {
    planKey: "starter",
    displayName: "Starter",
    description:
      "Single-organization workspace with guided onboarding and essential API throughput.",
    visibility: billingPlanVisibility.public,
    price: {
      interval: billingPlanInterval.month,
      currency: "USD",
      amountMinor: 1900,
    },
    entitlements: [
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.enabled,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.identitySession,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.guidedOnboarding,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        included: true,
        meteringMode: billingMeteringMode.rateLimit,
        meterKey: billingAndMeteringFeatureFlag.apiRequests,
        unit: "request",
        quotaLimit: 60,
        quotaPeriod: usageQuotaPeriod.minute,
        enforcementMode: billingEnforcementMode.rateLimit,
      },
    ],
  },
  {
    planKey: "growth",
    displayName: "Growth",
    description:
      "Branded tenant workspace with email branding, guided onboarding, and higher API throughput.",
    visibility: billingPlanVisibility.public,
    price: {
      interval: billingPlanInterval.month,
      currency: "USD",
      amountMinor: 7900,
    },
    entitlements: [
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.enabled,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.identitySession,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.guidedOnboarding,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.enabled,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.brandedEmails,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        included: true,
        meteringMode: billingMeteringMode.rateLimit,
        meterKey: billingAndMeteringFeatureFlag.apiRequests,
        unit: "request",
        quotaLimit: 600,
        quotaPeriod: usageQuotaPeriod.minute,
        enforcementMode: billingEnforcementMode.rateLimit,
      },
    ],
  },
  {
    planKey: "scale",
    displayName: "Scale",
    description:
      "Multi-organization rollout with enterprise hierarchy, custom domains, branded emails, and high-volume API throughput.",
    visibility: billingPlanVisibility.public,
    price: {
      interval: billingPlanInterval.month,
      currency: "USD",
      amountMinor: 19900,
    },
    entitlements: [
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.enabled,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.identitySession,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.guidedOnboarding,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.enterpriseHierarchy,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.enabled,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.customDomain,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.brandedEmails,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        included: true,
        meteringMode: billingMeteringMode.rateLimit,
        meterKey: billingAndMeteringFeatureFlag.apiRequests,
        unit: "request",
        quotaLimit: 2400,
        quotaPeriod: usageQuotaPeriod.minute,
        enforcementMode: billingEnforcementMode.rateLimit,
      },
    ],
  },
] as const satisfies readonly BillingPlanCreateInput[];

export const describePlanMismatch = (
  existingPlan: ComparablePlan,
  expectedPlan: BillingPlanCreateInput,
) => {
  if (existingPlan.planKey !== expectedPlan.planKey) {
    return `plan key mismatch: expected ${expectedPlan.planKey}`;
  }

  const activePrices = existingPlan.prices.filter((price) => price.active);
  const matchingPrice = activePrices.find(
    (price) =>
      price.interval === expectedPlan.price.interval &&
      price.currency === expectedPlan.price.currency &&
      price.amountMinor === expectedPlan.price.amountMinor,
  );

  if (existingPlan.displayName !== expectedPlan.displayName) {
    return `display name mismatch: expected ${expectedPlan.displayName}`;
  }

  if ((existingPlan.description ?? undefined) !== expectedPlan.description) {
    return "description mismatch";
  }

  if (activePrices.length !== 1) {
    return `expected exactly one active public price but found ${activePrices.length}`;
  }

  if (matchingPrice === undefined) {
    return `missing ${expectedPlan.price.interval} ${expectedPlan.price.currency} ${expectedPlan.price.amountMinor} active price`;
  }

  return undefined;
};

export const findDuplicatePlanKeys = (
  plans: readonly Pick<ComparablePlan, "planKey">[],
) => {
  const planCounts = new Map<string, number>();

  for (const plan of plans) {
    planCounts.set(plan.planKey, (planCounts.get(plan.planKey) ?? 0) + 1);
  }

  return [...planCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([planKey]) => planKey);
};
