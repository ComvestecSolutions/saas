import { Effect, Schema } from "effect";
import { platformScope } from "@comvestec/contracts";
import {
  buildPublicWebAuthStartInputFromEnvironment,
  createJsonResponse,
  createObservedPlatformRequestBoundary,
  isTaggedError,
  matchHttpEffect,
  platformRequestCorrelationIdHeaderName,
  readOptionalSearchParam,
  startSubscriberAuthenticationFromEnvironment,
} from "@comvestec/platform";

const publicWebAuthStartTelemetryServiceName = "public-web-auth-start";

const PublicWebAuthStartQuerySchema = Schema.Struct({
  tenantHint: Schema.optional(Schema.NonEmptyString),
  tenantScopeHint: Schema.optional(
    Schema.Literal(platformScope.organization, platformScope.individual),
  ),
});

type PublicWebAuthStartQuery = Schema.Schema.Type<
  typeof PublicWebAuthStartQuerySchema
>;

type PublicWebAuthStartQueryParseError = {
  readonly _tag: "PublicWebAuthStartQueryParseError";
};

type StartSubscriberAuthentication = (
  input: Parameters<typeof startSubscriberAuthenticationFromEnvironment>[1],
) => Effect.Effect<{ readonly redirect: { readonly url: string } }, unknown>;

const decodePublicWebAuthStartQuery = (url: URL) =>
  Schema.decodeUnknown(PublicWebAuthStartQuerySchema)({
    tenantHint: readOptionalSearchParam(url, "tenantHint"),
    tenantScopeHint: readOptionalSearchParam(url, "tenantScopeHint"),
  });

const buildAuthStartRouteErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "PublicWebAuthStartQueryParseError":
        return createJsonResponse(
          {
            error: "Auth start query did not match the expected schema.",
          },
          400,
        );
      case "ParseError":
      case "ProductAppAuthCallbackStateInvalidError":
      case "ProductAppAuthCallbackRedirectNotAllowedError":
      case "SubscriberJourneyRuntimeLoadError":
        return createJsonResponse(
          {
            error:
              "Public auth start is misconfigured or failed validation at the backend boundary.",
          },
          500,
        );
      case "KeycloakAdapterRequestError":
      case "ValkeyAdapterOperationError":
      case "PostgresAdapterConnectionError":
        return createJsonResponse(
          {
            error:
              "A backend dependency request failed while starting authentication.",
          },
          502,
        );
    }
  }

  return createJsonResponse({ error: "Public auth start failed." }, 500);
};

const buildAuthStartUnhandledErrorResponse = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) =>
  Response.json(
    { error: "Public auth start failed." },
    {
      status: 500,
      headers: {
        [input.correlationHeaderName]: input.correlationId,
      },
    },
  );

export const handlePublicWebAuthStartRequest = (
  environment: unknown,
  request: Request,
  startAuthentication: StartSubscriberAuthentication = (input) =>
    startSubscriberAuthenticationFromEnvironment(environment, input),
) => {
  const requestBoundary = createObservedPlatformRequestBoundary({
    environment,
    serviceName: publicWebAuthStartTelemetryServiceName,
    buildUnhandledErrorResponse: buildAuthStartUnhandledErrorResponse,
  });

  return requestBoundary.wrap((currentRequest) => {
    const requestUrl = new URL(currentRequest.url);
    const correlationId = currentRequest.headers.get(
      platformRequestCorrelationIdHeaderName,
    );

    return Effect.runPromise(
      matchHttpEffect({
        effect: decodePublicWebAuthStartQuery(requestUrl).pipe(
          Effect.mapError(
            (): PublicWebAuthStartQueryParseError => ({
              _tag: "PublicWebAuthStartQueryParseError",
            }),
          ),
          Effect.flatMap((query) =>
            buildPublicWebAuthStartInputFromEnvironment(environment, {
              ...(correlationId !== null ? { correlationId } : {}),
              host: requestUrl.host,
              ...(query.tenantHint !== undefined
                ? { tenantHint: query.tenantHint }
                : {}),
              ...(query.tenantScopeHint !== undefined
                ? { tenantScopeHint: query.tenantScopeHint }
                : {}),
            }).pipe(
              Effect.flatMap((authStartInput) =>
                startAuthentication(authStartInput),
              ),
            ),
          ),
        ),
        onFailure: buildAuthStartRouteErrorResponse,
        onSuccess: (result) => Response.redirect(result.redirect.url, 302),
      }),
    );
  })(request);
};
