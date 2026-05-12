import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const GlitchtipAdapterOptionsSchema = Schema.Struct({
  dsn: Schema.NonEmptyString,
});

export type GlitchtipAdapterOptions = Schema.Schema.Type<
  typeof GlitchtipAdapterOptionsSchema
>;

type GlitchtipAdapterRuntimeOptions = GlitchtipAdapterOptions & {
  readonly fetch?: typeof fetch;
};

const GlitchtipHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.glitchtip,
);

const decodeGlitchtipHealthcheck = Schema.decodeUnknown(
  GlitchtipHealthcheckSchema,
);

export type GlitchtipHealthcheck = Schema.Schema.Type<
  typeof GlitchtipHealthcheckSchema
>;

const GlitchtipExceptionCaptureSchema = Schema.Struct({
  service: Schema.NonEmptyString,
  correlationId: Schema.NonEmptyString,
  method: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  status: Schema.Number,
  durationMs: Schema.Number,
  errorName: Schema.NonEmptyString,
  errorMessage: Schema.NonEmptyString,
  errorStack: Schema.optional(Schema.NonEmptyString),
});

export type GlitchtipExceptionCapture = Schema.Schema.Type<
  typeof GlitchtipExceptionCaptureSchema
>;

export class GlitchtipAdapterRequestError extends Error {
  readonly _tag = "GlitchtipAdapterRequestError";

  constructor(
    readonly endpoint: string,
    readonly status: number,
  ) {
    super(`GlitchTip capture failed with status ${status} for ${endpoint}.`);
    this.name = "GlitchtipAdapterRequestError";
  }
}

export class GlitchtipAdapterTransportError extends Error {
  readonly _tag = "GlitchtipAdapterTransportError";

  constructor(
    readonly endpoint: string,
    readonly transportCause: unknown,
  ) {
    super(`GlitchTip capture transport failed for ${endpoint}.`);
    this.name = "GlitchtipAdapterTransportError";
  }
}

export class GlitchtipAdapterConfigurationError extends Error {
  readonly _tag = "GlitchtipAdapterConfigurationError";

  constructor(
    readonly dsn: string,
    readonly configurationCause: unknown,
  ) {
    super(`GlitchTip DSN must be a valid absolute URL: ${dsn}.`);
    this.name = "GlitchtipAdapterConfigurationError";
  }
}

export type GlitchtipAdapterError =
  | ParseResult.ParseError
  | GlitchtipAdapterConfigurationError
  | GlitchtipAdapterRequestError
  | GlitchtipAdapterTransportError;

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

type GlitchtipRequestTarget = {
  readonly endpoint: string;
  readonly headers: Readonly<Record<string, string>>;
};

type GlitchtipDsnRequestTargets = {
  readonly store: GlitchtipRequestTarget;
  readonly securityReportEndpoint?: string;
};

const buildGlitchtipSecurityReportEndpoint = (input: {
  readonly origin: string;
  readonly baseSegments: readonly string[];
  readonly projectId: string;
  readonly sentryKey: string;
  readonly sentrySecret?: string;
}) => {
  const endpoint = new URL(
    `/${
      input.baseSegments.length > 0 ? `${input.baseSegments.join("/")}/` : ""
    }api/${input.projectId}/security/`,
    input.origin,
  );

  endpoint.searchParams.set("sentry_key", input.sentryKey);

  if (input.sentrySecret !== undefined && input.sentrySecret.length > 0) {
    endpoint.searchParams.set("sentry_secret", input.sentrySecret);
  }

  return endpoint.toString();
};

const resolveGlitchtipDsnRequestTargets = (dsn: string) =>
  Effect.try({
    try: () => new URL(dsn),
    catch: (cause) => new GlitchtipAdapterConfigurationError(dsn, cause),
  }).pipe(
    Effect.map((parsedUrl): GlitchtipDsnRequestTargets => {
      if (/\/api\/\d+\/store\/?$/.test(parsedUrl.pathname)) {
        return {
          store: {
            endpoint: parsedUrl.toString(),
            headers: {},
          },
        };
      }

      const pathnameSegments = trimTrailingSlashes(parsedUrl.pathname)
        .split("/")
        .filter((segment) => segment.length > 0);
      const projectId = pathnameSegments.at(-1);

      if (projectId === undefined) {
        return {
          store: {
            endpoint: parsedUrl.toString(),
            headers: {},
          },
        };
      }

      const baseSegments = pathnameSegments.slice(0, -1);
      const endpointPath = `/${
        baseSegments.length > 0 ? `${baseSegments.join("/")}/` : ""
      }api/${projectId}/store/`;
      const authParts = [
        "Sentry sentry_version=7",
        "sentry_client=comvestec-platform/1.0",
      ];

      if (parsedUrl.username.length > 0) {
        authParts.push(`sentry_key=${decodeURIComponent(parsedUrl.username)}`);
      }

      if (parsedUrl.password.length > 0) {
        authParts.push(
          `sentry_secret=${decodeURIComponent(parsedUrl.password)}`,
        );
      }

      const sentryKey =
        parsedUrl.username.length > 0
          ? decodeURIComponent(parsedUrl.username)
          : undefined;
      const sentrySecret =
        parsedUrl.password.length > 0
          ? decodeURIComponent(parsedUrl.password)
          : undefined;

      return {
        store: {
          endpoint: `${parsedUrl.origin}${endpointPath}`,
          headers:
            parsedUrl.username.length > 0 || parsedUrl.password.length > 0
              ? {
                  "X-Sentry-Auth": authParts.join(", "),
                }
              : {},
        },
        ...(sentryKey !== undefined
          ? {
              securityReportEndpoint: buildGlitchtipSecurityReportEndpoint({
                origin: parsedUrl.origin,
                baseSegments,
                projectId,
                sentryKey,
                ...(sentrySecret !== undefined ? { sentrySecret } : {}),
              }),
            }
          : {}),
      };
    }),
  );

const resolveGlitchtipStoreRequest = (dsn: string) =>
  resolveGlitchtipDsnRequestTargets(dsn).pipe(
    Effect.map((targets) => targets.store),
  );

export const resolveGlitchtipSecurityReportEndpoint = (dsn: string) =>
  resolveGlitchtipDsnRequestTargets(dsn).pipe(
    Effect.map((targets) => targets.securityReportEndpoint),
  );

const buildGlitchtipEventPayload = (input: GlitchtipExceptionCapture) => ({
  event_id: crypto.randomUUID().replaceAll("-", ""),
  timestamp: Math.floor(Date.now() / 1_000),
  level: "error",
  logger: input.service,
  server_name: input.service,
  platform: "javascript",
  culprit: `${input.method} ${input.path}`,
  message: `${input.errorName}: ${input.errorMessage}`,
  fingerprint: [input.service, input.method, input.path, input.errorName],
  tags: {
    correlationId: input.correlationId,
    method: input.method,
    path: input.path,
    status: `${input.status}`,
    outcome: "uncaught-error",
  },
  extra: {
    durationMs: input.durationMs,
    ...(input.errorStack !== undefined ? { errorStack: input.errorStack } : {}),
  },
});

const createGlitchtipHealthcheck = (input: {
  readonly dsn: string;
  readonly fetchImplementation: typeof fetch;
}): Effect.Effect<GlitchtipHealthcheck, GlitchtipAdapterError> =>
  resolveGlitchtipStoreRequest(input.dsn).pipe(
    Effect.flatMap((request) =>
      Effect.tryPromise({
        try: () =>
          input.fetchImplementation(request.endpoint, {
            method: "HEAD",
            headers: request.headers,
          }),
        catch: (cause) =>
          new GlitchtipAdapterTransportError(request.endpoint, cause),
      }).pipe(
        Effect.flatMap(
          (
            response,
          ): Effect.Effect<GlitchtipHealthcheck, GlitchtipAdapterError> =>
            response.status < 500 && response.status !== 404
              ? decodeGlitchtipHealthcheck({
                  healthy: true,
                  service: platformAdapterServiceName.glitchtip,
                })
              : Effect.fail(
                  new GlitchtipAdapterRequestError(
                    request.endpoint,
                    response.status,
                  ),
                ),
        ),
      ),
    ),
  );

export type GlitchtipAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.glitchtip;
  readonly dsn: string;
  readonly healthcheck: Effect.Effect<
    GlitchtipHealthcheck,
    GlitchtipAdapterError
  >;
  readonly captureException: (
    input: GlitchtipExceptionCapture,
  ) => Effect.Effect<GlitchtipExceptionCapture, GlitchtipAdapterError>;
};

export class GlitchtipAdapter extends Context.Tag("GlitchtipAdapter")<
  GlitchtipAdapter,
  GlitchtipAdapterService
>() {}

export const makeGlitchtipAdapter = (input: GlitchtipAdapterRuntimeOptions) =>
  Schema.decodeUnknown(GlitchtipAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): GlitchtipAdapterService => ({
        serviceName: platformAdapterServiceName.glitchtip,
        dsn: options.dsn,
        healthcheck: createGlitchtipHealthcheck({
          dsn: options.dsn,
          fetchImplementation: input.fetch ?? fetch,
        }),
        captureException: (captureInput: GlitchtipExceptionCapture) =>
          Schema.decodeUnknown(GlitchtipExceptionCaptureSchema)(
            captureInput,
          ).pipe(
            Effect.flatMap((capture) =>
              resolveGlitchtipStoreRequest(options.dsn).pipe(
                Effect.flatMap((request) =>
                  Effect.tryPromise({
                    try: async () => {
                      const response = await (input.fetch ?? fetch)(
                        request.endpoint,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            ...request.headers,
                          },
                          body: JSON.stringify(
                            buildGlitchtipEventPayload(capture),
                          ),
                        },
                      );

                      if (!response.ok) {
                        throw new GlitchtipAdapterRequestError(
                          request.endpoint,
                          response.status,
                        );
                      }

                      return capture;
                    },
                    catch: (cause) => {
                      if (cause instanceof GlitchtipAdapterRequestError) {
                        return cause;
                      }

                      return new GlitchtipAdapterTransportError(
                        options.dsn,
                        cause,
                      );
                    },
                  }),
                ),
              ),
            ),
          ),
      }),
    ),
  );

export const makeGlitchtipAdapterLayer = (options: GlitchtipAdapterOptions) =>
  Layer.effect(GlitchtipAdapter, makeGlitchtipAdapter(options));
