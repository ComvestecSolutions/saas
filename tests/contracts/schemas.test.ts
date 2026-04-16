import "../type-assertions";

import { Schema } from "effect";
import {
  billingAndMeteringFeatureFlag,
  billingEnforcementMode,
  BillingPlanCreateRequestSchema,
  BillingPlanSchema,
  billingPlanVisibility,
  BillingWebhookReconciliationSchema,
  billingMeteringMode,
  billingPlanInterval,
  billingSubscriptionStatus,
  billingWebhookEventType,
  billingWebhookReconciliationAction,
  permissionScope,
  PermissionScopeSchema,
  platformModuleId,
  RequestContextSchema,
  TenantContextSchema,
  tenantManagementFeatureFlag,
  usageQuotaPeriod,
} from "@comvestec/contracts";
describe("contract schemas", () => {
  it("decodes a tenant context", () => {
    const tenantContext = Schema.decodeUnknownSync(TenantContextSchema)({
      scope: "organization",
      scopeId: "org_1",
      enterpriseId: "ent_1",
      organizationId: "org_1",
      individualId: "usr_1",
    });

    expect(tenantContext.scopeId).toBe("org_1");
    expect(tenantContext.organizationId).toBe("org_1");
  });

  it("decodes a standalone individual request context", () => {
    const requestContext = Schema.decodeUnknownSync(RequestContextSchema)({
      actorType: "individual-user",
      actorId: "usr_1",
      sessionId: "sess_1",
      correlationId: "corr_1",
      tenant: {
        scope: "individual",
        scopeId: "usr_1",
        individualId: "usr_1",
      },
    });

    expect(requestContext.tenant.enterpriseId).toBeUndefined();
    expect(requestContext.tenant.organizationId).toBeUndefined();
  });

  it("accepts anonymous public request context", () => {
    const requestContext = Schema.decodeUnknownSync(RequestContextSchema)({
      actorType: "anonymous",
      correlationId: "corr_public",
      host: "www.comvestec.local",
      tenant: {
        scope: "platform",
        scopeId: "platform",
      },
    });

    expect(requestContext.actorId).toBeUndefined();
    expect(requestContext.host).toBe("www.comvestec.local");
  });

  it("accepts request context with non-empty support elevation context", () => {
    const requestContext = Schema.decodeUnknownSync(RequestContextSchema)({
      actorType: "support-operator",
      actorId: "usr_support_1",
      sessionId: "sess_support_1",
      correlationId: "corr_support_1",
      tenant: {
        scope: "organization",
        scopeId: "org_1",
        organizationId: "org_1",
      },
      impersonation: {
        impersonatedActorId: "usr_member_1",
        approvedBy: "usr_admin_1",
        reason: "Investigate customer issue",
      },
      breakGlass: {
        approvedBy: "usr_admin_1",
        reason: "Investigate regulated support incident",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    expect(requestContext.impersonation?.approvedBy).toBe("usr_admin_1");
    expect(requestContext.breakGlass?.reason).toBe(
      "Investigate regulated support incident",
    );
  });

  it("rejects empty break-glass approvers and reasons", () => {
    expect(() =>
      Schema.decodeUnknownSync(RequestContextSchema)({
        actorType: "support-operator",
        actorId: "usr_support_1",
        sessionId: "sess_support_1",
        correlationId: "corr_support_1",
        tenant: {
          scope: "organization",
          scopeId: "org_1",
          organizationId: "org_1",
        },
        breakGlass: {
          approvedBy: "",
          reason: "",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    ).toThrow();
  });

  it("rejects unknown permission scopes", () => {
    expect(() =>
      Schema.decodeUnknownSync(PermissionScopeSchema)("unknown:scope"),
    ).toThrow();
  });

  it("accepts branding permission scopes", () => {
    const decodedPermissionScope = Schema.decodeUnknownSync(
      PermissionScopeSchema,
    )(permissionScope.brandingManage);

    expect(decodedPermissionScope).toBe(permissionScope.brandingManage);
  });

  it("decodes flexible billing plans with mixed non-metered and rate-limited entitlements", () => {
    const plan = Schema.decodeUnknownSync(BillingPlanSchema)({
      planId: "plan_growth",
      planKey: "growth",
      displayName: "Growth",
      active: true,
      prices: [
        {
          priceId: "price_growth_month",
          interval: billingPlanInterval.month,
          currency: "USD",
          amountMinor: 2900,
          active: true,
          providerPriceId: "polar_price_month",
        },
        {
          priceId: "price_growth_year",
          interval: billingPlanInterval.year,
          currency: "USD",
          amountMinor: 29000,
          active: true,
          providerPriceId: "polar_price_year",
        },
      ],
      entitlements: [
        {
          moduleId: platformModuleId.tenantManagement,
          featureKey: tenantManagementFeatureFlag.enabled,
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
          quotaLimit: 120,
          quotaPeriod: usageQuotaPeriod.minute,
          enforcementMode: billingEnforcementMode.rateLimit,
        },
      ],
    });

    expect(plan.prices.map((price) => price.interval)).toEqual(
      expect.arrayContaining([
        billingPlanInterval.month,
        billingPlanInterval.year,
      ]),
    );
    expect(plan.entitlements[0]?.meteringMode).toBe(billingMeteringMode.none);
    expect(plan.entitlements[1]?.enforcementMode).toBe(
      billingEnforcementMode.rateLimit,
    );
  });

  it("decodes managed recurring billing plan creation requests", () => {
    const request = Schema.decodeUnknownSync(BillingPlanCreateRequestSchema)({
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
            featureKey: tenantManagementFeatureFlag.enabled,
            included: true,
            meteringMode: billingMeteringMode.none,
            enforcementMode: billingEnforcementMode.none,
          },
        ],
      },
    });

    expect(request.plan.visibility).toBe(billingPlanVisibility.draft);
    expect(request.plan.price.interval).toBe(billingPlanInterval.month);
    expect(request.plan.entitlements[0]?.moduleId).toBe(
      platformModuleId.tenantManagement,
    );
  });

  it("decodes normalized billing webhook reconciliation payloads", () => {
    const reconciliation = Schema.decodeUnknownSync(
      BillingWebhookReconciliationSchema,
    )({
      action: billingWebhookReconciliationAction.activate,
      event: {
        provider: "polar",
        deliveryId: "wh_1",
        eventId: "evt_1",
        eventType: billingWebhookEventType.checkoutCompleted,
        occurredAt: new Date().toISOString(),
        subscriptionId: "sub_1",
        tenantScope: "organization",
        tenantScopeId: "org_1",
        planId: "plan_starter",
        priceId: "price_starter_month",
        customerId: "cus_1",
      },
      subscription: {
        subscriptionId: "sub_1",
        planId: "plan_starter",
        priceId: "price_starter_month",
        status: billingSubscriptionStatus.active,
        interval: billingPlanInterval.month,
        currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
        entitlements: [
          {
            moduleId: platformModuleId.tenantManagement,
            featureKey: tenantManagementFeatureFlag.enabled,
            included: true,
            meteringMode: billingMeteringMode.none,
            enforcementMode: billingEnforcementMode.none,
          },
        ],
      },
      entitlementsActive: true,
    });

    expect(reconciliation.action).toBe(
      billingWebhookReconciliationAction.activate,
    );
    expect(reconciliation.subscription.status).toBe(
      billingSubscriptionStatus.active,
    );
    expect(reconciliation.event.eventType).toBe(
      billingWebhookEventType.checkoutCompleted,
    );
  });
});
