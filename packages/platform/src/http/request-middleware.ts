import { Effect, Schema } from "effect";
import {
  type BillingProviderWebhookInput,
  type EmailDeliveryProviderEvent,
} from "@comvestec/contracts";
import {
  type PolarWebhookValidationError,
  type PostalWebhookValidationError,
  validateAndNormalizePolarWebhookRequest,
  validateAndNormalizePostalWebhookRequest,
} from "../adapters";
import {
  extractSubscriberJourneySessionId,
  subscriberJourneySessionHeaderName,
} from "../services/access/request-context-transport";
import {
  createPlatformRequestGlitchtipSecurityReportHeadersResolver,
  createPlatformRequestBoundary,
  createPlatformRequestErrorTrackingReporter,
  createPlatformRequestObservabilityTelemetryEmitter,
  platformRequestCorrelationIdHeaderName,
  type PlatformRequestBoundary,
  type PlatformRequestBoundaryOptions,
  type PlatformRequestHandler,
  type PlatformRequestResponseHeadersResolver,
  type PlatformRequestTelemetry,
} from "../services/communication/request-boundary";

export const backendApiCorrelationIdHeaderName =
  platformRequestCorrelationIdHeaderName;

const backendApiTelemetryServiceName = "backend-api";
const backendApiPolarWebhookPath =
  "/api/subscriber-journey/billing/webhooks/polar";
const backendApiPostalWebhookPath =
  "/api/communication/email-delivery/provider-events/postal";

const BackendApiPolarWebhookEnvironmentSchema = Schema.Struct({
  POLAR_WEBHOOK_SECRET: Schema.NonEmptyString,
});

const BackendApiPostalWebhookEnvironmentSchema = Schema.Struct({
  POSTAL_API_URL: Schema.NonEmptyString,
  POSTAL_SIGNING_KEY_BASE64: Schema.optional(Schema.NonEmptyString),
});

type BackendApiPreparedPolarWebhookRequestState =
  | {
      readonly kind: "success";
      readonly value: BillingProviderWebhookInput | null;
    }
  | {
      readonly kind: "failure";
      readonly error:
        | BackendApiWebhookEnvironmentError
        | PolarWebhookValidationError;
    };

type BackendApiPreparedPostalWebhookRequestState =
  | {
      readonly kind: "success";
      readonly value: EmailDeliveryProviderEvent | null;
    }
  | {
      readonly kind: "failure";
      readonly error:
        | EmailDeliveryProviderEventsEnvironmentError
        | PostalWebhookValidationError;
    };

type BackendApiWebhookEnvironmentError = {
  readonly _tag: "WebhooksApiEnvironmentError";
};

type EmailDeliveryProviderEventsEnvironmentError = {
  readonly _tag: "EmailDeliveryProviderEventsEnvironmentError";
};

const preparedPolarWebhookRequests = new WeakMap<
  Request,
  BackendApiPreparedPolarWebhookRequestState
>();

const preparedPostalWebhookRequests = new WeakMap<
  Request,
  BackendApiPreparedPostalWebhookRequestState
>();

export type BackendApiRequestHandler = PlatformRequestHandler;
export type BackendApiRequestTelemetry = PlatformRequestTelemetry;
export type BackendApiRequestMiddleware = PlatformRequestBoundary;
export type BackendApiRequestMiddlewareOptions = Omit<
  PlatformRequestBoundaryOptions,
  "buildUnhandledErrorResponse" | "transformRequest"
> & {
  readonly environment?: unknown;
};

const combineResponseHeaderResolvers = (
  ...resolvers: readonly (PlatformRequestResponseHeadersResolver | undefined)[]
): PlatformRequestResponseHeadersResolver | undefined => {
  const activeResolvers = resolvers.filter(
    (resolver): resolver is PlatformRequestResponseHeadersResolver =>
      resolver !== undefined,
  );

  if (activeResolvers.length === 0) {
    return undefined;
  }

  return async (input) => {
    let mergedHeaders: Headers | undefined;

    for (const resolver of activeResolvers) {
      const resolvedHeaders = await resolver(input);

      if (resolvedHeaders === undefined) {
        continue;
      }

      mergedHeaders ??= new Headers();

      for (const [name, value] of new Headers(resolvedHeaders)) {
        if (!mergedHeaders.has(name)) {
          mergedHeaders.set(name, value);
        }
      }
    }

    return mergedHeaders;
  };
};

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

const cloneRequestWithSessionHeader = async (input: {
  readonly request: Request;
  readonly sessionId: string;
}) => {
  const headers = new Headers(input.request.headers);

  headers.set(subscriberJourneySessionHeaderName, input.sessionId);

  const body =
    input.request.method === "GET" || input.request.method === "HEAD"
      ? undefined
      : await input.request.clone().arrayBuffer();

  return new Request(input.request.url, {
    method: input.request.method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
};

const buildPreparedBackendApiRequest = async (input: {
  readonly request: Request;
  readonly environment: unknown;
}) => {
  const sessionId = await Effect.runPromise(
    extractSubscriberJourneySessionId(input.request),
  );
  const pathname = new URL(input.request.url).pathname;
  const existingSessionHeader = input.request.headers
    .get(subscriberJourneySessionHeaderName)
    ?.trim();
  const preparedRequest =
    sessionId === undefined || existingSessionHeader === sessionId
      ? input.request
      : await cloneRequestWithSessionHeader({
          request: input.request,
          sessionId,
        });

  if (
    sessionId === undefined &&
    pathname !== backendApiPolarWebhookPath &&
    pathname !== backendApiPostalWebhookPath
  ) {
    return preparedRequest;
  }

  if (
    pathname !== backendApiPolarWebhookPath &&
    pathname !== backendApiPostalWebhookPath
  ) {
    return preparedRequest;
  }

  if (pathname === backendApiPolarWebhookPath) {
    const verification = await Effect.runPromise(
      Schema.decodeUnknown(BackendApiPolarWebhookEnvironmentSchema)(
        input.environment,
      ).pipe(
        Effect.mapError(
          () =>
            ({
              _tag: "WebhooksApiEnvironmentError",
            }) satisfies BackendApiWebhookEnvironmentError,
        ),
        Effect.flatMap((resolvedEnvironment) =>
          validateAndNormalizePolarWebhookRequest({
            request: preparedRequest.clone(),
            secret: resolvedEnvironment.POLAR_WEBHOOK_SECRET,
          }),
        ),
        Effect.either,
      ),
    );

    preparedPolarWebhookRequests.set(
      preparedRequest,
      verification._tag === "Right"
        ? {
            kind: "success",
            value: verification.right,
          }
        : {
            kind: "failure",
            error: verification.left,
          },
    );
  }

  if (pathname === backendApiPostalWebhookPath) {
    const verification = await Effect.runPromise(
      Schema.decodeUnknown(BackendApiPostalWebhookEnvironmentSchema)(
        input.environment,
      ).pipe(
        Effect.mapError(
          () =>
            ({
              _tag: "EmailDeliveryProviderEventsEnvironmentError",
            }) as const,
        ),
        Effect.flatMap((resolvedEnvironment) =>
          validateAndNormalizePostalWebhookRequest({
            request: preparedRequest.clone(),
            apiUrl: resolvedEnvironment.POSTAL_API_URL,
            ...(resolvedEnvironment.POSTAL_SIGNING_KEY_BASE64 !== undefined
              ? {
                  signingKeyBase64:
                    resolvedEnvironment.POSTAL_SIGNING_KEY_BASE64,
                }
              : {}),
          }),
        ),
        Effect.either,
      ),
    );

    preparedPostalWebhookRequests.set(
      preparedRequest,
      verification._tag === "Right"
        ? {
            kind: "success",
            value: verification.right,
          }
        : {
            kind: "failure",
            error: verification.left,
          },
    );
  }

  return preparedRequest;
};

export const readPreparedBackendApiPolarWebhookRequest = (
  request: Request,
): Effect.Effect<
  BillingProviderWebhookInput | null | undefined,
  BackendApiWebhookEnvironmentError | PolarWebhookValidationError
> => {
  const preparedRequest = preparedPolarWebhookRequests.get(request);

  if (preparedRequest === undefined) {
    return Effect.succeed<BillingProviderWebhookInput | null | undefined>(
      undefined,
    );
  }

  if (preparedRequest.kind === "failure") {
    return Effect.fail(preparedRequest.error);
  }

  return Effect.succeed(preparedRequest.value);
};

export const readPreparedBackendApiPostalWebhookRequest = (
  request: Request,
): Effect.Effect<
  EmailDeliveryProviderEvent | null | undefined,
  EmailDeliveryProviderEventsEnvironmentError | PostalWebhookValidationError
> => {
  const preparedRequest = preparedPostalWebhookRequests.get(request);

  if (preparedRequest === undefined) {
    return Effect.succeed<EmailDeliveryProviderEvent | null | undefined>(
      undefined,
    );
  }

  if (preparedRequest.kind === "failure") {
    return Effect.fail(preparedRequest.error);
  }

  return Effect.succeed(preparedRequest.value);
};

export const createBackendApiRequestMiddleware = (
  options: BackendApiRequestMiddlewareOptions = {},
): BackendApiRequestMiddleware => {
  const securityReportHeadersResolver =
    createPlatformRequestGlitchtipSecurityReportHeadersResolver({
      environment: options.environment ?? {},
    });
  const responseHeadersResolver = combineResponseHeaderResolvers(
    securityReportHeadersResolver,
    options.resolveResponseHeaders,
  );

  return createPlatformRequestBoundary({
    buildUnhandledErrorResponse: buildBackendApiUnhandledErrorResponse,
    ...(options.correlationHeaderName !== undefined
      ? { correlationHeaderName: options.correlationHeaderName }
      : {}),
    ...(options.emitRequestTelemetry !== undefined
      ? { emitRequestTelemetry: options.emitRequestTelemetry }
      : {}),
    ...(options.reportUnhandledRequestError !== undefined
      ? { reportUnhandledRequestError: options.reportUnhandledRequestError }
      : {}),
    ...(responseHeadersResolver !== undefined
      ? { resolveResponseHeaders: responseHeadersResolver }
      : {}),
    transformRequest: (request) =>
      buildPreparedBackendApiRequest({
        request,
        environment: options.environment ?? {},
      }),
  });
};

export const createBackendApiObservabilityTelemetryEmitter = (
  environment: unknown,
) => {
  return createPlatformRequestObservabilityTelemetryEmitter({
    environment,
    serviceName: backendApiTelemetryServiceName,
  });
};

export const createBackendApiObservabilityErrorReporter = (
  environment: unknown,
) => {
  return createPlatformRequestErrorTrackingReporter({
    environment,
    serviceName: backendApiTelemetryServiceName,
  });
};
