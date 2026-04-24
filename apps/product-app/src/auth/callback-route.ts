import { Effect, Schema } from "effect";
import {
  buildSubscriberJourneySessionCookieHeader,
  completeSubscriberAuthenticationFromEnvironment,
  createJsonResponse,
  createObservedPlatformRequestBoundary,
  decodeProductAppAuthCallbackStateFromEnvironment,
  decodeProductAppAuthCallbackStatePayloadFromEnvironment,
  isTaggedError,
  matchHttpEffect,
  platformRequestCorrelationIdHeaderName,
  readOptionalSearchParam,
} from "@comvestec/platform";

const productAuthCallbackTelemetryServiceName = "product-app-auth-callback";

const ProductAuthCallbackQuerySchema = Schema.Struct({
  code: Schema.NonEmptyString,
  state: Schema.NonEmptyString,
});

type ProductAuthCallbackQuery = Schema.Schema.Type<
  typeof ProductAuthCallbackQuerySchema
>;

type CompleteSubscriberAuthentication = (
  input: Parameters<typeof completeSubscriberAuthenticationFromEnvironment>[1],
) => Effect.Effect<
  { readonly session: { readonly sessionId: string } },
  unknown
>;

type ProductAuthCallbackProviderError = {
  readonly _tag: "ProductAuthCallbackProviderError";
  readonly error: string;
  readonly description?: string;
};

const decodeProductAuthCallbackQuery = (url: URL) =>
  Schema.decodeUnknown(ProductAuthCallbackQuerySchema)({
    code: readOptionalSearchParam(url, "code"),
    state: readOptionalSearchParam(url, "state"),
  });

const detectProviderError = (
  url: URL,
): Effect.Effect<void, ProductAuthCallbackProviderError> => {
  const providerError = url.searchParams.get("error");

  if (providerError === null) {
    return Effect.void;
  }

  const description = readOptionalSearchParam(url, "error_description");

  return Effect.fail({
    _tag: "ProductAuthCallbackProviderError",
    error: providerError,
    ...(description !== undefined ? { description } : {}),
  } satisfies ProductAuthCallbackProviderError);
};

const isProductAuthCallbackProviderError = (
  error: unknown,
): error is ProductAuthCallbackProviderError =>
  isTaggedError(error) && error._tag === "ProductAuthCallbackProviderError";

const buildAuthCallbackRouteErrorResponse = (error: unknown) => {
  if (isProductAuthCallbackProviderError(error)) {
    return createJsonResponse(
      {
        error: "Identity provider returned an authentication error.",
        providerError: error.error,
        ...(error.description !== undefined
          ? { description: error.description }
          : {}),
      },
      401,
    );
  }

  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
      case "ProductAppAuthCallbackStateInvalidError":
      case "ProductAppAuthCallbackRedirectNotAllowedError":
        return createJsonResponse(
          {
            error:
              "Auth callback query or callback state did not match the expected contract.",
          },
          400,
        );
      case "ProductAppAuthCallbackStateExpiredError":
        return createJsonResponse(
          { error: "Authentication callback state has expired." },
          401,
        );
      case "KeycloakSessionInactiveError":
        return createJsonResponse(
          { error: "Authentication callback could not be validated." },
          401,
        );
      case "KeycloakAdapterRequestError":
      case "OryKetoAdapterRequestError":
      case "PostgresAdapterConnectionError":
      case "SubscriberJourneyRuntimeLoadError":
      case "ValkeyAdapterOperationError":
        return createJsonResponse(
          {
            error:
              "A backend dependency request failed while completing authentication.",
          },
          502,
        );
    }
  }

  return createJsonResponse({ error: "Product auth callback failed." }, 500);
};

const buildAuthCallbackUnhandledErrorResponse = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) =>
  Response.json(
    { error: "Product auth callback failed." },
    {
      status: 500,
      headers: {
        [input.correlationHeaderName]: input.correlationId,
      },
    },
  );

const resolveAuthCallbackCorrelationId = (
  environment: unknown,
  request: Request,
) => {
  const requestUrl = new URL(request.url);
  const state = readOptionalSearchParam(requestUrl, "state");

  if (state === undefined) {
    return Promise.resolve(undefined);
  }

  return Effect.runPromise(
    decodeProductAppAuthCallbackStatePayloadFromEnvironment(
      environment,
      state,
    ).pipe(
      Effect.match({
        onFailure: () => undefined,
        onSuccess: (statePayload) => statePayload.correlationId,
      }),
    ),
  );
};

export const handleProductAuthCallbackRequest = (
  environment: unknown,
  request: Request,
  completeAuthentication: CompleteSubscriberAuthentication = (input) =>
    completeSubscriberAuthenticationFromEnvironment(environment, input),
) => {
  const requestBoundary = createObservedPlatformRequestBoundary({
    environment,
    serviceName: productAuthCallbackTelemetryServiceName,
    buildUnhandledErrorResponse: buildAuthCallbackUnhandledErrorResponse,
    resolveCorrelationId: ({ request: currentRequest }) =>
      resolveAuthCallbackCorrelationId(environment, currentRequest),
  });

  return requestBoundary.wrap((currentRequest) => {
    const requestUrl = new URL(currentRequest.url);
    const callbackRequestUri = new URL(
      requestUrl.pathname,
      requestUrl.origin,
    ).toString();
    const correlationId = currentRequest.headers.get(
      platformRequestCorrelationIdHeaderName,
    );

    return Effect.runPromise(
      matchHttpEffect({
        effect: detectProviderError(requestUrl).pipe(
          Effect.flatMap(() => decodeProductAuthCallbackQuery(requestUrl)),
          Effect.flatMap((query) =>
            decodeProductAppAuthCallbackStateFromEnvironment(
              environment,
              query.state,
            ).pipe(
              Effect.flatMap((statePayload) =>
                statePayload.redirectUri === callbackRequestUri
                  ? completeAuthentication({
                      session: {
                        authorizationCode: query.code,
                        redirectUri: statePayload.redirectUri,
                      },
                      correlationId:
                        correlationId ?? statePayload.correlationId,
                      host: requestUrl.host,
                      tenant: statePayload.tenant,
                      enabledModules: [...statePayload.enabledModules],
                    })
                  : Effect.fail({
                      _tag: "ProductAppAuthCallbackStateInvalidError",
                      reason:
                        "State redirect URI did not match the callback request.",
                    } as const),
              ),
            ),
          ),
        ),
        onFailure: buildAuthCallbackRouteErrorResponse,
        onSuccess: (result) =>
          new Response(null, {
            status: 302,
            headers: {
              Location: new URL("/", requestUrl.origin).toString(),
              "Set-Cookie": buildSubscriberJourneySessionCookieHeader(
                result.session.sessionId,
                {
                  secure:
                    requestUrl.hostname !== "localhost" &&
                    requestUrl.hostname !== "127.0.0.1",
                },
              ),
            },
          }),
      }),
    );
  })(request);
};
