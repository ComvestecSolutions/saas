import { Effect, ParseResult, Schema } from "effect";
import { resolveDefaultTenantOnboardingEnabledModules } from "@comvestec/config";
import {
  authorizationNamespace,
  authorizationRelation,
  AdminBillingExplanationResultSchema,
  actorType,
  BillingRepairGapListResultSchema,
  BillingCheckoutSessionSchema,
  ManagedFileSummaryViewListSchema,
  PlatformModuleIdSchema,
  platformScope,
  PublicBillingPlanCatalogSchema,
  RequestContextSchema,
  SearchManagedFileQueryResultSchema,
  RetentionPolicyAdminViewListSchema,
  SearchTenantIndexRecordListSchema,
  SupportOperationsBreakGlassIncidentSupportViewListSchema,
  telemetryKind,
  WebhookSubscriptionAdminViewListSchema,
  platformModuleId,
} from "@comvestec/contracts";
import {
  IdentitySessionCompletionResultSchema,
  IdentitySessionStartResultSchema,
} from "@comvestec/modules";
import {
  adminBillingApiPath,
  adminGovernanceApiPath,
  adminRetentionLegalHoldApiPath,
  adminSupportOperationsApiPath,
  adminWebhooksApiAccessApiPath,
  AdminGovernanceFeatureFlagViewListSchema,
  createProductAppAuthCallbackStateFromEnvironment,
  fileStorageApiPath,
  makeOryKetoAdapter,
  makeObservabilityAdapter,
  makePolarAdapter,
  platformAdapterServiceName,
  searchApiPath,
  subscriberJourneyApiPath,
  subscriberJourneySessionHeaderName,
  webhooksApiPath,
} from "@comvestec/platform";
import {
  backendApiHealthPath,
  BackendApiReadinessResponseSchema,
} from "@comvestec/platform/http";
import {
  hostFromUrlString,
  issueKeycloakPasswordGrant,
  persistSyntheticRequestContextSession,
  printToolingScriptError,
  requestEmpty,
  requestJson,
  requireConfiguredValue,
  resolveOptionalOverride,
  subscriberJourneySmokeDefaults,
  type ToolingScriptConfigurationError,
  type ToolingScriptHttpError,
} from "./common";

const SubscriberJourneyLiveSmokeEnvironmentSchema = Schema.Struct({
  SUBSCRIBER_JOURNEY_API_PORT: Schema.NonEmptyString,
  SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL: Schema.optional(Schema.NonEmptyString),
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KETO_READ_URL: Schema.NonEmptyString,
  KETO_WRITE_URL: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  POLAR_API_URL: Schema.NonEmptyString,
  POLAR_WEBHOOK_SECRET: Schema.NonEmptyString,
  APP_BASE_URL: Schema.NonEmptyString,
  PRODUCT_APP_PORT: Schema.NonEmptyString,
  OTEL_EXPORTER_OTLP_ENDPOINT: Schema.NonEmptyString,
  GRAFANA_BASE_URL: Schema.NonEmptyString,
  TEMPO_PORT: Schema.NonEmptyString,
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

const decodeBackendApiReadinessResponse = Schema.decodeUnknown(
  BackendApiReadinessResponseSchema,
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

const createDeterministicHexId = async (input: string, length: number) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );

  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, length);
};

const resolveTempoBaseUrl = (
  environment: SubscriberJourneyLiveSmokeEnvironment,
) => `http://127.0.0.1:${environment.TEMPO_PORT}`;

const buildToolingScriptHttpError = (
  operation: string,
  cause: unknown,
  status?: number,
  body?: string,
) =>
  ({
    _tag: "ToolingScriptHttpError",
    operation,
    cause,
    ...(status === undefined ? {} : { status }),
    ...(body === undefined ? {} : { body }),
  }) as const;

const normalizeTempoTraceId = (value: string) => {
  const trimmedValue = value.trim();
  const normalizedValue = trimmedValue.toLowerCase();

  if (/^[0-9a-f]{32}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  try {
    const decodedValue = Buffer.from(trimmedValue, "base64")
      .toString("hex")
      .toLowerCase();

    return /^[0-9a-f]{32}$/.test(decodedValue) ? decodedValue : normalizedValue;
  } catch {
    return normalizedValue;
  }
};

const tempoResponseContainsTraceId = (
  input: unknown,
  traceId: string,
): boolean => {
  const expectedTraceId = normalizeTempoTraceId(traceId);
  const queue: unknown[] = [input];

  while (queue.length > 0) {
    const current = queue.pop();

    if (typeof current === "string") {
      if (
        current.includes(traceId) ||
        normalizeTempoTraceId(current) === expectedTraceId
      ) {
        return true;
      }

      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (current !== null && typeof current === "object") {
      queue.push(...Object.values(current));
    }
  }

  return false;
};

const fetchTempoTraceById = (options: {
  readonly tempoBaseUrl: string;
  readonly traceId: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(
        `${options.tempoBaseUrl}/api/traces/${options.traceId}`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );
      const responseText = await response.text();

      if (!response.ok) {
        throw buildToolingScriptHttpError(
          "observability.tempoTraceLookup",
          response.statusText,
          response.status,
          responseText,
        );
      }

      const responsePayload = (() => {
        try {
          return JSON.parse(responseText) as unknown;
        } catch {
          return responseText;
        }
      })();

      if (!tempoResponseContainsTraceId(responsePayload, options.traceId)) {
        throw buildToolingScriptHttpError(
          "observability.tempoTraceLookup",
          `Tempo returned a response that did not contain trace ${options.traceId}.`,
          response.status,
          responseText,
        );
      }

      return responseText;
    },
    catch: (cause) =>
      typeof cause === "object" &&
      cause !== null &&
      "_tag" in cause &&
      cause._tag === "ToolingScriptHttpError"
        ? cause
        : buildToolingScriptHttpError("observability.tempoTraceLookup", cause),
  });

const waitForTempoTrace = (options: {
  readonly tempoBaseUrl: string;
  readonly traceId: string;
}) =>
  Effect.gen(function* () {
    let lastFailure: unknown = buildToolingScriptHttpError(
      "observability.tempoTraceLookup",
      `Trace ${options.traceId} has not been observed yet.`,
    );

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = yield* Effect.either(fetchTempoTraceById(options));

      if (result._tag === "Right") {
        return result.right;
      }

      lastFailure = result.left;

      if (attempt < 9) {
        yield* Effect.sleep("1 second");
      }
    }

    return yield* Effect.fail(lastFailure);
  });

const runObservabilityTraceSmoke = (
  environment: SubscriberJourneyLiveSmokeEnvironment,
) =>
  Effect.gen(function* () {
    const observability = yield* makeObservabilityAdapter({
      otlpHttpEndpoint: environment.OTEL_EXPORTER_OTLP_ENDPOINT,
      grafanaBaseUrl: environment.GRAFANA_BASE_URL,
    });
    const correlationId = `corr_smoke_observability_${Date.now()}`;
    const traceId = yield* Effect.tryPromise(() =>
      createDeterministicHexId(
        `tooling.subscriber-journey-live-smoke:${correlationId}`,
        32,
      ),
    );
    const tempoBaseUrl = resolveTempoBaseUrl(environment);

    yield* observability.emit({
      kind: telemetryKind.trace,
      service: "tooling.subscriber-journey-live-smoke",
      payload: {
        correlationId,
        method: "POST",
        path: "/tooling/subscriber-journey/live-smoke/observability",
        status: 200,
        durationMs: 25,
      },
    });
    yield* requestEmpty({
      operation: "observability.tempoFlush",
      url: `${tempoBaseUrl}/flush`,
      init: {
        method: "POST",
      },
    });
    yield* waitForTempoTrace({
      tempoBaseUrl,
      traceId,
    });

    console.log(
      "Verified an OTLP trace reached Tempo through the shared observability adapter.",
    );
  });

const createJsonPost = <A>(options: {
  readonly operation: string;
  readonly url: string;
  readonly body: unknown;
  readonly headers?: HeadersInit;
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
        ...(options.headers ?? {}),
      },
      body: JSON.stringify(options.body),
    },
    decode: options.decode,
  });

const createJsonGet = <A>(options: {
  readonly operation: string;
  readonly url: string;
  readonly headers?: HeadersInit;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError>;
}) =>
  requestJson({
    operation: options.operation,
    url: options.url,
    init: {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(options.headers ?? {}),
      },
    },
    decode: options.decode,
  });

const buildPolarReadinessConfigurationError = (
  message: string,
  key: ToolingScriptConfigurationError["key"] = "POLAR_ACCESS_TOKEN",
): ToolingScriptConfigurationError => ({
  _tag: "ToolingScriptConfigurationError",
  key,
  message,
});

const isPolarAdapterRequestError = (
  error: unknown,
): error is {
  readonly _tag: "PolarAdapterRequestError";
  readonly operation: string;
  readonly status?: number;
  readonly body?: string;
} =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "PolarAdapterRequestError" &&
  "operation" in error &&
  typeof error.operation === "string" &&
  (!("status" in error) || typeof error.status === "number") &&
  (!("body" in error) || typeof error.body === "string");

const explainPolarReadinessFailure = (
  environment: SubscriberJourneyLiveSmokeEnvironment,
  error: ToolingScriptHttpError,
) =>
  Effect.gen(function* () {
    if (
      error.operation !== "backendApi.readiness" ||
      error.status !== 503 ||
      error.body === undefined ||
      error.body.length === 0
    ) {
      return yield* Effect.fail(error);
    }

    const readinessErrorBody = error.body;
    const decodedReadiness = yield* Effect.either(
      Effect.try({
        try: () => JSON.parse(readinessErrorBody),
        catch: (cause) => cause,
      }).pipe(Effect.flatMap(decodeBackendApiReadinessResponse)),
    );

    if (decodedReadiness._tag === "Left") {
      return yield* Effect.fail(error);
    }

    const unhealthyChecks = decodedReadiness.right.checks.filter(
      (check) => !check.healthy,
    );
    const polarCheck = unhealthyChecks.find(
      (check) => check.service === platformAdapterServiceName.polar,
    );

    if (
      unhealthyChecks.length !== 1 ||
      polarCheck?.healthy !== false ||
      polarCheck.errorTag !== "PolarAdapterRequestError"
    ) {
      return yield* Effect.fail(error);
    }

    const polar = yield* makePolarAdapter({
      apiKey: environment.POLAR_ACCESS_TOKEN,
      apiUrl: environment.POLAR_API_URL,
    });
    const polarProbe = yield* Effect.either(polar.listPlans);

    if (polarProbe._tag === "Right") {
      return yield* Effect.fail(error);
    }

    if (!isPolarAdapterRequestError(polarProbe.left)) {
      return yield* Effect.fail(error);
    }

    const responseBody = polarProbe.left.body?.trim();
    const invalidToken =
      polarProbe.left.status === 401 ||
      (responseBody !== undefined && responseBody.includes("invalid_token"));

    if (invalidToken) {
      return yield* Effect.fail(
        buildPolarReadinessConfigurationError(
          "Backend readiness reported Polar unhealthy. A direct Polar catalog probe returned invalid_token, which means the current POLAR_ACCESS_TOKEN does not match the configured Polar host. The repo-tracked local defaults keep both POLAR_API_URL and POLAR_API_BASE_URL on https://sandbox-api.polar.sh/v1. Refresh POLAR_ACCESS_TOKEN or align both Polar host keys with the token scope, then rerun bun run backend:subscriber-journey:ready:local.",
          "POLAR_ACCESS_TOKEN",
        ),
      );
    }

    return yield* Effect.fail(error);
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
    webhooksApiPath.processPolarWebhook,
  );
  const localReplayUrl = createApiUrl(
    apiBaseUrl,
    webhooksApiPath.replayPolarWebhook,
  );
  const correlationId = `corr_smoke_${Date.now()}`;
  const platformOperatorActorId = "usr_smoke_platform_operator";
  const supportTenantActorId = "usr_smoke_support_tenant";
  const supportPlatformSessionId = `sess_smoke_support_platform_${Date.now()}`;
  const supportTenantSessionId = `sess_smoke_support_tenant_${Date.now()}`;
  const platformOperatorSessionId = `sess_smoke_platform_operator_${Date.now()}`;
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

  yield* persistSyntheticRequestContextSession({
    valkeyUrl: environment.VALKEY_URL,
    sessionId: supportPlatformSessionId,
    requestContext: {
      actorType: actorType.supportOperator,
      actorId: "usr_smoke_support_platform",
      sessionId: supportPlatformSessionId,
      correlationId,
      reason: "Run platform-scoped backend completion smoke checks.",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    },
  });
  yield* persistSyntheticRequestContextSession({
    valkeyUrl: environment.VALKEY_URL,
    sessionId: supportTenantSessionId,
    requestContext: {
      actorType: actorType.supportOperator,
      actorId: supportTenantActorId,
      sessionId: supportTenantSessionId,
      correlationId,
      reason: "Run tenant-scoped backend completion smoke checks.",
      tenant: {
        scope: platformScope.organization,
        scopeId: smokeFixture.tenantId,
        enterpriseId: smokeFixture.enterpriseId,
        organizationId: smokeFixture.tenantId,
      },
    },
  });

  const oryKeto = yield* makeOryKetoAdapter({
    readUrl: environment.KETO_READ_URL,
    writeUrl: environment.KETO_WRITE_URL,
  });

  yield* oryKeto.writeTuple({
    namespace: authorizationNamespace.module,
    object: platformModuleId.retentionLegalHold,
    relation: authorizationRelation.admin,
    subject: supportTenantActorId,
  });

  yield* persistSyntheticRequestContextSession({
    valkeyUrl: environment.VALKEY_URL,
    sessionId: platformOperatorSessionId,
    requestContext: {
      actorType: actorType.platformOperator,
      actorId: platformOperatorActorId,
      sessionId: platformOperatorSessionId,
      correlationId,
      reason: "Run platform-operator backend completion smoke checks.",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    },
  });

  yield* oryKeto.writeTuple({
    namespace: authorizationNamespace.module,
    object: platformModuleId.workflowJobs,
    relation: authorizationRelation.admin,
    subject: platformOperatorActorId,
  });
  yield* oryKeto.writeTuple({
    namespace: authorizationNamespace.billingEntitlement,
    object: platformScope.platform,
    relation: authorizationRelation.viewer,
    subject: platformOperatorActorId,
  });
  yield* oryKeto.writeTuple({
    namespace: authorizationNamespace.file,
    object: [
      authorizationNamespace.file,
      platformScope.organization,
      smokeFixture.tenantId,
    ].join(":"),
    relation: authorizationRelation.viewer,
    subject: supportTenantActorId,
  });
  yield* oryKeto.writeTuple({
    namespace: authorizationNamespace.module,
    object: platformModuleId.search,
    relation: authorizationRelation.admin,
    subject: supportTenantActorId,
  });
  yield* oryKeto.writeTuple({
    namespace: authorizationNamespace.module,
    object: platformModuleId.webhooksApiAccess,
    relation: authorizationRelation.admin,
    subject: supportTenantActorId,
  });

  console.log("Calling the backend-owned subscriber journey API...");

  const readiness = yield* requestJson({
    operation: "backendApi.readiness",
    url: createApiUrl(apiBaseUrl, backendApiHealthPath.ready),
    decode: decodeBackendApiReadinessResponse,
  }).pipe(
    Effect.catchTag("ToolingScriptHttpError", (error) =>
      explainPolarReadinessFailure(environment, error),
    ),
  );

  yield* runObservabilityTraceSmoke(environment);

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
    body: {},
    headers: {
      [subscriberJourneySessionHeaderName]: authCompletion.session.sessionId,
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

  const governanceFeatureFlags = yield* createJsonPost({
    operation: "adminGovernance.listFeatureFlags",
    url: createApiUrl(apiBaseUrl, adminGovernanceApiPath.listFeatureFlags),
    body: {
      moduleId: platformModuleId.runtimeConfig,
    },
    headers: {
      [subscriberJourneySessionHeaderName]: supportPlatformSessionId,
    },
    decode: Schema.decodeUnknown(AdminGovernanceFeatureFlagViewListSchema),
  });

  const breakGlassIncidents = yield* createJsonPost({
    operation: "supportOperations.listBreakGlassIncidents",
    url: createApiUrl(
      apiBaseUrl,
      adminSupportOperationsApiPath.listBreakGlassIncidents,
    ),
    body: {},
    headers: {
      [subscriberJourneySessionHeaderName]: supportPlatformSessionId,
    },
    decode: Schema.decodeUnknown(
      SupportOperationsBreakGlassIncidentSupportViewListSchema,
    ),
  });

  const retentionPolicies = yield* createJsonPost({
    operation: "retentionLegalHold.listPolicies",
    url: createApiUrl(apiBaseUrl, adminRetentionLegalHoldApiPath.listPolicies),
    body: {
      scope: platformScope.organization,
      scopeId: smokeFixture.tenantId,
    },
    headers: {
      [subscriberJourneySessionHeaderName]: supportTenantSessionId,
    },
    decode: Schema.decodeUnknown(RetentionPolicyAdminViewListSchema),
  });

  const billingRepairGaps = yield* createJsonGet({
    operation: "adminBilling.listRepairGaps",
    url: createApiUrl(apiBaseUrl, adminBillingApiPath.listRepairGaps),
    headers: {
      [subscriberJourneySessionHeaderName]: platformOperatorSessionId,
    },
    decode: Schema.decodeUnknown(BillingRepairGapListResultSchema),
  });

  const billingInspection = yield* createJsonPost({
    operation: "adminBilling.inspectBillingState",
    url: createApiUrl(apiBaseUrl, adminBillingApiPath.inspectBillingState),
    body: {
      tenant: {
        scope: platformScope.organization,
        scopeId: smokeFixture.tenantId,
        enterpriseId: smokeFixture.enterpriseId,
        organizationId: smokeFixture.tenantId,
      },
      inspectionReason: "Run backend completion billing inspection.",
    },
    headers: {
      [subscriberJourneySessionHeaderName]: platformOperatorSessionId,
    },
    decode: Schema.decodeUnknown(AdminBillingExplanationResultSchema),
  });

  const managedFiles = yield* createJsonPost({
    operation: "fileStorage.listManagedFiles",
    url: createApiUrl(apiBaseUrl, fileStorageApiPath.listManagedFiles),
    body: {
      scope: platformScope.organization,
      scopeId: smokeFixture.tenantId,
    },
    headers: {
      [subscriberJourneySessionHeaderName]: supportTenantSessionId,
    },
    decode: Schema.decodeUnknown(ManagedFileSummaryViewListSchema),
  });

  const searchIndexes = yield* createJsonPost({
    operation: "search.listTenantIndexRecords",
    url: createApiUrl(apiBaseUrl, searchApiPath.listTenantIndexRecords),
    body: {
      scope: platformScope.organization,
      scopeId: smokeFixture.tenantId,
    },
    headers: {
      [subscriberJourneySessionHeaderName]: supportTenantSessionId,
    },
    decode: Schema.decodeUnknown(SearchTenantIndexRecordListSchema),
  });

  const searchPreview = yield* createJsonPost({
    operation: "search.queryManagedFiles",
    url: createApiUrl(apiBaseUrl, searchApiPath.queryManagedFiles),
    body: {
      scope: platformScope.organization,
      scopeId: smokeFixture.tenantId,
      query: "invoice",
      limit: 5,
    },
    headers: {
      [subscriberJourneySessionHeaderName]: supportTenantSessionId,
    },
    decode: Schema.decodeUnknown(SearchManagedFileQueryResultSchema),
  });

  const webhookSubscriptions = yield* createJsonPost({
    operation: "adminWebhooks.listSubscriptions",
    url: createApiUrl(
      apiBaseUrl,
      adminWebhooksApiAccessApiPath.listSubscriptions,
    ),
    body: {
      scope: platformScope.organization,
      scopeId: smokeFixture.tenantId,
    },
    headers: {
      [subscriberJourneySessionHeaderName]: supportTenantSessionId,
    },
    decode: Schema.decodeUnknown(WebhookSubscriptionAdminViewListSchema),
  });

  console.log("Subscriber journey live smoke kickoff completed.");
  console.log(
    `- API base URL: ${apiBaseUrl}${subscriberJourneyApiPath.listPublicPlans}`,
  );
  console.log(`- Backend readiness checks: ${readiness.checks.length}`);
  console.log(`- Auth redirect URL: ${authStart.redirect.url}`);
  console.log(`- Session ID: ${authCompletion.session.sessionId}`);
  console.log(
    `- Actor ID: ${authCompletion.requestContext.actorId ?? "missing"}`,
  );
  console.log(`- Provisioning status: ${authCompletion.provisioning.status}`);
  console.log(`- Bootstrap authorization: ${bootstrap.authorization.allowed}`);
  console.log(`- Bootstrap reason: ${bootstrap.authorization.reason}`);
  console.log(`- Checkout URL: ${checkout.checkoutUrl}`);
  console.log(
    `- Governance feature flags visible: ${governanceFeatureFlags.length}`,
  );
  console.log(
    `- Support break-glass incidents visible: ${breakGlassIncidents.length}`,
  );
  console.log(`- Retention policies visible: ${retentionPolicies.length}`);
  console.log(
    `- Billing repair gaps visible: ${billingRepairGaps.jobs.length}`,
  );
  console.log(
    `- Billing inspection status: ${billingInspection.billing?.status ?? "none"}`,
  );
  console.log(
    `- Billing inspection invoice entries: ${billingInspection.billing?.invoiceHistory?.length ?? 0}`,
  );
  console.log(`- Managed files visible: ${managedFiles.length}`);
  console.log(`- Search index records visible: ${searchIndexes.length}`);
  console.log(`- Search preview hits visible: ${searchPreview.hits.length}`);
  console.log(
    `- Webhook subscriptions visible: ${webhookSubscriptions.length}`,
  );
  console.log(`- Local webhook endpoint: ${localWebhookUrl}`);
  console.log(`- Polar CLI listen command: polar listen ${localWebhookUrl}`);
  console.log(
    "- Copy the Polar CLI secret into POLAR_WEBHOOK_SECRET before completing checkout.",
  );
  console.log(`- Local webhook replay endpoint: ${localReplayUrl}`);
  if (environment.SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL !== undefined) {
    console.log(
      `- Public webhook endpoint: ${environment.SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL}${webhooksApiPath.processPolarWebhook}`,
    );
    console.log(
      `- Public webhook replay endpoint: ${environment.SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL}${webhooksApiPath.replayPolarWebhook}`,
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
