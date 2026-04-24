import {
  createPlatformRequestBoundary,
  createPlatformRequestObservabilityTelemetryEmitter,
  platformRequestCorrelationIdHeaderName,
  type PlatformRequestBoundary,
  type PlatformRequestBoundaryOptions,
  type PlatformRequestHandler,
  type PlatformRequestTelemetry,
} from "../services/communication/request-boundary";

export const backendApiCorrelationIdHeaderName =
  platformRequestCorrelationIdHeaderName;

const backendApiTelemetryServiceName = "backend-api";

export type BackendApiRequestHandler = PlatformRequestHandler;
export type BackendApiRequestTelemetry = PlatformRequestTelemetry;
export type BackendApiRequestMiddleware = PlatformRequestBoundary;
export type BackendApiRequestMiddlewareOptions = Omit<
  PlatformRequestBoundaryOptions,
  "buildUnhandledErrorResponse"
>;

const buildBackendApiUnhandledErrorResponse = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) =>
  Response.json(
    { error: "Backend API request failed." },
    {
      status: 500,
      headers: {
        [input.correlationHeaderName]: input.correlationId,
      },
    },
  );

export const createBackendApiRequestMiddleware = (
  options: BackendApiRequestMiddlewareOptions = {},
): BackendApiRequestMiddleware =>
  createPlatformRequestBoundary({
    buildUnhandledErrorResponse: buildBackendApiUnhandledErrorResponse,
    ...(options.correlationHeaderName !== undefined
      ? { correlationHeaderName: options.correlationHeaderName }
      : {}),
    ...(options.emitRequestTelemetry !== undefined
      ? { emitRequestTelemetry: options.emitRequestTelemetry }
      : {}),
  });

export const createBackendApiObservabilityTelemetryEmitter = (
  environment: unknown,
) => {
  return createPlatformRequestObservabilityTelemetryEmitter({
    environment,
    serviceName: backendApiTelemetryServiceName,
  });
};
