import { Effect, Schema } from "effect";
import { telemetryKind } from "@comvestec/contracts";
import {
  makeGlitchtipAdapter,
  makeObservabilityAdapter,
  resolveGlitchtipSecurityReportEndpoint,
} from "../../adapters";

export const platformRequestCorrelationIdHeaderName = "x-correlation-id";

const RequestBoundaryRawObservabilityEnvironmentSchema = Schema.Struct({
  OTEL_EXPORTER_OTLP_ENDPOINT: Schema.NonEmptyString,
  GRAFANA_BASE_URL: Schema.NonEmptyString,
});

const RequestBoundaryRuntimeObservabilityEnvironmentSchema = Schema.Struct({
  otelEndpoint: Schema.NonEmptyString,
  grafanaBaseUrl: Schema.NonEmptyString,
});

const RequestBoundaryObservabilityEnvironmentSchema = Schema.Union(
  RequestBoundaryRawObservabilityEnvironmentSchema,
  RequestBoundaryRuntimeObservabilityEnvironmentSchema,
);

const RequestBoundaryRawErrorTrackingEnvironmentSchema = Schema.Struct({
  ERROR_TRACKING_DSN: Schema.NonEmptyString,
});

const RequestBoundaryRuntimeErrorTrackingEnvironmentSchema = Schema.Struct({
  errorTrackingDsn: Schema.NonEmptyString,
});

const RequestBoundaryErrorTrackingEnvironmentSchema = Schema.Union(
  RequestBoundaryRawErrorTrackingEnvironmentSchema,
  RequestBoundaryRuntimeErrorTrackingEnvironmentSchema,
);

export type PlatformRequestHandler = (
  request: Request,
) => Response | Promise<Response>;

export type PlatformRequestTelemetry = {
  readonly correlationId: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
  readonly outcome: "response" | "uncaught-error";
};

type PlatformUnhandledRequestError = {
  readonly correlationId: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
  readonly errorName: string;
  readonly errorMessage: string;
  readonly errorStack?: string;
};

type PlatformRequestTelemetryEmitter = (
  input: PlatformRequestTelemetry,
) => Promise<void>;

type PlatformUnhandledRequestErrorReporter = (
  input: PlatformUnhandledRequestError,
) => Promise<void>;

type PlatformUnhandledErrorResponseBuilder = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) => Response;

type PlatformRequestTransformer = (
  request: Request,
) => Request | Promise<Request>;

export type PlatformRequestResponseHeadersResolver = (input: {
  readonly request: Request;
  readonly response: Response;
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) => HeadersInit | undefined | Promise<HeadersInit | undefined>;

type PlatformRequestCorrelationIdResolver = (input: {
  readonly request: Request;
  readonly correlationHeaderName: string;
}) => string | undefined | Promise<string | undefined>;

export type PlatformRequestBoundary = {
  readonly wrap: (handler: PlatformRequestHandler) => PlatformRequestHandler;
};

export type PlatformRequestBoundaryOptions = {
  readonly emitRequestTelemetry?: PlatformRequestTelemetryEmitter;
  readonly reportUnhandledRequestError?: PlatformUnhandledRequestErrorReporter;
  readonly correlationHeaderName?: string;
  readonly buildUnhandledErrorResponse?: PlatformUnhandledErrorResponseBuilder;
  readonly resolveCorrelationId?: PlatformRequestCorrelationIdResolver;
  readonly transformRequest?: PlatformRequestTransformer;
  readonly resolveResponseHeaders?: PlatformRequestResponseHeadersResolver;
};

export type ObservedPlatformRequestBoundaryOptions = Omit<
  PlatformRequestBoundaryOptions,
  "emitRequestTelemetry" | "reportUnhandledRequestError"
> & {
  readonly environment: unknown;
  readonly serviceName: string;
};

const sanitizeCorrelationId = (value: string | undefined) => {
  const trimmedValue = value?.trim();

  return trimmedValue !== undefined && trimmedValue.length > 0
    ? trimmedValue
    : undefined;
};

const resolvePlatformRequestCorrelationId = async (input: {
  readonly request: Request;
  readonly correlationHeaderName: string;
  readonly resolveCorrelationId?: PlatformRequestCorrelationIdResolver;
}) => {
  const incomingCorrelationId = sanitizeCorrelationId(
    input.request.headers.get(input.correlationHeaderName) ?? undefined,
  );

  if (incomingCorrelationId !== undefined) {
    return incomingCorrelationId;
  }

  let resolvedCorrelationId: string | undefined;

  try {
    resolvedCorrelationId = sanitizeCorrelationId(
      await input.resolveCorrelationId?.({
        request: input.request,
        correlationHeaderName: input.correlationHeaderName,
      }),
    );
  } catch {
    resolvedCorrelationId = undefined;
  }

  return resolvedCorrelationId ?? crypto.randomUUID();
};

const buildRequestWithCorrelationId = (input: {
  readonly request: Request;
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) => {
  const headers = new Headers(input.request.headers);

  headers.set(input.correlationHeaderName, input.correlationId);

  return new Request(input.request, {
    headers,
  });
};

const buildResponseWithCorrelationId = (input: {
  readonly response: Response;
  readonly correlationHeaderName: string;
  readonly correlationId: string;
  readonly additionalHeaders?: HeadersInit;
}) => {
  const headers = new Headers(input.response.headers);

  if (input.additionalHeaders !== undefined) {
    for (const [name, value] of new Headers(input.additionalHeaders)) {
      if (!headers.has(name)) {
        headers.set(name, value);
      }
    }
  }

  headers.set(input.correlationHeaderName, input.correlationId);

  return new Response(input.response.body, {
    status: input.response.status,
    statusText: input.response.statusText,
    headers,
  });
};

const buildDefaultUnhandledErrorResponse = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) =>
  Response.json(
    { error: "Request failed." },
    {
      status: 500,
      headers: {
        [input.correlationHeaderName]: input.correlationId,
      },
    },
  );

const emitRequestTelemetry = (
  emitter: PlatformRequestTelemetryEmitter | undefined,
  telemetry: PlatformRequestTelemetry,
) => {
  if (emitter === undefined) {
    return;
  }

  void emitter(telemetry).catch(() => undefined);
};

const reportUnhandledRequestError = (
  reporter: PlatformUnhandledRequestErrorReporter | undefined,
  error: PlatformUnhandledRequestError,
) => {
  if (reporter === undefined) {
    return;
  }

  void reporter(error).catch(() => undefined);
};

const buildPlatformUnhandledRequestError = (input: {
  readonly correlationId: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
  readonly error: unknown;
}): PlatformUnhandledRequestError => {
  const resolvedError = input.error instanceof Error ? input.error : undefined;
  const stringError =
    typeof input.error === "string" && input.error.trim().length > 0
      ? input.error.trim()
      : undefined;
  const resolvedMessage =
    resolvedError !== undefined && resolvedError.message.trim().length > 0
      ? resolvedError.message.trim()
      : undefined;
  const resolvedName =
    resolvedError !== undefined && resolvedError.name.trim().length > 0
      ? resolvedError.name.trim()
      : undefined;
  const resolvedStack =
    resolvedError !== undefined && resolvedError.stack?.trim().length
      ? resolvedError.stack
      : undefined;

  return {
    correlationId: input.correlationId,
    method: input.method,
    path: input.path,
    status: input.status,
    durationMs: input.durationMs,
    errorName: resolvedName ?? "Error",
    errorMessage: resolvedMessage ?? stringError ?? "Request failed.",
    ...(resolvedStack !== undefined ? { errorStack: resolvedStack } : {}),
  };
};

const normalizeObservabilityEnvironment = (
  input: Schema.Schema.Type<
    typeof RequestBoundaryObservabilityEnvironmentSchema
  >,
) =>
  "OTEL_EXPORTER_OTLP_ENDPOINT" in input
    ? {
        otlpHttpEndpoint: input.OTEL_EXPORTER_OTLP_ENDPOINT,
        grafanaBaseUrl: input.GRAFANA_BASE_URL,
      }
    : {
        otlpHttpEndpoint: input.otelEndpoint,
        grafanaBaseUrl: input.grafanaBaseUrl,
      };

const normalizeErrorTrackingEnvironment = (
  input: Schema.Schema.Type<
    typeof RequestBoundaryErrorTrackingEnvironmentSchema
  >,
) =>
  "ERROR_TRACKING_DSN" in input
    ? { dsn: input.ERROR_TRACKING_DSN }
    : { dsn: input.errorTrackingDsn };

const requestBoundaryObservabilityEnvironmentKeys = [
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "GRAFANA_BASE_URL",
  "otelEndpoint",
  "grafanaBaseUrl",
] as const;

const requestBoundaryErrorTrackingEnvironmentKeys = [
  "ERROR_TRACKING_DSN",
  "errorTrackingDsn",
] as const;

const requestBoundaryDocumentContentTypes = [
  "text/html",
  "application/xhtml+xml",
] as const;

const requestBoundaryDocumentDestinations = ["document", "iframe"] as const;

const requestBoundarySecurityReportOnlyHeaderName =
  "Content-Security-Policy-Report-Only";

const hasAnyEnvironmentKey = (environment: unknown, keys: readonly string[]) =>
  typeof environment === "object" &&
  environment !== null &&
  keys.some((key) => key in environment);

const reportRequestBoundaryInitializationFailure = (input: {
  readonly serviceName: string;
  readonly concern: "request telemetry" | "error tracking";
  readonly cause: unknown;
}) => {
  globalThis.console?.error(
    `[${input.serviceName}] Failed to initialize ${input.concern}.`,
    input.cause,
  );
};

const reportRequestBoundaryRuntimeFailure = (input: {
  readonly serviceName: string;
  readonly concern:
    | "emit request telemetry"
    | "capture unhandled request error";
  readonly cause: unknown;
}) => {
  globalThis.console?.error(
    `[${input.serviceName}] Failed to ${input.concern}.`,
    input.cause,
  );
};

const isDocumentResponse = (input: {
  readonly request: Request;
  readonly response: Response;
}) => {
  const responseContentType = input.response.headers
    .get("content-type")
    ?.toLowerCase();
  const requestAccept = input.request.headers.get("accept")?.toLowerCase();
  const requestDestination = input.request.headers
    .get("sec-fetch-dest")
    ?.toLowerCase();

  if (responseContentType !== undefined) {
    return requestBoundaryDocumentContentTypes.some((contentType) =>
      responseContentType.startsWith(contentType),
    );
  }

  return (
    requestBoundaryDocumentDestinations.some(
      (destination) => requestDestination === destination,
    ) || requestAccept?.includes("text/html") === true
  );
};

const buildSecurityReportOnlyPolicy = (securityReportEndpoint: string) =>
  `object-src 'none'; base-uri 'self'; report-uri ${securityReportEndpoint}`;

export const createPlatformRequestBoundary = (
  options: PlatformRequestBoundaryOptions = {},
): PlatformRequestBoundary => {
  const correlationHeaderName =
    options.correlationHeaderName ?? platformRequestCorrelationIdHeaderName;
  const buildUnhandledErrorResponse =
    options.buildUnhandledErrorResponse ?? buildDefaultUnhandledErrorResponse;

  return {
    wrap: (handler) => async (request) => {
      const correlationId = await resolvePlatformRequestCorrelationId({
        request,
        correlationHeaderName,
        ...(options.resolveCorrelationId !== undefined
          ? { resolveCorrelationId: options.resolveCorrelationId }
          : {}),
      });
      const requestWithCorrelationId = buildRequestWithCorrelationId({
        request,
        correlationHeaderName,
        correlationId,
      });
      const path = new URL(request.url).pathname;
      const startedAt = Date.now();

      try {
        const transformedRequest =
          (await options.transformRequest?.(requestWithCorrelationId)) ??
          requestWithCorrelationId;
        const response = await handler(transformedRequest);
        const additionalHeaders = await options.resolveResponseHeaders?.({
          request: transformedRequest,
          response,
          correlationHeaderName,
          correlationId,
        });
        const responseWithCorrelationId = buildResponseWithCorrelationId({
          response,
          correlationHeaderName,
          correlationId,
          ...(additionalHeaders !== undefined ? { additionalHeaders } : {}),
        });
        const durationMs = Date.now() - startedAt;

        emitRequestTelemetry(options.emitRequestTelemetry, {
          correlationId,
          method: request.method,
          path,
          status: responseWithCorrelationId.status,
          durationMs,
          outcome: "response",
        });

        return responseWithCorrelationId;
      } catch (error) {
        const fallbackResponse = buildUnhandledErrorResponse({
          correlationHeaderName,
          correlationId,
        });
        const additionalHeaders = await options.resolveResponseHeaders?.({
          request: requestWithCorrelationId,
          response: fallbackResponse,
          correlationHeaderName,
          correlationId,
        });
        const responseWithCorrelationId = buildResponseWithCorrelationId({
          response: fallbackResponse,
          correlationHeaderName,
          correlationId,
          ...(additionalHeaders !== undefined ? { additionalHeaders } : {}),
        });
        const durationMs = Date.now() - startedAt;

        reportUnhandledRequestError(
          options.reportUnhandledRequestError,
          buildPlatformUnhandledRequestError({
            correlationId,
            method: request.method,
            path,
            status: responseWithCorrelationId.status,
            durationMs,
            error,
          }),
        );

        emitRequestTelemetry(options.emitRequestTelemetry, {
          correlationId,
          method: request.method,
          path,
          status: responseWithCorrelationId.status,
          durationMs,
          outcome: "uncaught-error",
        });

        return responseWithCorrelationId;
      }
    },
  };
};

export const createPlatformRequestObservabilityTelemetryEmitter = (input: {
  readonly environment: unknown;
  readonly serviceName: string;
}) => {
  const adapterResolution = Effect.runSync(
    Schema.decodeUnknown(RequestBoundaryObservabilityEnvironmentSchema)(
      input.environment,
    ).pipe(
      Effect.flatMap((resolvedEnvironment) =>
        makeObservabilityAdapter(
          normalizeObservabilityEnvironment(resolvedEnvironment),
        ),
      ),
      Effect.either,
    ),
  );

  if (adapterResolution._tag === "Left") {
    if (
      hasAnyEnvironmentKey(
        input.environment,
        requestBoundaryObservabilityEnvironmentKeys,
      )
    ) {
      reportRequestBoundaryInitializationFailure({
        serviceName: input.serviceName,
        concern: "request telemetry",
        cause: adapterResolution.left,
      });
    }

    return undefined;
  }

  return async (telemetry: PlatformRequestTelemetry) => {
    await Effect.runPromise(
      adapterResolution.right.emit({
        kind: telemetryKind.trace,
        service: input.serviceName,
        payload: telemetry,
      }),
    ).catch((cause) => {
      reportRequestBoundaryRuntimeFailure({
        serviceName: input.serviceName,
        concern: "emit request telemetry",
        cause,
      });
    });
  };
};

export const createPlatformRequestErrorTrackingReporter = (input: {
  readonly environment: unknown;
  readonly serviceName: string;
}) => {
  const adapterResolution = Effect.runSync(
    Schema.decodeUnknown(RequestBoundaryErrorTrackingEnvironmentSchema)(
      input.environment,
    ).pipe(
      Effect.flatMap((resolvedEnvironment) =>
        makeGlitchtipAdapter(
          normalizeErrorTrackingEnvironment(resolvedEnvironment),
        ),
      ),
      Effect.either,
    ),
  );

  if (adapterResolution._tag === "Left") {
    if (
      hasAnyEnvironmentKey(
        input.environment,
        requestBoundaryErrorTrackingEnvironmentKeys,
      )
    ) {
      reportRequestBoundaryInitializationFailure({
        serviceName: input.serviceName,
        concern: "error tracking",
        cause: adapterResolution.left,
      });
    }

    return undefined;
  }

  return async (error: PlatformUnhandledRequestError) => {
    await Effect.runPromise(
      adapterResolution.right.captureException({
        service: input.serviceName,
        ...error,
      }),
    ).catch((cause) => {
      reportRequestBoundaryRuntimeFailure({
        serviceName: input.serviceName,
        concern: "capture unhandled request error",
        cause,
      });
    });
  };
};

export const createPlatformRequestGlitchtipSecurityReportHeadersResolver =
  (input: {
    readonly environment: unknown;
  }): PlatformRequestResponseHeadersResolver | undefined => {
    const environmentResolution = Effect.runSync(
      Schema.decodeUnknown(RequestBoundaryErrorTrackingEnvironmentSchema)(
        input.environment,
      ).pipe(Effect.map(normalizeErrorTrackingEnvironment), Effect.either),
    );

    if (environmentResolution._tag === "Left") {
      return undefined;
    }

    const securityReportEndpointResolution = Effect.runSync(
      Effect.either(
        resolveGlitchtipSecurityReportEndpoint(environmentResolution.right.dsn),
      ),
    );

    if (securityReportEndpointResolution._tag === "Left") {
      return undefined;
    }

    const securityReportEndpoint = securityReportEndpointResolution.right;

    if (securityReportEndpoint === undefined) {
      return undefined;
    }

    return ({ request, response }) =>
      isDocumentResponse({ request, response })
        ? {
            [requestBoundarySecurityReportOnlyHeaderName]:
              buildSecurityReportOnlyPolicy(securityReportEndpoint),
          }
        : undefined;
  };

export const createObservedPlatformRequestBoundary = (
  options: ObservedPlatformRequestBoundaryOptions,
): PlatformRequestBoundary => {
  const telemetryEmitter = createPlatformRequestObservabilityTelemetryEmitter({
    environment: options.environment,
    serviceName: options.serviceName,
  });
  const errorReporter = createPlatformRequestErrorTrackingReporter({
    environment: options.environment,
    serviceName: options.serviceName,
  });

  return createPlatformRequestBoundary({
    ...(options.correlationHeaderName !== undefined
      ? { correlationHeaderName: options.correlationHeaderName }
      : {}),
    ...(options.buildUnhandledErrorResponse !== undefined
      ? { buildUnhandledErrorResponse: options.buildUnhandledErrorResponse }
      : {}),
    ...(options.resolveCorrelationId !== undefined
      ? { resolveCorrelationId: options.resolveCorrelationId }
      : {}),
    ...(options.transformRequest !== undefined
      ? { transformRequest: options.transformRequest }
      : {}),
    ...(options.resolveResponseHeaders !== undefined
      ? { resolveResponseHeaders: options.resolveResponseHeaders }
      : {}),
    ...(telemetryEmitter !== undefined
      ? { emitRequestTelemetry: telemetryEmitter }
      : {}),
    ...(errorReporter !== undefined
      ? { reportUnhandledRequestError: errorReporter }
      : {}),
  });
};
