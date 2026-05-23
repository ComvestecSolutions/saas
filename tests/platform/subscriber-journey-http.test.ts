import { Effect, ParseResult, Schema } from "effect";
import {
  actorType,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import {
  createProductAppAuthCallbackStateFromEnvironment,
  decodeProductAppAuthCallbackStateFromEnvironment,
  getPublicWebSnapshotForRequestContext,
} from "@comvestec/platform";
import {
  createSubscriberJourneyHttpHandler,
  type PublicAuthStartPreparation,
  type PublicAuthStartPreparationError,
  subscriberJourneySessionHeaderName,
  subscriberJourneyApiPath,
  type SubscriberJourneyService,
} from "@comvestec/platform";

const authRouteEnvironment = {
  PRODUCT_APP_BASE_URL: "http://localhost:3002",
  KEYCLOAK_CLIENT_SECRET: "http-test-state-secret",
};

const unexpectedSubscriberJourneyServiceEffect = <A>() =>
  Effect.die(new Error("Unexpected subscriber journey test service call."));

const buildPublicAuthStartPreparation = (
  input: Parameters<SubscriberJourneyService["preparePublicAuthStart"]>[0],
): Effect.Effect<PublicAuthStartPreparation, PublicAuthStartPreparationError> =>
  Effect.gen(function* () {
    const correlationId = input.correlationId ?? "corr_http_start";
    const requestContext = {
      actorType: actorType.anonymous,
      correlationId,
      host: input.host,
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    };
    const snapshot =
      yield* getPublicWebSnapshotForRequestContext(requestContext);

    return {
      correlationId,
      requestContext,
      tenant:
        input.tenantScopeHint === platformScope.individual
          ? {
              scope: platformScope.individual,
              scopeId: "usr_prepared_1",
              individualId: "usr_prepared_1",
            }
          : {
              scope: platformScope.organization,
              scopeId: "org_prepared_1",
              organizationId: "org_prepared_1",
            },
      enabledModules: [
        platformModuleId.tenantManagement,
        platformModuleId.identitySession,
        platformModuleId.billingAndMetering,
      ],
      snapshot,
    };
  });

const defaultPreparePublicAuthStart: SubscriberJourneyService["preparePublicAuthStart"] =
  (input) => buildPublicAuthStartPreparation(input);

const defaultResolveRequestContext: SubscriberJourneyService["resolveRequestContext"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultStartAuthentication: SubscriberJourneyService["startAuthentication"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultCompleteAuthentication: SubscriberJourneyService["completeAuthentication"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultCompletePlatformOperatorAuthentication: SubscriberJourneyService["completePlatformOperatorAuthentication"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultInvalidateSession: SubscriberJourneyService["invalidateSession"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultCreateCheckoutSession: SubscriberJourneyService["createCheckoutSession"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultProcessBillingWebhook: SubscriberJourneyService["processBillingWebhook"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultReplayBillingWebhook: SubscriberJourneyService["replayBillingWebhook"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultRunBillingConvergenceJob: SubscriberJourneyService["runBillingConvergenceJob"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultRunDueBillingConvergenceJobs: SubscriberJourneyService["runDueBillingConvergenceJobs"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultBuildProductBootstrap: SubscriberJourneyService["buildProductBootstrap"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const createSubscriberJourneyServiceDouble = (
  overrides: Partial<SubscriberJourneyService>,
): SubscriberJourneyService => ({
  listPublicPlans:
    overrides.listPublicPlans ?? unexpectedSubscriberJourneyServiceEffect(),
  preparePublicAuthStart:
    overrides.preparePublicAuthStart ?? defaultPreparePublicAuthStart,
  resolveRequestContext:
    overrides.resolveRequestContext ?? defaultResolveRequestContext,
  startAuthentication:
    overrides.startAuthentication ?? defaultStartAuthentication,
  completeAuthentication:
    overrides.completeAuthentication ?? defaultCompleteAuthentication,
  completePlatformOperatorAuthentication:
    overrides.completePlatformOperatorAuthentication ??
    defaultCompletePlatformOperatorAuthentication,
  invalidateSession: overrides.invalidateSession ?? defaultInvalidateSession,
  createCheckoutSession:
    overrides.createCheckoutSession ?? defaultCreateCheckoutSession,
  processBillingWebhook:
    overrides.processBillingWebhook ?? defaultProcessBillingWebhook,
  replayBillingWebhook:
    overrides.replayBillingWebhook ?? defaultReplayBillingWebhook,
  runBillingConvergenceJob:
    overrides.runBillingConvergenceJob ?? defaultRunBillingConvergenceJob,
  runDueBillingConvergenceJobs:
    overrides.runDueBillingConvergenceJobs ??
    defaultRunDueBillingConvergenceJobs,
  buildProductBootstrap:
    overrides.buildProductBootstrap ?? defaultBuildProductBootstrap,
});

const createTestHandler = (service: Partial<SubscriberJourneyService>) =>
  createSubscriberJourneyHttpHandler((use) =>
    use(createSubscriberJourneyServiceDouble(service)),
  );

const parseFailureEffect = <A>() =>
  Schema.decodeUnknown(Schema.Struct({ required: Schema.NonEmptyString }))({
    required: "",
  }) as Effect.Effect<A, ParseResult.ParseError>;

type SubscriberJourneyStartAuthenticationValidator = NonNullable<
  NonNullable<
    Parameters<typeof createSubscriberJourneyHttpHandler>[1]
  >["validateStartAuthentication"]
>;

type SubscriberJourneyCompleteAuthenticationHydrator = NonNullable<
  NonNullable<
    Parameters<typeof createSubscriberJourneyHttpHandler>[1]
  >["hydrateCompleteAuthentication"]
>;

const createValidatedTestHandler = (options: {
  readonly service: Partial<SubscriberJourneyService>;
  readonly validateStartAuthentication: SubscriberJourneyStartAuthenticationValidator;
  readonly hydrateCompleteAuthentication?: SubscriberJourneyCompleteAuthenticationHydrator;
}) =>
  createSubscriberJourneyHttpHandler(
    (use) => use(createSubscriberJourneyServiceDouble(options.service)),
    {
      validateStartAuthentication: options.validateStartAuthentication,
      ...(options.hydrateCompleteAuthentication === undefined
        ? {}
        : {
            hydrateCompleteAuthentication:
              options.hydrateCompleteAuthentication,
          }),
    },
  );

describe("platform subscriber journey http", () => {
  it("keeps the subscriber journey route registry scoped to subscriber-owned routes", () => {
    expect(subscriberJourneyApiPath).not.toHaveProperty(
      "processBillingWebhook",
    );
    expect(subscriberJourneyApiPath).not.toHaveProperty("replayBillingWebhook");
  });

  it("lists public plans through the backend-owned HTTP surface", async () => {
    const handler = createTestHandler({
      listPublicPlans: Effect.succeed([
        {
          planId: "plan_starter",
          planKey: "starter",
          displayName: "Starter",
          active: true,
          prices: [
            {
              priceId: "price_starter_month",
              interval: "month",
              currency: "USD",
              amountMinor: 1900,
              active: true,
              providerPriceId: "polar_price_starter_month",
            },
          ],
        },
      ]),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.listPublicPlans}`,
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plans: [
        expect.objectContaining({
          planId: "plan_starter",
          planKey: "starter",
        }),
      ],
    });
  });

  it("starts authentication through the backend-owned HTTP surface", async () => {
    const handler = createTestHandler({
      startAuthentication: (input) =>
        Effect.succeed({
          correlationId: input.requestContext.correlationId,
          redirect: {
            url: "http://localhost:8080/realms/comvestec/protocol/openid-connect/auth",
            realm: "comvestec",
            tenantHint: input.tenantHint,
            redirectUri: input.redirectUri,
          },
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.startAuthentication}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestContext: {
                actorType: actorType.anonymous,
                correlationId: "corr_http_start",
                tenant: {
                  scope: platformScope.platform,
                  scopeId: platformScope.platform,
                },
              },
              tenantHint: "org_http",
              redirectUri: "https://product.example.com/auth/callback",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        correlationId: "corr_http_start",
        redirect: expect.objectContaining({
          tenantHint: "org_http",
        }),
      }),
    );
  });

  it("resolves stored branding hints instead of forwarding caller-supplied auth-start branding", async () => {
    let capturedPreparationInput:
      | Parameters<SubscriberJourneyService["preparePublicAuthStart"]>[0]
      | undefined;
    let capturedInput:
      | Parameters<SubscriberJourneyService["startAuthentication"]>[0]
      | undefined;
    const handler = createTestHandler({
      preparePublicAuthStart: (input) => {
        capturedPreparationInput = input;

        return buildPublicAuthStartPreparation(input).pipe(
          Effect.map((preparation) => ({
            ...preparation,
            snapshot: {
              ...preparation.snapshot,
              branding: {
                ...preparation.snapshot.branding,
                companyName: "Stored Tenant",
                projection: {
                  ...preparation.snapshot.branding.projection,
                  companyName: "Stored Tenant",
                  themeTokens: {
                    ...preparation.snapshot.branding.projection.themeTokens,
                    primary: "#14532D",
                  },
                },
              },
            },
          })),
        );
      },
      startAuthentication: (input) => {
        capturedInput = input;

        return Effect.succeed({
          correlationId: input.requestContext.correlationId,
          redirect: {
            url: "http://localhost:8080/realms/comvestec/protocol/openid-connect/auth",
            realm: "comvestec",
            tenantHint: input.tenantHint,
            redirectUri: input.redirectUri,
          },
        });
      },
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.startAuthentication}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestContext: {
                actorType: actorType.anonymous,
                correlationId: "corr_http_start_stripped_hints",
                tenant: {
                  scope: platformScope.platform,
                  scopeId: platformScope.platform,
                },
              },
              tenantHint: "org_http",
              displayNameHint: "Spoofed Tenant",
              themeHint: "#111827",
              redirectUri: "https://product.example.com/auth/callback",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);

    expect(capturedPreparationInput).toEqual({
      correlationId: "corr_http_start_stripped_hints",
      host: "localhost",
      tenantHint: "org_http",
    });

    if (capturedInput === undefined) {
      throw new Error("Expected auth-start input to be captured.");
    }

    expect(capturedInput.displayNameHint).toBe("Stored Tenant");
    expect(capturedInput.themeHint).toBe("#14532D");
  });

  it("returns 502 when auth-start branding preparation hits a backend dependency failure", async () => {
    const handler = createTestHandler({
      preparePublicAuthStart: () =>
        Effect.fail({
          _tag: "BillingStatePostgresRepositoryQueryError",
          operation: "getTenantAccessState",
          cause: new Error("billing-state unavailable"),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.startAuthentication}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestContext: {
                actorType: actorType.anonymous,
                correlationId: "corr_http_start_dependency_failure",
                tenant: {
                  scope: platformScope.platform,
                  scopeId: platformScope.platform,
                },
              },
              tenantHint: "org_http",
              redirectUri: "https://product.example.com/auth/callback",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("returns 400 for invalid JSON payloads", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.startAuthentication}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: "{invalid-json",
          },
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be valid JSON.",
    });
  });

  it("returns 400 when auth start redirect targets fall outside the approved product callback boundary", async () => {
    const handler = createValidatedTestHandler({
      service: {},
      validateStartAuthentication: () =>
        Effect.fail({
          _tag: "ProductAppAuthCallbackRedirectNotAllowedError",
          redirectUri: "https://evil.example.com/auth/callback",
          expectedRedirectUri: "http://localhost:3002/auth/callback",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.startAuthentication}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestContext: {
                actorType: actorType.anonymous,
                correlationId: "corr_http_start_rejected",
                tenant: {
                  scope: platformScope.platform,
                  scopeId: platformScope.platform,
                },
              },
              tenantHint: "org_http",
              redirectUri: "https://evil.example.com/auth/callback",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request payload did not match the expected schema.",
    });
  });

  it("returns 400 when auth completion session payload does not match the shared keycloak input contract", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.completeAuthentication}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session: {
                unsupported: true,
              },
              state: "invalid-state",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request payload did not match the expected schema.",
    });
  });

  it("maps raw parse failures from subscriber journey execution to server errors", async () => {
    const handler = createSubscriberJourneyHttpHandler(() =>
      parseFailureEffect(),
    );

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.listPublicPlans}`,
          {
            method: "GET",
          },
        ),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Subscriber journey request failed.",
    });
  });

  it("hydrates auth completion from signed callback state instead of caller-owned tenant metadata", async () => {
    const completeAuthenticationState = await Effect.runPromise(
      createProductAppAuthCallbackStateFromEnvironment(authRouteEnvironment, {
        correlationId: "corr_http_complete",
        redirectUri: "http://localhost:3002/auth/callback",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_http_complete",
          enterpriseId: "ent_http_complete",
          organizationId: "org_http_complete",
        },
        enabledModules: [
          platformModuleId.tenantManagement,
          platformModuleId.identitySession,
          platformModuleId.billingAndMetering,
        ],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    let capturedInput:
      | Parameters<SubscriberJourneyService["completeAuthentication"]>[0]
      | undefined;
    const handler = createValidatedTestHandler({
      service: {
        completeAuthentication: (input) => {
          capturedInput = input;

          return Effect.succeed({
            requestContext: {
              actorType: actorType.organizationAdmin,
              actorId: "usr_http_complete",
              sessionId: "sess_http_complete",
              correlationId: input.correlationId,
              tenant: input.tenant,
            },
            session: {
              authenticated: true,
              sessionId: "sess_http_complete",
              actorId: "usr_http_complete",
              realm: "comvestec",
            },
            provisioning: {
              provisioningId: "prov_http_complete",
              tenantScope: input.tenant.scope,
              tenantScopeId: input.tenant.scopeId,
              actorId: "usr_http_complete",
              status: "provisioned",
              authorizationTuples: [],
              moduleAccess: input.enabledModules.map((moduleId) => ({
                moduleId,
                included: true,
              })),
            },
            onboardingPlan: {
              runId: "run_http_complete",
              tenantScope: input.tenant.scope,
              tenantScopeId: input.tenant.scopeId,
              enabledModules: input.enabledModules,
              currentStepId: undefined,
              steps: [],
            },
            lifecycleEvent: {
              eventId: "event_http_complete",
              sessionId: "sess_http_complete",
              actorId: "usr_http_complete",
              tenantScope: input.tenant.scope,
              tenantScopeId: input.tenant.scopeId,
              eventType: "auth.callback.completed",
              provider: "keycloak",
              metadata: {
                correlationId: input.correlationId,
                realm: "comvestec",
                tenantHint: input.tenant.scopeId,
                provisioningId: "prov_http_complete",
              },
            },
            onboarding: {
              runId: "run_http_complete",
              triggeredBy: "usr_http_complete",
              correlationId: input.correlationId,
              status: "in-progress",
              currentStepId: undefined,
              plan: {
                runId: "run_http_complete",
                tenantScope: input.tenant.scope,
                tenantScopeId: input.tenant.scopeId,
                enabledModules: input.enabledModules,
                currentStepId: undefined,
                steps: [],
              },
              metadata: {
                provider: "keycloak",
                realm: "comvestec",
                sessionId: "sess_http_complete",
              },
            },
          } as never);
        },
      },
      validateStartAuthentication: () => Effect.void,
      hydrateCompleteAuthentication: (input) =>
        decodeProductAppAuthCallbackStateFromEnvironment(
          authRouteEnvironment,
          input.state,
        ).pipe(
          Effect.map((statePayload) => ({
            session: input.session,
            correlationId: statePayload.correlationId,
            ...(input.host !== undefined ? { host: input.host } : {}),
            tenant: statePayload.tenant,
            enabledModules: statePayload.enabledModules,
          })),
        ),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.completeAuthentication}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session: {
                accessToken: "access-token",
              },
              state: completeAuthenticationState,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    if (capturedInput === undefined) {
      throw new Error("Expected hydrated completion input.");
    }

    expect(capturedInput.correlationId).toBe("corr_http_complete");
    expect(capturedInput.tenant).toEqual({
      scope: platformScope.organization,
      scopeId: "org_http_complete",
      enterpriseId: "ent_http_complete",
      organizationId: "org_http_complete",
    });
    expect(capturedInput.enabledModules).toEqual([
      platformModuleId.tenantManagement,
      platformModuleId.identitySession,
      platformModuleId.billingAndMetering,
    ]);
  });

  it("returns 502 when checkout-triggered Convex scheduling fails as a backend dependency", async () => {
    const handler = createTestHandler({
      createCheckoutSession: () =>
        Effect.fail({
          _tag: "ConvexAdapterRequestError",
          operation: "scheduleBillingReconciliationWorkflowJob",
          cause: new Error("convex down"),
          status: 503,
          body: "convex down",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.createCheckoutSession}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tenantScope: platformScope.organization,
              tenantScopeId: "org_http_checkout",
              planId: "plan_starter",
              priceId: "price_starter_month",
              successUrl: "http://localhost:3002/billing/success",
              cancelUrl: "http://localhost:3002/billing/cancel",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("resolves request context through the backend-owned session header", async () => {
    let capturedInput:
      | Parameters<SubscriberJourneyService["resolveRequestContext"]>[0]
      | undefined;
    const handler = createTestHandler({
      resolveRequestContext: (input) => {
        capturedInput = input;

        return Effect.succeed({
          actorType: actorType.organizationAdmin,
          actorId: "usr_http_request_context",
          sessionId: input.sessionId,
          correlationId: "corr_http_request_context",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_http_request_context",
            organizationId: "org_http_request_context",
          },
        } as const);
      },
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.resolveRequestContext}`,
          {
            method: "POST",
            headers: {
              [subscriberJourneySessionHeaderName]: "sess_http_request_context",
            },
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      requestContext: expect.objectContaining({
        sessionId: "sess_http_request_context",
      }),
    });
    expect(capturedInput).toEqual({
      sessionId: "sess_http_request_context",
    });
  });

  it("returns 401 when the subscriber session header is missing for request-context lookups", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.resolveRequestContext}`,
          {
            method: "POST",
            headers: {
              cookie: "comvestec_session=sess_cookie_only",
            },
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated session is required.",
    });
  });

  it("builds product bootstrap through the backend-owned session header", async () => {
    let capturedInput:
      | Parameters<SubscriberJourneyService["buildProductBootstrap"]>[0]
      | undefined;
    const handler = createTestHandler({
      buildProductBootstrap: (input) => {
        capturedInput = input;

        return Effect.succeed({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_http_bootstrap",
            sessionId: input.sessionId,
            correlationId: "corr_http_bootstrap",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_http_bootstrap",
              organizationId: "org_http_bootstrap",
            },
          },
          authorization: {
            allowed: true,
            reason: "Allowed by persisted authorization relation.",
            cacheKey: "bootstrap:http:org_http_bootstrap",
            auditRequired: false,
          },
        } as const);
      },
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.buildProductBootstrap}`,
          {
            method: "POST",
            headers: {
              [subscriberJourneySessionHeaderName]: "sess_http_bootstrap",
            },
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          sessionId: "sess_http_bootstrap",
        }),
      }),
    );
    expect(capturedInput).toEqual({
      sessionId: "sess_http_bootstrap",
    });
  });

  it("returns 401 when the subscriber session header is missing for product bootstrap", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.buildProductBootstrap}`,
          {
            method: "POST",
            headers: {
              cookie: "comvestec_session=sess_cookie_only",
            },
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated session is required.",
    });
  });

  it("returns 502 when product bootstrap authorization delegation fails as a backend dependency", async () => {
    const handler = createTestHandler({
      buildProductBootstrap: () =>
        Effect.fail({
          _tag: "AuthorizationDelegatedCheckError",
          reason: "Failed to evaluate persisted authorization relation.",
          cause: new Error("keto unavailable"),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.buildProductBootstrap}`,
          {
            method: "POST",
            headers: {
              [subscriberJourneySessionHeaderName]:
                "sess_http_bootstrap_dependency_failure",
            },
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("returns route-level Allow headers for unsupported subscriber journey methods", async () => {
    const handler = createTestHandler({});

    const startAuthenticationResponse = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.startAuthentication}`,
          {
            method: "GET",
          },
        ),
      ),
    );

    expect(startAuthenticationResponse.status).toBe(405);
    expect(startAuthenticationResponse.headers.get("Allow")).toBe("POST");
    await expect(startAuthenticationResponse.json()).resolves.toEqual({
      error: "Method not allowed.",
    });

    const listPublicPlansResponse = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${subscriberJourneyApiPath.listPublicPlans}`,
          {
            method: "POST",
          },
        ),
      ),
    );

    expect(listPublicPlansResponse.status).toBe(405);
    expect(listPublicPlansResponse.headers.get("Allow")).toBe("GET");
    await expect(listPublicPlansResponse.json()).resolves.toEqual({
      error: "Method not allowed.",
    });
  });

  it("returns 404 for unknown subscriber journey routes", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request("http://localhost/api/subscriber-journey/auth/unknown", {
          method: "POST",
        }),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Subscriber journey route not found.",
    });
  });

  it("returns 404 for unknown subscriber journey routes even when the method is unsupported", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request("http://localhost/api/subscriber-journey/auth/unknown", {
          method: "GET",
        }),
      ),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Allow")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "Subscriber journey route not found.",
    });
  });
});
