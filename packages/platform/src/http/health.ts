import { Effect, Schema } from "effect";
import {
  makeConvexAdapter,
  makeGlitchtipAdapter,
  makeKeycloakAdapter,
  makeMeilisearchAdapter,
  makeNovuAdapter,
  makeOpenPanelAdapter,
  makeOpenmeterAdapter,
  makeObservabilityAdapter,
  makeOryKetoAdapter,
  makePolarAdapter,
  makePostgresAdapter,
  makePostalAdapter,
  makeUnleashAdapter,
  makeValkeyAdapter,
  PlatformAdapterServiceNameSchema,
  platformAdapterServiceName,
  type PlatformAdapterServiceName,
} from "../adapters";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
} from "../services/communication/http-transport";
import {
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment,
  type SubscriberJourneyRuntimeOptions,
} from "../services/domains/subscriber-journey";

export const backendApiServiceName = "backend-api" as const;

export const backendApiHealthPath = {
  live: "/api/health",
  ready: "/api/health/ready",
} as const;

const BackendApiServiceNameSchema = Schema.Literal(backendApiServiceName);

export const BackendApiLivenessResponseSchema = Schema.Struct({
  service: BackendApiServiceNameSchema,
  healthy: Schema.Literal(true),
});

export type BackendApiLivenessResponse = Schema.Schema.Type<
  typeof BackendApiLivenessResponseSchema
>;

export const BackendApiReadinessCheckSchema = Schema.Struct({
  service: PlatformAdapterServiceNameSchema,
  healthy: Schema.Boolean,
  errorTag: Schema.optional(Schema.NonEmptyString),
});

export type BackendApiReadinessCheck = Schema.Schema.Type<
  typeof BackendApiReadinessCheckSchema
>;

export const BackendApiReadinessResponseSchema = Schema.Struct({
  service: BackendApiServiceNameSchema,
  healthy: Schema.Boolean,
  checks: Schema.Array(BackendApiReadinessCheckSchema),
  errorTag: Schema.optional(Schema.NonEmptyString),
});

export type BackendApiReadinessResponse = Schema.Schema.Type<
  typeof BackendApiReadinessResponseSchema
>;

export type BackendApiReadinessProbe = {
  readonly service: PlatformAdapterServiceName;
  readonly healthcheck: Effect.Effect<unknown, unknown>;
};

type BackendApiReadinessConfigurationErrorTag =
  | "GlitchtipReadinessConfigurationError"
  | "OpenPanelReadinessConfigurationError";

export type BackendApiHealthHandlerOptions = {
  readonly environment?: unknown;
  readonly getReadinessProbes?: () =>
    | readonly BackendApiReadinessProbe[]
    | Promise<readonly BackendApiReadinessProbe[]>;
};

const backendApiBootstrapPlaceholderPrefixes = [
  "generate-after-",
  "set-when-",
  "set-from-",
  "change-me",
] as const;

export const isBackendApiHealthValueConfigured = (value: string) => {
  const normalizedValue = value.trim();

  return (
    normalizedValue.length > 0 &&
    !backendApiBootstrapPlaceholderPrefixes.some((prefix) =>
      normalizedValue.startsWith(prefix),
    )
  );
};

const BackendApiHealthSearchEnvironmentSchema = Schema.Struct({
  MEILISEARCH_URL: Schema.NonEmptyString,
  MEILISEARCH_API_KEY: Schema.NonEmptyString,
});

const BackendApiHealthObservabilityEnvironmentSchema = Schema.Struct({
  OTEL_EXPORTER_OTLP_ENDPOINT: Schema.NonEmptyString,
  GRAFANA_BASE_URL: Schema.NonEmptyString,
});

const BackendApiHealthAnalyticsEnvironmentSchema = Schema.Struct({
  OPENPANEL_API_URL: Schema.NonEmptyString,
  OPENPANEL_CLIENT_ID: Schema.NonEmptyString,
  OPENPANEL_CLIENT_SECRET: Schema.NonEmptyString,
});

const BackendApiHealthErrorTrackingEnvironmentSchema = Schema.Struct({
  ERROR_TRACKING_DSN: Schema.optional(Schema.NonEmptyString),
});

const BackendApiHealthMessagingEnvironmentSchema = Schema.Struct({
  NOVU_API_URL: Schema.NonEmptyString,
  NOVU_API_KEY: Schema.optional(Schema.NonEmptyString),
  POSTAL_API_URL: Schema.NonEmptyString,
  POSTAL_API_KEY: Schema.optional(Schema.NonEmptyString),
});

const BackendApiHealthMeteringEnvironmentSchema = Schema.Struct({
  OPENMETER_URL: Schema.NonEmptyString,
  OPENMETER_API_KEY: Schema.optional(Schema.NonEmptyString),
});

type BackendApiHealthSearchEnvironment = Schema.Schema.Type<
  typeof BackendApiHealthSearchEnvironmentSchema
>;

type BackendApiHealthObservabilityEnvironment = Schema.Schema.Type<
  typeof BackendApiHealthObservabilityEnvironmentSchema
>;

type BackendApiHealthAnalyticsEnvironment = Schema.Schema.Type<
  typeof BackendApiHealthAnalyticsEnvironmentSchema
>;

type BackendApiHealthErrorTrackingEnvironment = Schema.Schema.Type<
  typeof BackendApiHealthErrorTrackingEnvironmentSchema
>;

type BackendApiHealthMessagingEnvironment = Schema.Schema.Type<
  typeof BackendApiHealthMessagingEnvironmentSchema
>;

type BackendApiHealthMeteringEnvironment = Schema.Schema.Type<
  typeof BackendApiHealthMeteringEnvironmentSchema
>;

const decodeBackendApiHealthSearchEnvironment = Schema.decodeUnknown(
  BackendApiHealthSearchEnvironmentSchema,
);

const decodeBackendApiHealthObservabilityEnvironment = Schema.decodeUnknown(
  BackendApiHealthObservabilityEnvironmentSchema,
);

const decodeBackendApiHealthAnalyticsEnvironment = Schema.decodeUnknown(
  BackendApiHealthAnalyticsEnvironmentSchema,
);

const decodeBackendApiHealthErrorTrackingEnvironment = Schema.decodeUnknown(
  BackendApiHealthErrorTrackingEnvironmentSchema,
);

const decodeBackendApiHealthMessagingEnvironment = Schema.decodeUnknown(
  BackendApiHealthMessagingEnvironmentSchema,
);

const decodeBackendApiHealthMeteringEnvironment = Schema.decodeUnknown(
  BackendApiHealthMeteringEnvironmentSchema,
);

const allowedMethods = ["GET"] as const;

const buildTaggedErrorName = (error: unknown) =>
  isTaggedError(error) ? error._tag : undefined;

const buildHealthyReadinessCheck = (
  service: PlatformAdapterServiceName,
): BackendApiReadinessCheck =>
  ({
    service,
    healthy: true,
  }) satisfies BackendApiReadinessCheck;

const buildUnhealthyReadinessCheck = (
  service: PlatformAdapterServiceName,
  error: unknown,
): BackendApiReadinessCheck => {
  const errorTag = buildTaggedErrorName(error);

  return {
    service,
    healthy: false,
    ...(errorTag !== undefined ? { errorTag } : {}),
  } satisfies BackendApiReadinessCheck;
};

const buildInitializationFailureResponse = (
  error: unknown,
): BackendApiReadinessResponse => {
  const errorTag =
    buildTaggedErrorName(error) ?? "BackendApiReadinessInitializationError";

  return {
    service: backendApiServiceName,
    healthy: false,
    checks: [],
    errorTag,
  } satisfies BackendApiReadinessResponse;
};

const createConfigurationFailureReadinessProbe = (
  service: PlatformAdapterServiceName,
  errorTag: BackendApiReadinessConfigurationErrorTag,
): BackendApiReadinessProbe => ({
  service,
  healthcheck: Effect.fail({ _tag: errorTag } as const),
});

const buildLivenessResponse = (): BackendApiLivenessResponse =>
  ({
    service: backendApiServiceName,
    healthy: true,
  }) satisfies BackendApiLivenessResponse;

const collectBackendApiReadinessResponse = (
  probes: readonly BackendApiReadinessProbe[],
) =>
  Effect.forEach(probes, (probe) =>
    probe.healthcheck.pipe(
      Effect.match({
        onFailure: (error) =>
          buildUnhealthyReadinessCheck(probe.service, error),
        onSuccess: () => buildHealthyReadinessCheck(probe.service),
      }),
    ),
  ).pipe(
    Effect.map(
      (checks): BackendApiReadinessResponse => ({
        service: backendApiServiceName,
        healthy: checks.every((check) => check.healthy),
        checks,
      }),
    ),
  );

const createDefaultBackendApiReadinessProbes = (environment: unknown) =>
  Effect.all({
    subscriberJourney:
      resolveSubscriberJourneyRuntimeOptionsFromEnvironment(environment),
    search: decodeBackendApiHealthSearchEnvironment(environment),
    observability: decodeBackendApiHealthObservabilityEnvironment(environment),
    analytics: decodeBackendApiHealthAnalyticsEnvironment(environment),
    errorTracking: decodeBackendApiHealthErrorTrackingEnvironment(environment),
    messaging: decodeBackendApiHealthMessagingEnvironment(environment),
    metering: decodeBackendApiHealthMeteringEnvironment(environment),
  }).pipe(
    Effect.flatMap(
      ({
        subscriberJourney,
        search,
        observability,
        analytics,
        errorTracking,
        messaging,
        metering,
      }) =>
        createRouteCriticalReadinessProbes(
          subscriberJourney,
          search,
          observability,
          analytics,
          errorTracking,
          messaging,
          metering,
        ),
    ),
  );

const createRouteCriticalReadinessProbes = (
  subscriberJourney: SubscriberJourneyRuntimeOptions,
  search: BackendApiHealthSearchEnvironment,
  observability: BackendApiHealthObservabilityEnvironment,
  analytics: BackendApiHealthAnalyticsEnvironment,
  errorTracking: BackendApiHealthErrorTrackingEnvironment,
  messaging: BackendApiHealthMessagingEnvironment,
  metering: BackendApiHealthMeteringEnvironment,
) => {
  const glitchtipDsn =
    errorTracking.ERROR_TRACKING_DSN !== undefined &&
    isBackendApiHealthValueConfigured(errorTracking.ERROR_TRACKING_DSN)
      ? errorTracking.ERROR_TRACKING_DSN
      : undefined;
  const novuApiKey =
    messaging.NOVU_API_KEY !== undefined &&
    isBackendApiHealthValueConfigured(messaging.NOVU_API_KEY)
      ? messaging.NOVU_API_KEY
      : undefined;
  const postalApiKey =
    messaging.POSTAL_API_KEY !== undefined &&
    isBackendApiHealthValueConfigured(messaging.POSTAL_API_KEY)
      ? messaging.POSTAL_API_KEY
      : undefined;
  const openmeterApiKey =
    metering.OPENMETER_API_KEY !== undefined &&
    isBackendApiHealthValueConfigured(metering.OPENMETER_API_KEY)
      ? metering.OPENMETER_API_KEY
      : undefined;
  const openpanelClientIdConfigured = isBackendApiHealthValueConfigured(
    analytics.OPENPANEL_CLIENT_ID,
  );
  const openpanelClientSecretConfigured = isBackendApiHealthValueConfigured(
    analytics.OPENPANEL_CLIENT_SECRET,
  );

  return Effect.all({
    postgres: makePostgresAdapter({
      connectionString: subscriberJourney.postgresUrl,
    }),
    convex: makeConvexAdapter({
      deploymentUrl: subscriberJourney.convexUrl,
      siteUrl: subscriberJourney.convexSiteUrl,
      adminKey: subscriberJourney.convexAdminKey,
      keycloakBaseUrl: subscriberJourney.keycloakBaseUrl,
      keycloakRealm: subscriberJourney.keycloakRealm,
      keycloakClientId: subscriberJourney.keycloakClientId,
      keycloakClientSecret: subscriberJourney.keycloakClientSecret,
      keycloakConvexServiceActorUsername:
        subscriberJourney.keycloakConvexServiceActorUsername,
      keycloakConvexServiceActorPassword:
        subscriberJourney.keycloakConvexServiceActorPassword,
    }),
    keycloak: makeKeycloakAdapter({
      baseUrl: subscriberJourney.keycloakBaseUrl,
      realm: subscriberJourney.keycloakRealm,
      clientId: subscriberJourney.keycloakClientId,
      clientSecret: subscriberJourney.keycloakClientSecret,
    }),
    valkey: makeValkeyAdapter({
      url: subscriberJourney.valkeyUrl,
    }),
    unleash: makeUnleashAdapter({
      url: subscriberJourney.unleashUrl,
      apiKey: subscriberJourney.unleashApiKey,
    }),
    oryKeto: makeOryKetoAdapter({
      readUrl: subscriberJourney.ketoReadUrl,
      writeUrl: subscriberJourney.ketoWriteUrl,
    }),
    polar: makePolarAdapter({
      apiKey: subscriberJourney.polarAccessToken,
      apiUrl: subscriberJourney.polarApiUrl,
    }),
    meilisearch: makeMeilisearchAdapter({
      url: search.MEILISEARCH_URL,
      apiKey: search.MEILISEARCH_API_KEY,
    }),
    observability: makeObservabilityAdapter({
      otlpHttpEndpoint: observability.OTEL_EXPORTER_OTLP_ENDPOINT,
      grafanaBaseUrl: observability.GRAFANA_BASE_URL,
    }),
    openpanelProbe:
      openpanelClientIdConfigured && openpanelClientSecretConfigured
        ? makeOpenPanelAdapter({
            apiUrl: analytics.OPENPANEL_API_URL,
            clientId: analytics.OPENPANEL_CLIENT_ID,
            clientSecret: analytics.OPENPANEL_CLIENT_SECRET,
          }).pipe(
            Effect.map(
              (openpanel): BackendApiReadinessProbe => ({
                service: openpanel.serviceName,
                healthcheck: openpanel.healthcheck,
              }),
            ),
          )
        : Effect.succeed(
            createConfigurationFailureReadinessProbe(
              platformAdapterServiceName.openpanel,
              "OpenPanelReadinessConfigurationError",
            ),
          ),
    novu:
      novuApiKey !== undefined
        ? makeNovuAdapter({
            apiUrl: messaging.NOVU_API_URL,
            apiKey: novuApiKey,
          })
        : Effect.succeed(undefined),
    openmeter:
      openmeterApiKey !== undefined
        ? makeOpenmeterAdapter({
            url: metering.OPENMETER_URL,
            apiKey: openmeterApiKey,
          })
        : Effect.succeed(undefined),
    postal:
      postalApiKey !== undefined
        ? makePostalAdapter({
            apiUrl: messaging.POSTAL_API_URL,
            apiKey: postalApiKey,
          })
        : Effect.succeed(undefined),
    glitchtipProbe:
      errorTracking.ERROR_TRACKING_DSN === undefined
        ? Effect.succeed(undefined)
        : glitchtipDsn !== undefined
          ? makeGlitchtipAdapter({
              dsn: glitchtipDsn,
            }).pipe(
              Effect.map(
                (glitchtip): BackendApiReadinessProbe => ({
                  service: glitchtip.serviceName,
                  healthcheck: glitchtip.healthcheck,
                }),
              ),
            )
          : Effect.succeed(
              createConfigurationFailureReadinessProbe(
                platformAdapterServiceName.glitchtip,
                "GlitchtipReadinessConfigurationError",
              ),
            ),
  }).pipe(
    Effect.map(
      ({
        postgres,
        convex,
        keycloak,
        valkey,
        unleash,
        oryKeto,
        polar,
        meilisearch,
        observability,
        openpanelProbe,
        novu,
        openmeter,
        postal,
        glitchtipProbe,
      }): readonly BackendApiReadinessProbe[] => [
        {
          service: postgres.serviceName,
          healthcheck: postgres.healthcheck,
        },
        {
          service: convex.serviceName,
          healthcheck: convex.healthcheck,
        },
        {
          service: keycloak.serviceName,
          healthcheck: keycloak.healthcheck,
        },
        {
          service: valkey.serviceName,
          healthcheck: valkey.healthcheck,
        },
        {
          service: unleash.serviceName,
          healthcheck: unleash.healthcheck,
        },
        {
          service: oryKeto.serviceName,
          healthcheck: oryKeto.healthcheck,
        },
        {
          service: polar.serviceName,
          healthcheck: polar.healthcheck,
        },
        {
          service: meilisearch.serviceName,
          healthcheck: meilisearch.healthcheck,
        },
        {
          service: observability.serviceName,
          healthcheck: observability.healthcheck,
        },
        {
          service: openpanelProbe.service,
          healthcheck: openpanelProbe.healthcheck,
        },
        ...(novu !== undefined
          ? [
              {
                service: novu.serviceName,
                healthcheck: novu.healthcheck,
              } satisfies BackendApiReadinessProbe,
            ]
          : []),
        ...(openmeter !== undefined
          ? [
              {
                service: openmeter.serviceName,
                healthcheck: openmeter.healthcheck,
              } satisfies BackendApiReadinessProbe,
            ]
          : []),
        ...(postal !== undefined
          ? [
              {
                service: postal.serviceName,
                healthcheck: postal.healthcheck,
              } satisfies BackendApiReadinessProbe,
            ]
          : []),
        ...(glitchtipProbe !== undefined
          ? [
              {
                service: glitchtipProbe.service,
                healthcheck: glitchtipProbe.healthcheck,
              } satisfies BackendApiReadinessProbe,
            ]
          : []),
      ],
    ),
  );
};

export const createBackendApiHealthHandler = (
  options: BackendApiHealthHandlerOptions = {},
) => {
  let readinessProbesPromise:
    | Promise<readonly BackendApiReadinessProbe[]>
    | undefined;

  const loadReadinessProbes = () => {
    if (readinessProbesPromise !== undefined) {
      return readinessProbesPromise;
    }

    readinessProbesPromise = Promise.resolve().then(() => {
      if (options.getReadinessProbes !== undefined) {
        return options.getReadinessProbes();
      }

      return Effect.runPromise(
        createDefaultBackendApiReadinessProbes(options.environment ?? {}),
      );
    });

    return readinessProbesPromise;
  };

  return async (request: Request) => {
    const url = new URL(request.url);

    if (url.pathname !== backendApiHealthPath.live) {
      if (url.pathname !== backendApiHealthPath.ready) {
        return createNotFoundResponse("Health route not found.");
      }

      if (request.method !== "GET") {
        return createMethodNotAllowedResponse(allowedMethods);
      }

      try {
        const readinessProbes = await loadReadinessProbes();
        const readiness = await Effect.runPromise(
          collectBackendApiReadinessResponse(readinessProbes),
        );

        return createJsonResponse(readiness, readiness.healthy ? 200 : 503);
      } catch (error) {
        return createJsonResponse(
          buildInitializationFailureResponse(error),
          503,
        );
      }
    }

    if (request.method !== "GET") {
      return createMethodNotAllowedResponse(allowedMethods);
    }

    return createJsonResponse(buildLivenessResponse());
  };
};
