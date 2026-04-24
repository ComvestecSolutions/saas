import { Effect, Schema } from "effect";
import { telemetryKind } from "@comvestec/contracts";
import { makeObservabilityAdapter } from "../../adapters";

export const platformRequestCorrelationIdHeaderName = "x-correlation-id";

const RequestBoundaryObservabilityEnvironmentSchema = Schema.Struct({
  OTEL_EXPORTER_OTLP_ENDPOINT: Schema.NonEmptyString,
  GRAFANA_BASE_URL: Schema.NonEmptyString,
});

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

type PlatformRequestTelemetryEmitter = (
  input: PlatformRequestTelemetry,
) => Promise<void>;

type PlatformUnhandledErrorResponseBuilder = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) => Response;

type PlatformRequestCorrelationIdResolver = (input: {
  readonly request: Request;
  readonly correlationHeaderName: string;
}) => string | undefined | Promise<string | undefined>;

export type PlatformRequestBoundary = {
  readonly wrap: (handler: PlatformRequestHandler) => PlatformRequestHandler;
};

export type PlatformRequestBoundaryOptions = {
  readonly emitRequestTelemetry?: PlatformRequestTelemetryEmitter;
  readonly correlationHeaderName?: string;
  readonly buildUnhandledErrorResponse?: PlatformUnhandledErrorResponseBuilder;
  readonly resolveCorrelationId?: PlatformRequestCorrelationIdResolver;
};

export type ObservedPlatformRequestBoundaryOptions = Omit<
  PlatformRequestBoundaryOptions,
  "emitRequestTelemetry"
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

  return new Request(input.request, { headers });
};

const buildResponseWithCorrelationId = (input: {
  readonly response: Response;
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) => {
  const headers = new Headers(input.response.headers);

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
        const response = await handler(requestWithCorrelationId);
        const responseWithCorrelationId = buildResponseWithCorrelationId({
          response,
          correlationHeaderName,
          correlationId,
        });

        emitRequestTelemetry(options.emitRequestTelemetry, {
          correlationId,
          method: request.method,
          path,
          status: responseWithCorrelationId.status,
          durationMs: Date.now() - startedAt,
          outcome: "response",
        });

        return responseWithCorrelationId;
      } catch {
        const responseWithCorrelationId = buildResponseWithCorrelationId({
          response: buildUnhandledErrorResponse({
            correlationHeaderName,
            correlationId,
          }),
          correlationHeaderName,
          correlationId,
        });

        emitRequestTelemetry(options.emitRequestTelemetry, {
          correlationId,
          method: request.method,
          path,
          status: responseWithCorrelationId.status,
          durationMs: Date.now() - startedAt,
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
        makeObservabilityAdapter({
          otlpHttpEndpoint: resolvedEnvironment.OTEL_EXPORTER_OTLP_ENDPOINT,
          grafanaBaseUrl: resolvedEnvironment.GRAFANA_BASE_URL,
        }),
      ),
      Effect.either,
    ),
  );

  if (adapterResolution._tag === "Left") {
    return undefined;
  }

  return async (telemetry: PlatformRequestTelemetry) => {
    await Effect.runPromise(
      Effect.ignore(
        adapterResolution.right.emit({
          kind: telemetryKind.trace,
          service: input.serviceName,
          payload: telemetry,
        }),
      ),
    );
  };
};

export const createObservedPlatformRequestBoundary = (
  options: ObservedPlatformRequestBoundaryOptions,
): PlatformRequestBoundary => {
  const telemetryEmitter = createPlatformRequestObservabilityTelemetryEmitter({
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
    ...(telemetryEmitter !== undefined
      ? { emitRequestTelemetry: telemetryEmitter }
      : {}),
  });
};
