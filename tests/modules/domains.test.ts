import { Effect } from "effect";
import {
  actorType,
  customDomainLifecycleState,
  identityBrandingHandoffMode,
  permissionScope,
  platformModuleId,
  platformScope,
  telemetryKind,
  usageQuotaPeriod,
} from "@comvestec/contracts";
import {
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
  tenantBrandingRuntimeValueKey,
} from "@comvestec/config";
import {
  makeBillingMeteringModule,
  makeObservabilityModule,
  makeTenantBrandingModule,
  makeTenantManagementModule,
} from "@comvestec/modules";
import { organizationRequestContext } from "./_fixtures";

describe("modules domains", () => {
  it("resolves tenant branding and builds branded identity handoff", async () => {
    const tenantBranding = await Effect.runPromise(makeTenantBrandingModule());

    const branding = await Effect.runPromise(
      tenantBranding.resolveBranding({
        requestContext: {
          ...organizationRequestContext,
          host: "acme.example.com",
        },
        entitled: true,
        values: {
          [tenantBrandingConfigKey.companyName]: "Acme",
          [tenantBrandingConfigKey.themePrimary]: "#111827",
          [tenantBrandingConfigKey.themeSecondary]: "#374151",
          [tenantBrandingConfigKey.themeAccent]: "#10B981",
          [tenantBrandingRuntimeValueKey.customDomainStatus]:
            customDomainLifecycleState.active,
        },
      }),
    );
    const handoff = await Effect.runPromise(
      tenantBranding.buildIdentityHandoff({
        requestContext: {
          ...organizationRequestContext,
          host: "acme.example.com",
        },
        loginBaseUrl: "https://identity.example.com/login",
        branding: branding.publicProjection,
      }),
    );

    expect(branding.publicProjection.companyName).toBe("Acme");
    expect(handoff.mode).toBe(identityBrandingHandoffMode.brandedRedirect);
    expect(handoff.loginUrl).toContain("tenant_hint=org_1");
  });

  it("builds telemetry envelopes and exposes SLOs", async () => {
    const observability = await Effect.runPromise(makeObservabilityModule());

    const envelope = await Effect.runPromise(
      observability.buildTelemetryEnvelope({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.runtimeConfig,
        kind: telemetryKind.trace,
        permissionScope: permissionScope.configWrite,
        deploymentVersion: "2026.04.06",
        configVersion: "manifest-v1",
      }),
    );

    expect(envelope).toMatchObject({
      moduleId: platformModuleId.runtimeConfig,
      kind: telemetryKind.trace,
      permissionScope: permissionScope.configWrite,
    });
    await expect(Effect.runPromise(observability.listSlos)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "platform.availability.monthly" }),
      ]),
    );
  });

  it("enforces quotas and allocates internal costs", async () => {
    const billingMetering = await Effect.runPromise(
      makeBillingMeteringModule(),
    );

    const quotaDecision = await Effect.runPromise(
      billingMetering.evaluateQuota({
        requestContext: organizationRequestContext,
        quota: {
          featureKey: tenantBrandingFeatureFlag.customDomain,
          limit: 10,
          period: usageQuotaPeriod.month,
          hardLimit: true,
        },
        consumed: 9,
        event: {
          moduleId: platformModuleId.billingAndMetering,
          featureKey: tenantBrandingFeatureFlag.customDomain,
          scope: platformScope.organization,
          scopeId: "org_1",
          quantity: 2,
          unit: "domain",
          capturedAt: new Date().toISOString(),
        },
      }),
    );
    const costs = await Effect.runPromise(
      billingMetering.allocateInternalCosts([
        {
          resource: "convex-storage-gb",
          scope: platformScope.organization,
          scopeId: "org_1",
          quantity: 12,
          unitCost: 0.25,
        },
      ]),
    );

    expect(quotaDecision.allowed).toBe(false);
    expect(costs[0]?.totalCost).toBe(3);
  });

  it("builds onboarding plans and enforces tenant isolation", async () => {
    const tenantManagement = await Effect.runPromise(
      makeTenantManagementModule(),
    );

    const plan = await Effect.runPromise(
      tenantManagement.buildOnboardingPlan({
        requestContext: organizationRequestContext,
        enabledModules: [
          platformModuleId.tenantManagement,
          platformModuleId.tenantBranding,
          platformModuleId.billingAndMetering,
          platformModuleId.identitySession,
        ],
      }),
    );
    const isolation = await Effect.runPromise(
      tenantManagement.assertTenantIsolation({
        requestContext: organizationRequestContext,
        resourceTenant: {
          scope: platformScope.organization,
          scopeId: "org_2",
          enterpriseId: "ent_1",
          organizationId: "org_2",
        },
      }),
    );

    expect(plan.steps.map((step) => step.stepId)).toEqual(
      expect.arrayContaining(["branding", "billing"]),
    );
    expect(isolation.allowed).toBe(false);
  });

  it("allows cross-tenant access with valid break-glass context", async () => {
    const tenantManagement = await Effect.runPromise(
      makeTenantManagementModule(),
    );

    const isolation = await Effect.runPromise(
      tenantManagement.assertTenantIsolation({
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_1",
          sessionId: "sess_support_1",
          correlationId: "corr-break-glass",
          reason: "Regulated support investigation",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
            enterpriseId: "ent_1",
            organizationId: "org_1",
          },
          breakGlass: {
            approvedBy: "usr_admin_1",
            reason: "Regulated support investigation",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
        },
        resourceTenant: {
          scope: platformScope.organization,
          scopeId: "org_2",
          enterpriseId: "ent_1",
          organizationId: "org_2",
        },
      }),
    );

    expect(isolation.allowed).toBe(true);
  });

  it("denies cross-tenant access when break-glass context is expired", async () => {
    const tenantManagement = await Effect.runPromise(
      makeTenantManagementModule(),
    );

    const isolation = await Effect.runPromise(
      tenantManagement.assertTenantIsolation({
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_1",
          sessionId: "sess_support_1",
          correlationId: "corr-break-glass-expired",
          reason: "Regulated support investigation",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
            enterpriseId: "ent_1",
            organizationId: "org_1",
          },
          breakGlass: {
            approvedBy: "usr_admin_1",
            reason: "Regulated support investigation",
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
          },
        },
        resourceTenant: {
          scope: platformScope.organization,
          scopeId: "org_2",
          enterpriseId: "ent_1",
          organizationId: "org_2",
        },
      }),
    );

    expect(isolation.allowed).toBe(false);
  });

  it("exposes health indicators from observability module", async () => {
    const observability = await Effect.runPromise(makeObservabilityModule());

    const indicators = await Effect.runPromise(
      observability.listHealthIndicators,
    );

    expect(indicators.length).toBeGreaterThanOrEqual(1);
    expect(indicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.authorization,
          healthy: true,
        }),
      ]),
    );
  });
});
