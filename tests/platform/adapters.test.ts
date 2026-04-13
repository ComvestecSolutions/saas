import { Effect } from "effect";
import {
  authorizationNamespace,
  authorizationRelation,
  billingPlanInterval,
  billingSubscriptionStatus,
  billingWebhookEventType,
  billingWebhookReconciliationAction,
  platformModuleId,
  telemetryKind,
} from "@comvestec/contracts";
import {
  makeConvexAdapter,
  makeGlitchtipAdapter,
  makeKeycloakAdapter,
  makeMeilisearchAdapter,
  makeNovuAdapter,
  makeObservabilityAdapter,
  makeOpenmeterAdapter,
  makeOryKetoAdapter,
  makePolarAdapter,
  makePostalAdapter,
  makePosthogAdapter,
  makeUnleashAdapter,
  makeValkeyAdapter,
  platformAdapterServiceName,
} from "@comvestec/platform";

describe("platform adapters", () => {
  it("creates healthy service adapters", async () => {
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        baseUrl: "http://localhost:8080",
        realm: "comvestec",
      }),
    );
    const convex = await Effect.runPromise(
      makeConvexAdapter({
        deploymentUrl: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
      }),
    );
    const observability = await Effect.runPromise(
      makeObservabilityAdapter({
        otlpHttpEndpoint: "http://localhost:4318",
        grafanaBaseUrl: "http://localhost:3001",
      }),
    );

    await expect(Effect.runPromise(keycloak.healthcheck)).resolves.toEqual({
      healthy: true,
      service: platformAdapterServiceName.keycloak,
    });
    await expect(
      Effect.runPromise(
        keycloak.buildLoginRedirect({
          tenantHint: "org_demo",
          returnHost: "product.example.com",
        }),
      ),
    ).resolves.toMatchObject({
      realm: "comvestec",
      tenantHint: "org_demo",
    });
    await expect(Effect.runPromise(convex.healthcheck)).resolves.toEqual({
      healthy: true,
      service: platformAdapterServiceName.convex,
    });
    await expect(Effect.runPromise(observability.healthcheck)).resolves.toEqual(
      {
        healthy: true,
        service: platformAdapterServiceName.observability,
      },
    );
  });

  it("creates healthy adapters for all new services", async () => {
    const valkey = await Effect.runPromise(
      makeValkeyAdapter({ url: "redis://localhost:6379" }),
    );
    const keto = await Effect.runPromise(
      makeOryKetoAdapter({
        readUrl: "http://localhost:4466",
        writeUrl: "http://localhost:4467",
      }),
    );
    const unleash = await Effect.runPromise(
      makeUnleashAdapter({
        url: "http://localhost:4242",
        apiKey: "test-api-key",
      }),
    );
    const glitchtip = await Effect.runPromise(
      makeGlitchtipAdapter({ dsn: "https://glitchtip.local/api/1/store/" }),
    );
    const observability = await Effect.runPromise(
      makeObservabilityAdapter({
        otlpHttpEndpoint: "http://localhost:4318",
        grafanaBaseUrl: "http://localhost:3001",
      }),
    );
    const posthog = await Effect.runPromise(
      makePosthogAdapter({
        apiKey: "phc_test",
        host: "http://localhost:8000",
      }),
    );
    const novu = await Effect.runPromise(
      makeNovuAdapter({
        apiKey: "novu-key",
        apiUrl: "http://localhost:3100",
      }),
    );
    const meilisearch = await Effect.runPromise(
      makeMeilisearchAdapter({
        url: "http://localhost:7700",
        apiKey: "meili-master-key",
      }),
    );
    const polar = await Effect.runPromise(
      makePolarAdapter({
        apiKey: "polar-key",
        apiUrl: "http://localhost:8888",
      }),
    );
    const openmeter = await Effect.runPromise(
      makeOpenmeterAdapter({
        url: "http://localhost:8889",
        apiKey: "openmeter-key",
      }),
    );
    const postal = await Effect.runPromise(
      makePostalAdapter({
        apiUrl: "http://localhost:5000",
        apiKey: "postal-key",
      }),
    );

    await expect(Effect.runPromise(valkey.healthcheck)).resolves.toMatchObject({
      healthy: true,
    });
    await expect(
      Effect.runPromise(
        valkey.incrementCounter({ key: "quota:org_1", incrementBy: 1 }),
      ),
    ).resolves.toMatchObject({ key: "quota:org_1", value: 1 });
    await expect(
      Effect.runPromise(
        keto.writeTuple({
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.viewer,
          subject: "usr_1",
        }),
      ),
    ).resolves.toMatchObject({
      namespace: authorizationNamespace.tenant,
      object: "org_1",
    });
    await expect(Effect.runPromise(keto.healthcheck)).resolves.toMatchObject({
      healthy: true,
    });
    await expect(
      Effect.runPromise(
        keto.check({
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.viewer,
          subject: "usr_1",
        }),
      ),
    ).resolves.toMatchObject({ allowed: true });
    await expect(Effect.runPromise(unleash.healthcheck)).resolves.toMatchObject(
      { healthy: true },
    );
    await expect(
      Effect.runPromise(glitchtip.healthcheck),
    ).resolves.toMatchObject({ healthy: true });
    await expect(Effect.runPromise(posthog.healthcheck)).resolves.toMatchObject(
      { healthy: true },
    );
    await expect(
      Effect.runPromise(
        observability.emit({
          kind: telemetryKind.trace,
          service: "platform",
          payload: { correlationId: "corr_1" },
        }),
      ),
    ).resolves.toMatchObject({
      kind: telemetryKind.trace,
      service: "platform",
    });
    await expect(
      Effect.runPromise(
        observability.emit({
          kind: telemetryKind.audit,
          service: "platform",
          payload: { correlationId: "corr_2" },
        }),
      ),
    ).resolves.toMatchObject({
      kind: telemetryKind.audit,
      service: "platform",
    });
    await expect(Effect.runPromise(novu.healthcheck)).resolves.toMatchObject({
      healthy: true,
    });
    await expect(
      Effect.runPromise(meilisearch.healthcheck),
    ).resolves.toMatchObject({ healthy: true });
    await expect(Effect.runPromise(polar.healthcheck)).resolves.toMatchObject({
      healthy: true,
    });
    await expect(Effect.runPromise(polar.listPlans)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          planId: "plan_starter",
          prices: expect.arrayContaining([
            expect.objectContaining({ interval: billingPlanInterval.month }),
            expect.objectContaining({ interval: billingPlanInterval.year }),
          ]),
        }),
      ]),
    );
    await expect(
      Effect.runPromise(
        polar.createCheckoutSession({
          planId: "plan_starter",
          priceId: "price_starter_year",
          successUrl: "http://localhost:3002/billing/success",
          cancelUrl: "http://localhost:3002/billing/cancel",
          tenantScope: "organization",
          tenantScopeId: "org_1",
        }),
      ),
    ).resolves.toMatchObject({
      planId: "plan_starter",
      priceId: "price_starter_year",
      interval: billingPlanInterval.year,
      provider: "polar",
    });
    await expect(
      Effect.runPromise(openmeter.healthcheck),
    ).resolves.toMatchObject({ healthy: true });
    await expect(
      Effect.runPromise(
        openmeter.ingestUsage({
          subject: "org_1",
          eventName: "custom-domain.created",
          quantity: 1,
          capturedAt: new Date().toISOString(),
        }),
      ),
    ).resolves.toMatchObject({ eventName: "custom-domain.created" });
    await expect(Effect.runPromise(postal.healthcheck)).resolves.toMatchObject({
      healthy: true,
    });
  });

  it("creates checkout sessions for configured backend plan catalogs", async () => {
    const polar = await Effect.runPromise(
      makePolarAdapter({
        apiKey: "polar-key",
        apiUrl: "http://localhost:8888",
        plans: [
          {
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
                providerPriceId: "polar_price_growth_month",
              },
              {
                priceId: "price_growth_year",
                interval: billingPlanInterval.year,
                currency: "USD",
                amountMinor: 29000,
                active: true,
                providerPriceId: "polar_price_growth_year",
              },
            ],
            entitlements: [
              {
                moduleId: platformModuleId.tenantManagement,
                included: true,
                meteringMode: "none",
                enforcementMode: "none",
              },
            ],
          },
        ],
      }),
    );

    await expect(Effect.runPromise(polar.listPlans)).resolves.toEqual([
      expect.objectContaining({
        planId: "plan_growth",
        prices: expect.arrayContaining([
          expect.objectContaining({ priceId: "price_growth_month" }),
          expect.objectContaining({ priceId: "price_growth_year" }),
        ]),
      }),
    ]);
    await expect(
      Effect.runPromise(
        polar.createCheckoutSession({
          planId: "plan_growth",
          priceId: "price_growth_month",
          successUrl: "http://localhost:3002/billing/success",
          cancelUrl: "http://localhost:3002/billing/cancel",
          tenantScope: "organization",
          tenantScopeId: "org_growth",
        }),
      ),
    ).resolves.toMatchObject({
      checkoutSessionId: expect.stringContaining("org_growth"),
      priceId: "price_growth_month",
      interval: billingPlanInterval.month,
    });
  });

  it("normalizes verified polar webhook deliveries into billing reconciliation", async () => {
    const polar = await Effect.runPromise(
      makePolarAdapter({
        apiKey: "polar-key",
        apiUrl: "http://localhost:8888",
      }),
    );

    await expect(
      Effect.runPromise(
        polar.reconcileWebhookEvent({
          provider: platformAdapterServiceName.polar,
          deliveryId: "wh_1",
          eventId: "evt_1",
          eventType: billingWebhookEventType.checkoutCompleted,
          occurredAt: new Date().toISOString(),
          verifiedSignature: true,
          subscriptionId: "sub_1",
          tenantScope: "organization",
          tenantScopeId: "org_1",
          planId: "plan_starter",
          priceId: "price_starter_month",
          customerId: "cus_1",
          currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      ),
    ).resolves.toMatchObject({
      action: billingWebhookReconciliationAction.activate,
      event: {
        eventType: billingWebhookEventType.checkoutCompleted,
        planId: "plan_starter",
      },
      subscription: {
        status: billingSubscriptionStatus.active,
        interval: billingPlanInterval.month,
      },
      entitlementsActive: true,
    });
  });

  it("rejects unverified polar webhook deliveries", async () => {
    const polar = await Effect.runPromise(
      makePolarAdapter({
        apiKey: "polar-key",
        apiUrl: "http://localhost:8888",
      }),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          polar.reconcileWebhookEvent({
            provider: platformAdapterServiceName.polar,
            deliveryId: "wh_unverified",
            eventId: "evt_unverified",
            eventType: billingWebhookEventType.paymentFailed,
            occurredAt: new Date().toISOString(),
            verifiedSignature: false,
            subscriptionId: "sub_2",
            tenantScope: "organization",
            tenantScopeId: "org_1",
            planId: "plan_starter",
            priceId: "price_starter_year",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "PolarWebhookSignatureError",
      deliveryId: "wh_unverified",
    });
  });

  it("bounds the valkey in-memory counter cache", async () => {
    const valkey = await Effect.runPromise(
      makeValkeyAdapter({ url: "redis://localhost:6379", maxCacheSize: 1 }),
    );

    await Effect.runPromise(
      valkey.incrementCounter({ key: "quota:org_1", incrementBy: 1 }),
    );
    await Effect.runPromise(
      valkey.incrementCounter({ key: "quota:org_2", incrementBy: 1 }),
    );

    await expect(
      Effect.runPromise(
        valkey.incrementCounter({ key: "quota:org_1", incrementBy: 1 }),
      ),
    ).resolves.toMatchObject({ key: "quota:org_1", value: 1 });
  });

  it("bounds the ory keto in-memory tuple cache", async () => {
    const keto = await Effect.runPromise(
      makeOryKetoAdapter({
        readUrl: "http://localhost:4466",
        writeUrl: "http://localhost:4467",
        maxCacheSize: 1,
      }),
    );

    await Effect.runPromise(
      keto.writeTuple({
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        subject: "usr_1",
      }),
    );
    await Effect.runPromise(
      keto.writeTuple({
        namespace: authorizationNamespace.tenant,
        object: "org_2",
        relation: authorizationRelation.viewer,
        subject: "usr_2",
      }),
    );

    await expect(
      Effect.runPromise(
        keto.check({
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.viewer,
          subject: "usr_1",
        }),
      ),
    ).resolves.toMatchObject({ allowed: false });
    await expect(
      Effect.runPromise(
        keto.check({
          namespace: authorizationNamespace.tenant,
          object: "org_2",
          relation: authorizationRelation.viewer,
          subject: "usr_2",
        }),
      ),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("rejects empty runtime configuration at adapter boundaries", async () => {
    const keycloakResult = await Effect.runPromise(
      Effect.either(
        makeKeycloakAdapter({
          baseUrl: "",
          realm: "comvestec",
        }),
      ),
    );
    const postalResult = await Effect.runPromise(
      Effect.either(
        makePostalAdapter({
          apiUrl: "http://localhost:5000",
          apiKey: "",
        }),
      ),
    );
    const observability = await Effect.runPromise(
      makeObservabilityAdapter({
        otlpHttpEndpoint: "http://localhost:4318",
        grafanaBaseUrl: "http://localhost:3001",
      }),
    );
    const emissionResult = await Effect.runPromise(
      Effect.either(
        observability.emit({
          kind: telemetryKind.trace,
          service: "",
          payload: { correlationId: "corr_3" },
        }),
      ),
    );

    expect(keycloakResult._tag).toBe("Left");
    expect(postalResult._tag).toBe("Left");
    expect(emissionResult._tag).toBe("Left");
  });
});
