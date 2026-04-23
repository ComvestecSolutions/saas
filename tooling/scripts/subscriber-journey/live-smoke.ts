import { Effect, ParseResult, Schema } from "effect";
import { resolveDefaultTenantOnboardingEnabledModules } from "@comvestec/config";
import {
  actorType,
  BillingCheckoutSessionSchema,
  PlatformModuleIdSchema,
  platformScope,
  PublicBillingPlanCatalogSchema,
  RequestContextSchema,
} from "@comvestec/contracts";
import {
  IdentitySessionCompletionResultSchema,
  IdentitySessionStartResultSchema,
} from "@comvestec/modules";
import {
  createProductAppAuthCallbackStateFromEnvironment,
  subscriberJourneyApiPath,
} from "@comvestec/platform";
import {
  hostFromUrlString,
  issueKeycloakPasswordGrant,
  printToolingScriptError,
  requestJson,
  requireConfiguredValue,
  resolveOptionalOverride,
  subscriberJourneySmokeDefaults,
} from "./common";

const SubscriberJourneyLiveSmokeEnvironmentSchema = Schema.Struct({
  SUBSCRIBER_JOURNEY_API_PORT: Schema.NonEmptyString,
  SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL: Schema.optional(Schema.NonEmptyString),
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  POLAR_WEBHOOK_SECRET: Schema.NonEmptyString,
  APP_BASE_URL: Schema.NonEmptyString,
  PRODUCT_APP_PORT: Schema.NonEmptyString,
  SUBSCRIBER_JOURNEY_SMOKE_REDIRECT_URI: Schema.optional(Schema.NonEmptyString),
  SUBSCRIBER_JOURNEY_SMOKE_SUCCESS_URL: Schema.optional(Schema.NonEmptyString),
  SUBSCRIBER_JOURNEY_SMOKE_CANCEL_URL: Schema.optional(Schema.NonEmptyString),
  SUBSCRIBER_JOURNEY_SMOKE_USER_USERNAME: Schema.optional(
    Schema.NonEmptyString,
  ),
  SUBSCRIBER_JOURNEY_SMOKE_USER_PASSWORD: Schema.optional(
    Schema.NonEmptyString,
  ),
  SUBSCRIBER_JOURNEY_SMOKE_TENANT_ID: Schema.optional(Schema.NonEmptyString),
  SUBSCRIBER_JOURNEY_SMOKE_ENTERPRISE_ID: Schema.optional(
    Schema.NonEmptyString,
  ),
});

const SubscriberJourneyPlanListResponseSchema = Schema.Struct({
  plans: PublicBillingPlanCatalogSchema,
});

const SubscriberJourneyBootstrapResultSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  authorization: Schema.Struct({
    allowed: Schema.Boolean,
    reason: Schema.NonEmptyString,
  }),
  snapshot: Schema.optional(
    Schema.Struct({
      application: Schema.NonEmptyString,
    }),
  ),
  billingStatus: Schema.optional(
    Schema.Struct({
      plan: Schema.optional(Schema.NonEmptyString),
      billingInterval: Schema.optional(Schema.NonEmptyString),
      status: Schema.optional(Schema.NonEmptyString),
      currentPeriodEnd: Schema.optional(Schema.NonEmptyString),
    }),
  ),
  enabledModules: Schema.optional(Schema.Array(PlatformModuleIdSchema)),
});

type SubscriberJourneyLiveSmokeEnvironment = Schema.Schema.Type<
  typeof SubscriberJourneyLiveSmokeEnvironmentSchema
>;

const decodeLiveSmokeEnvironment = Schema.decodeUnknown(
  SubscriberJourneyLiveSmokeEnvironmentSchema,
);

const decodePlanListResponse = Schema.decodeUnknown(
  SubscriberJourneyPlanListResponseSchema,
);

const decodeBootstrapResponse = Schema.decodeUnknown(
  SubscriberJourneyBootstrapResultSchema,
);

const resolveSmokeFixture = (
  environment: SubscriberJourneyLiveSmokeEnvironment,
) => ({
  username: resolveOptionalOverride(
    environment.SUBSCRIBER_JOURNEY_SMOKE_USER_USERNAME,
    subscriberJourneySmokeDefaults.username,
  ),
  password: resolveOptionalOverride(
    environment.SUBSCRIBER_JOURNEY_SMOKE_USER_PASSWORD,
    subscriberJourneySmokeDefaults.password,
  ),
  tenantId: resolveOptionalOverride(
    environment.SUBSCRIBER_JOURNEY_SMOKE_TENANT_ID,
    subscriberJourneySmokeDefaults.tenantId,
  ),
  enterpriseId: resolveOptionalOverride(
    environment.SUBSCRIBER_JOURNEY_SMOKE_ENTERPRISE_ID,
    subscriberJourneySmokeDefaults.enterpriseId,
  ),
  redirectUri: resolveOptionalOverride(
    environment.SUBSCRIBER_JOURNEY_SMOKE_REDIRECT_URI,
    `http://localhost:${environment.PRODUCT_APP_PORT}/auth/callback`,
  ),
  successUrl: resolveOptionalOverride(
    environment.SUBSCRIBER_JOURNEY_SMOKE_SUCCESS_URL,
    `http://localhost:${environment.PRODUCT_APP_PORT}/billing/success`,
  ),
  cancelUrl: resolveOptionalOverride(
    environment.SUBSCRIBER_JOURNEY_SMOKE_CANCEL_URL,
    `http://localhost:${environment.PRODUCT_APP_PORT}/billing/cancel`,
  ),
});

const createApiUrl = (apiBaseUrl: string, pathname: string) =>
  new URL(pathname, apiBaseUrl).toString();

const createJsonPost = <A>(options: {
  readonly operation: string;
  readonly url: string;
  readonly body: unknown;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError>;
}) =>
  requestJson({
    operation: options.operation,
    url: options.url,
    init: {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options.body),
    },
    decode: options.decode,
  });

const main = Effect.gen(function* () {
  const environment = yield* decodeLiveSmokeEnvironment(Bun.env);
  const smokeFixture = resolveSmokeFixture(environment);
  const requestHost = yield* hostFromUrlString(
    smokeFixture.redirectUri,
    "SUBSCRIBER_JOURNEY_SMOKE_REDIRECT_URI",
  );

  yield* requireConfiguredValue(
    "POLAR_ACCESS_TOKEN",
    environment.POLAR_ACCESS_TOKEN,
  );
  yield* requireConfiguredValue(
    "POLAR_WEBHOOK_SECRET",
    environment.POLAR_WEBHOOK_SECRET,
  );

  const apiBaseUrl = `http://127.0.0.1:${environment.SUBSCRIBER_JOURNEY_API_PORT}`;
  const localWebhookUrl = createApiUrl(
    apiBaseUrl,
    subscriberJourneyApiPath.processBillingWebhook,
  );
  const localReplayUrl = createApiUrl(
    apiBaseUrl,
    subscriberJourneyApiPath.replayBillingWebhook,
  );
  const correlationId = `corr_smoke_${Date.now()}`;
  const enabledModules = resolveDefaultTenantOnboardingEnabledModules();
  const authCompletionState =
    yield* createProductAppAuthCallbackStateFromEnvironment(
      {
        PRODUCT_APP_BASE_URL: new URL(smokeFixture.redirectUri).origin,
        KEYCLOAK_CLIENT_SECRET: environment.KEYCLOAK_CLIENT_SECRET,
      },
      {
        correlationId,
        redirectUri: smokeFixture.redirectUri,
        tenant: {
          scope: platformScope.organization,
          scopeId: smokeFixture.tenantId,
          enterpriseId: smokeFixture.enterpriseId,
          organizationId: smokeFixture.tenantId,
        },
        enabledModules,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
    );

  console.log("Calling the backend-owned subscriber journey API...");

  const planListResponse = yield* requestJson({
    operation: "subscriberJourney.listPublicPlans",
    url: createApiUrl(apiBaseUrl, subscriberJourneyApiPath.listPublicPlans),
    decode: decodePlanListResponse,
  });

  const selectedPlan = planListResponse.plans[0];
  const selectedPrice = selectedPlan?.prices[0];

  if (selectedPlan === undefined || selectedPrice === undefined) {
    return yield* Effect.fail({
      _tag: "ToolingScriptConfigurationError",
      key: "POLAR_ACCESS_TOKEN",
      message:
        "The public billing catalog is empty. Confirm Polar has at least one public plan and price before running the live smoke kickoff.",
    } as const);
  }

  const authStart = yield* createJsonPost({
    operation: "subscriberJourney.startAuthentication",
    url: createApiUrl(apiBaseUrl, subscriberJourneyApiPath.startAuthentication),
    body: {
      requestContext: {
        actorType: actorType.anonymous,
        correlationId,
        host: requestHost,
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      },
      tenantHint: smokeFixture.tenantId,
      redirectUri: smokeFixture.redirectUri,
      state: authCompletionState,
    },
    decode: Schema.decodeUnknown(IdentitySessionStartResultSchema),
  });

  const keycloakAccessToken = yield* issueKeycloakPasswordGrant({
    baseUrl: environment.KEYCLOAK_BASE_URL,
    realm: environment.KEYCLOAK_REALM,
    clientId: environment.KEYCLOAK_CLIENT_ID,
    clientSecret: environment.KEYCLOAK_CLIENT_SECRET,
    username: smokeFixture.username,
    password: smokeFixture.password,
  });

  const authCompletion = yield* createJsonPost({
    operation: "subscriberJourney.completeAuthentication",
    url: createApiUrl(
      apiBaseUrl,
      subscriberJourneyApiPath.completeAuthentication,
    ),
    body: {
      session: {
        accessToken: keycloakAccessToken,
      },
      host: requestHost,
      state: authCompletionState,
    },
    decode: Schema.decodeUnknown(IdentitySessionCompletionResultSchema),
  });

  const bootstrap = yield* createJsonPost({
    operation: "subscriberJourney.buildProductBootstrap",
    url: createApiUrl(
      apiBaseUrl,
      subscriberJourneyApiPath.buildProductBootstrap,
    ),
    body: {
      sessionId: authCompletion.session.sessionId,
    },
    decode: decodeBootstrapResponse,
  });

  const checkout = yield* createJsonPost({
    operation: "subscriberJourney.createCheckoutSession",
    url: createApiUrl(
      apiBaseUrl,
      subscriberJourneyApiPath.createCheckoutSession,
    ),
    body: {
      planId: selectedPlan.planId,
      priceId: selectedPrice.priceId,
      successUrl: smokeFixture.successUrl,
      cancelUrl: smokeFixture.cancelUrl,
      tenantScope: platformScope.organization,
      tenantScopeId: smokeFixture.tenantId,
    },
    decode: Schema.decodeUnknown(BillingCheckoutSessionSchema),
  });

  console.log("Subscriber journey live smoke kickoff completed.");
  console.log(
    `- API base URL: ${apiBaseUrl}${subscriberJourneyApiPath.listPublicPlans}`,
  );
  console.log(`- Auth redirect URL: ${authStart.redirect.url}`);
  console.log(`- Session ID: ${authCompletion.session.sessionId}`);
  console.log(
    `- Actor ID: ${authCompletion.requestContext.actorId ?? "missing"}`,
  );
  console.log(`- Provisioning status: ${authCompletion.provisioning.status}`);
  console.log(`- Bootstrap authorization: ${bootstrap.authorization.allowed}`);
  console.log(`- Bootstrap reason: ${bootstrap.authorization.reason}`);
  console.log(`- Checkout URL: ${checkout.checkoutUrl}`);
  console.log(`- Local webhook endpoint: ${localWebhookUrl}`);
  console.log(`- Polar CLI listen command: polar listen ${localWebhookUrl}`);
  console.log(
    "- Copy the Polar CLI secret into POLAR_WEBHOOK_SECRET before completing checkout.",
  );
  console.log(`- Local webhook replay endpoint: ${localReplayUrl}`);
  if (environment.SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL !== undefined) {
    console.log(
      `- Public webhook endpoint: ${environment.SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL}${subscriberJourneyApiPath.processBillingWebhook}`,
    );
    console.log(
      `- Public webhook replay endpoint: ${environment.SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL}${subscriberJourneyApiPath.replayBillingWebhook}`,
    );
  }
  console.log(
    `- Replay request body: {\"deliveryId\":\"<polar-delivery-id>\"}`,
  );
});

try {
  await Effect.runPromise(main);
} catch (error) {
  printToolingScriptError(error);
  process.exit(1);
}
