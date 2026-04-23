import { Effect } from "effect";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  billingEnforcementMode,
  billingMeteringMode,
  billingPlanInterval,
  billingPlanVisibility,
  billingSubscriptionStatus,
  billingWebhookEventType,
  billingWebhookReconciliationAction,
  platformModuleId,
  platformScope,
  telemetryKind,
} from "@comvestec/contracts";
import {
  makeConvexAdapter,
  makeGlitchtipAdapter,
  makeKeycloakAdapter,
  makeMeilisearchAdapter,
  makeNovuAdapter,
  makeOpenPanelAdapter,
  makeObservabilityAdapter,
  makeOpenmeterAdapter,
  makeOryKetoAdapter,
  makePolarAdapter,
  makePostgresAdapter,
  makePostgresAdapterFromEnvironment,
  makePostalAdapter,
  makeUnleashAdapter,
  makeValkeyAdapter,
  platformAdapterServiceName,
} from "@comvestec/platform";
import {
  createKeycloakTestOptions,
  createOryKetoTestOptions,
  createPolarTestOptions,
  createValkeyTestClient,
  defaultTestBillingPlans,
} from "../platform-adapter-doubles";

describe("platform adapters", () => {
  it("creates healthy service adapters", async () => {
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter(createKeycloakTestOptions()),
    );
    const convex = await Effect.runPromise(
      makeConvexAdapter({
        deploymentUrl: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
        adminKey: "convex-admin-key",
        keycloakBaseUrl: "http://127.0.0.1:8080",
        keycloakRealm: "comvestec",
        keycloakClientId: "saas-platform",
        keycloakClientSecret: "change-me",
        keycloakConvexServiceActorUsername: "convex.billing.service",
        keycloakConvexServiceActorPassword: "service-secret",
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
          redirectUri: "https://product.example.com/auth/callback",
        }),
      ),
    ).resolves.toMatchObject({
      realm: "comvestec",
      tenantHint: "org_demo",
      redirectUri: "https://product.example.com/auth/callback",
    });
    await expect(
      Effect.runPromise(
        keycloak.validateSession({ accessToken: "access-token" }),
      ),
    ).resolves.toMatchObject({
      actorId: "usr_token",
      sessionId: "sess_token",
      realm: "comvestec",
    });
    await expect(
      Effect.runPromise(
        keycloak.issueIdTokenWithPasswordGrant({
          username: "convex.billing.service",
          password: "service-secret",
        }),
      ),
    ).resolves.toBe("id-token");
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
      makeValkeyAdapter({
        url: "redis://localhost:6379",
        client: createValkeyTestClient(),
      }),
    );
    const keto = await Effect.runPromise(
      makeOryKetoAdapter(createOryKetoTestOptions()),
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
    const openpanel = await Effect.runPromise(
      makeOpenPanelAdapter({
        clientId: "client_demo",
        apiUrl: "http://localhost:3005/api",
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
      makePolarAdapter(createPolarTestOptions()),
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
        valkey.writeSession({
          sessionId: "sess_1",
          requestContext: {
            actorType: actorType.organizationMember,
            actorId: "usr_1",
            sessionId: "sess_1",
            correlationId: "corr_1",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_1",
              enterpriseId: "ent_1",
              organizationId: "org_1",
              individualId: "usr_1",
            },
          },
        }),
      ),
    ).resolves.toMatchObject({ sessionId: "sess_1" });
    await expect(
      Effect.runPromise(valkey.readSession({ sessionId: "sess_1" })),
    ).resolves.toMatchObject({
      requestContext: {
        actorId: "usr_1",
        tenant: { scopeId: "org_1" },
      },
    });
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
    await expect(
      Effect.runPromise(openpanel.healthcheck),
    ).resolves.toMatchObject({ healthy: true });
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
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
        }),
      ),
    ).resolves.toMatchObject({
      planId: "plan_starter",
      priceId: "price_starter_year",
      interval: billingPlanInterval.year,
      provider: platformAdapterServiceName.polar,
    });
    await expect(
      Effect.runPromise(
        polar.createManagedBillingPlan({
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
        }),
      ),
    ).resolves.toMatchObject({
      plan: expect.objectContaining({
        planKey: "scale",
        displayName: "Scale",
        prices: [
          expect.objectContaining({
            interval: billingPlanInterval.month,
            amountMinor: 4900,
          }),
        ],
      }),
      visibility: billingPlanVisibility.draft,
      provider: platformAdapterServiceName.polar,
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

  it("normalizes Polar SDK base URLs that already include /v1", async () => {
    let requestedUrl: string | undefined;

    const polar = await Effect.runPromise(
      makePolarAdapter({
        apiKey: "polar-key",
        apiUrl: "http://localhost:8888/v1",
        fetch: async (input) => {
          requestedUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;

          return new Response(
            JSON.stringify({
              items: [],
              pagination: {
                total_count: 0,
                max_page: 0,
              },
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        },
      }),
    );

    await expect(Effect.runPromise(polar.listPlans)).resolves.toEqual([]);
    expect(requestedUrl).toContain("/v1/products");
    expect(requestedUrl).not.toContain("/v1/v1/products");
  });

  it("creates a postgres adapter with an explicit runtime connection seam", async () => {
    const postgres = await Effect.runPromise(
      makePostgresAdapter({
        connectionString:
          "postgresql://postgres:postgres@127.0.0.1:1/comvestec",
        connectionTimeoutMs: 50,
      }),
    );

    expect(postgres.serviceName).toBe(platformAdapterServiceName.postgres);
    expect(postgres.connectionStringName).toBe("POSTGRES_URL");
    await expect(
      Effect.runPromiseExit(postgres.healthcheck),
    ).resolves.toMatchObject({
      _tag: "Failure",
    });
    await expect(Effect.runPromise(postgres.close)).resolves.toBeUndefined();
  });

  it("requires POSTGRES_URL when creating a postgres adapter from environment", async () => {
    await expect(
      Effect.runPromiseExit(makePostgresAdapterFromEnvironment({})),
    ).resolves.toMatchObject({
      _tag: "Failure",
    });
  });

  it("creates checkout sessions for configured backend plan catalogs", async () => {
    const polar = await Effect.runPromise(
      makePolarAdapter(
        createPolarTestOptions({
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
                  meteringMode: billingMeteringMode.none,
                  enforcementMode: billingEnforcementMode.none,
                },
              ],
            },
          ],
        }),
      ),
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
          tenantScope: platformScope.organization,
          tenantScopeId: "org_growth",
        }),
      ),
    ).resolves.toMatchObject({
      checkoutSessionId: "checkout:plan_growth:price_growth_month",
      priceId: "price_growth_month",
      interval: billingPlanInterval.month,
    });
  });

  it("sends lowercase currency codes to the polar sdk for managed plans", async () => {
    const polarOptions = createPolarTestOptions();
    let capturedRequest:
      | Parameters<
          NonNullable<typeof polarOptions.sdkClient>["products"]["create"]
        >[0]
      | undefined;

    const polar = await Effect.runPromise(
      makePolarAdapter({
        ...polarOptions,
        sdkClient: {
          ...polarOptions.sdkClient!,
          products: {
            ...polarOptions.sdkClient!.products,
            create: async (request) => {
              capturedRequest = request;

              return {
                id: "plan_seed_scale",
                name: request.name,
                description: request.description ?? null,
                recurringInterval: request.recurringInterval,
                recurringIntervalCount: request.recurringIntervalCount ?? 1,
                visibility: request.visibility ?? "draft",
                isArchived: false,
                metadata: request.metadata ?? {},
                prices: request.prices.map((price, index) => ({
                  id: `price_seed_scale_${index + 1}`,
                  recurringInterval: request.recurringInterval,
                  priceCurrency: price.priceCurrency ?? "usd",
                  priceAmount: price.priceAmount,
                  isArchived: false,
                })),
              };
            },
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        polar.createManagedBillingPlan({
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
        }),
      ),
    ).resolves.toMatchObject({
      plan: expect.objectContaining({
        planKey: "scale",
      }),
    });

    expect(capturedRequest?.prices[0]?.priceCurrency).toBe("usd");
  });

  it("returns the existing public managed plan instead of creating a duplicate", async () => {
    const existingScalePlan = defaultTestBillingPlans.find(
      (plan) => plan.planKey === "scale",
    );

    expect(existingScalePlan).toBeDefined();

    if (existingScalePlan === undefined) {
      return;
    }

    const polarOptions = createPolarTestOptions();
    let createCallCount = 0;

    const polar = await Effect.runPromise(
      makePolarAdapter({
        ...polarOptions,
        sdkClient: {
          ...polarOptions.sdkClient!,
          products: {
            ...polarOptions.sdkClient!.products,
            create: async (request) => {
              createCallCount += 1;

              return polarOptions.sdkClient!.products.create(request);
            },
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        polar.createManagedBillingPlan({
          planKey: existingScalePlan.planKey,
          displayName: existingScalePlan.displayName,
          description: existingScalePlan.description,
          visibility: billingPlanVisibility.public,
          price: {
            interval: existingScalePlan.prices[0]!.interval,
            currency: existingScalePlan.prices[0]!.currency,
            amountMinor: existingScalePlan.prices[0]!.amountMinor,
          },
          entitlements: existingScalePlan.entitlements,
        }),
      ),
    ).resolves.toMatchObject({
      plan: expect.objectContaining({
        planId: existingScalePlan.planId,
        planKey: existingScalePlan.planKey,
      }),
      visibility: billingPlanVisibility.public,
      provider: platformAdapterServiceName.polar,
    });

    expect(createCallCount).toBe(0);
  });

  it("updates duplicate managed products into a different canonical plan", async () => {
    const starterPlan = defaultTestBillingPlans.find(
      (plan) => plan.planKey === "starter",
    );
    const growthPlan = defaultTestBillingPlans.find(
      (plan) => plan.planKey === "growth",
    );

    expect(starterPlan).toBeDefined();
    expect(growthPlan).toBeDefined();

    if (starterPlan === undefined || growthPlan === undefined) {
      return;
    }

    const polar = await Effect.runPromise(
      makePolarAdapter(createPolarTestOptions()),
    );

    await expect(
      Effect.runPromise(
        polar.updateManagedBillingPlan(starterPlan.planId, {
          planKey: growthPlan.planKey,
          displayName: growthPlan.displayName,
          description: growthPlan.description,
          visibility: billingPlanVisibility.public,
          price: {
            interval: growthPlan.prices[0]!.interval,
            currency: growthPlan.prices[0]!.currency,
            amountMinor: growthPlan.prices[0]!.amountMinor,
          },
          entitlements: growthPlan.entitlements,
        }),
      ),
    ).resolves.toMatchObject({
      plan: expect.objectContaining({
        planId: starterPlan.planId,
        planKey: growthPlan.planKey,
        displayName: growthPlan.displayName,
        prices: [
          expect.objectContaining({
            interval: growthPlan.prices[0]!.interval,
            amountMinor: growthPlan.prices[0]!.amountMinor,
          }),
        ],
      }),
      visibility: billingPlanVisibility.public,
      provider: platformAdapterServiceName.polar,
    });
  });

  it("archives managed products that should be removed from the public catalog", async () => {
    const scalePlan = defaultTestBillingPlans.find(
      (plan) => plan.planKey === "scale",
    );

    expect(scalePlan).toBeDefined();

    if (scalePlan === undefined) {
      return;
    }

    const polar = await Effect.runPromise(
      makePolarAdapter(createPolarTestOptions()),
    );

    await expect(
      Effect.runPromise(polar.archiveManagedBillingPlan(scalePlan.planId)),
    ).resolves.toMatchObject({
      plan: expect.objectContaining({
        planId: scalePlan.planId,
        active: false,
      }),
      provider: platformAdapterServiceName.polar,
    });

    await expect(Effect.runPromise(polar.listPlans)).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ planId: scalePlan.planId }),
      ]),
    );
  });

  it("normalizes verified polar webhook deliveries into billing reconciliation", async () => {
    const polar = await Effect.runPromise(
      makePolarAdapter(createPolarTestOptions()),
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
          tenantScope: platformScope.organization,
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
      makePolarAdapter(createPolarTestOptions()),
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
            tenantScope: platformScope.organization,
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

  it("supports counter and session operations through the valkey client seam", async () => {
    const valkey = await Effect.runPromise(
      makeValkeyAdapter({
        url: "redis://localhost:6379",
        client: createValkeyTestClient(),
      }),
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
    ).resolves.toMatchObject({ key: "quota:org_1", value: 2 });
    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_old",
        requestContext: {
          actorType: actorType.organizationMember,
          actorId: "usr_old",
          sessionId: "sess_old",
          correlationId: "corr_old",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_old",
            enterpriseId: "ent_old",
            organizationId: "org_old",
            individualId: "usr_old",
          },
        },
      }),
    );
    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_new",
        requestContext: {
          actorType: actorType.organizationMember,
          actorId: "usr_new",
          sessionId: "sess_new",
          correlationId: "corr_new",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_new",
            enterpriseId: "ent_new",
            organizationId: "org_new",
            individualId: "usr_new",
          },
        },
      }),
    );
    await expect(
      Effect.runPromise(valkey.readSession({ sessionId: "sess_old" })),
    ).resolves.toMatchObject({ sessionId: "sess_old" });
    await expect(
      Effect.runPromise(valkey.readSession({ sessionId: "sess_new" })),
    ).resolves.toMatchObject({ sessionId: "sess_new" });
    await expect(Effect.runPromise(valkey.close)).resolves.toBeUndefined();
  });

  it("checks permissions through the ory keto HTTP seam", async () => {
    const keto = await Effect.runPromise(
      makeOryKetoAdapter(createOryKetoTestOptions()),
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
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      Effect.runPromise(
        keto.check({
          namespace: authorizationNamespace.tenant,
          object: "org_missing",
          relation: authorizationRelation.viewer,
          subject: "usr_missing",
        }),
      ),
    ).resolves.toMatchObject({ allowed: false });
  });

  it("rejects empty runtime configuration at adapter boundaries", async () => {
    const keycloakResult = await Effect.runPromise(
      Effect.either(
        makeKeycloakAdapter({
          baseUrl: "",
          realm: "comvestec",
          clientId: "saas-platform",
          clientSecret: "change-me",
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
