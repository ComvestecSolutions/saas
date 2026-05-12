import { Effect, ParseResult, Schema } from "effect";
import { platformScope } from "@comvestec/contracts";
import {
  buildPublicWebAuthStartInputFromEnvironment,
  createProductBillingCheckoutHandoffTokenFromEnvironment,
  createJsonResponse,
  createObservedPlatformRequestBoundary,
  isTaggedError,
  matchHttpEffect,
  platformRequestCorrelationIdHeaderName,
  readOptionalSearchParam,
  resolvePublicWebBillingReturnUrlsFromEnvironment,
  startSubscriberAuthenticationFromEnvironment,
} from "@comvestec/platform";

const publicWebBillingCheckoutTelemetryServiceName =
  "public-web-billing-checkout";

const PublicWebBillingCheckoutQuerySchema = Schema.Struct({
  planId: Schema.NonEmptyString,
  priceId: Schema.NonEmptyString,
  tenantHint: Schema.optional(Schema.NonEmptyString),
  tenantScopeHint: Schema.optional(
    Schema.Literal(platformScope.organization, platformScope.individual),
  ),
});

type PublicWebBillingCheckoutQuery = Schema.Schema.Type<
  typeof PublicWebBillingCheckoutQuerySchema
>;

type PublicWebBillingCheckoutQueryParseError = {
  readonly _tag: "PublicWebBillingCheckoutQueryParseError";
};

type StartSubscriberAuthentication = (
  input: Parameters<typeof startSubscriberAuthenticationFromEnvironment>[1],
) => Effect.Effect<{ readonly redirect: { readonly url: string } }, unknown>;

type PreparePublicAuthStart = NonNullable<
  Parameters<typeof buildPublicWebAuthStartInputFromEnvironment>[2]
>;

const decodePublicWebBillingCheckoutQuery = (url: URL) =>
  Schema.decodeUnknown(PublicWebBillingCheckoutQuerySchema)({
    planId: readOptionalSearchParam(url, "planId"),
    priceId: readOptionalSearchParam(url, "priceId"),
    tenantHint: readOptionalSearchParam(url, "tenantHint"),
    tenantScopeHint: readOptionalSearchParam(url, "tenantScopeHint"),
  }) as Effect.Effect<PublicWebBillingCheckoutQuery, ParseResult.ParseError>;

const buildPublicWebBillingCheckoutRouteErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "PublicWebBillingCheckoutQueryParseError":
        return createJsonResponse(
          {
            error:
              "Public billing checkout query did not match the expected contract.",
          },
          400,
        );
      case "ParseError":
      case "ProductBillingCheckoutHandoffInvalidError":
      case "ProductAppAuthCallbackStateInvalidError":
      case "ProductAppAuthCallbackRedirectNotAllowedError":
      case "SubscriberJourneyRuntimeLoadError":
      case "MissingModuleManifestError":
      case "RuntimeConfigPersistenceNotConfiguredError":
      case "UnknownConfigKeyError":
        return createJsonResponse(
          {
            error:
              "Public billing checkout is misconfigured or failed validation at the backend boundary.",
          },
          500,
        );
      case "KeycloakAdapterRequestError":
      case "ValkeyAdapterOperationError":
      case "BillingStatePostgresRepositoryQueryError":
      case "PostgresAdapterConnectionError":
      case "RuntimeConfigModulePersistenceError":
      case "RuntimeConfigPostgresRepositoryPersistenceError":
        return createJsonResponse(
          {
            error:
              "A backend dependency request failed while starting public billing checkout.",
          },
          502,
        );
    }
  }

  return createJsonResponse({ error: "Public billing checkout failed." }, 500);
};

const buildPublicWebBillingCheckoutUnhandledErrorResponse = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) =>
  Response.json(
    { error: "Public billing checkout failed." },
    {
      status: 500,
      headers: {
        [input.correlationHeaderName]: input.correlationId,
      },
    },
  );

export const handlePublicWebBillingCheckoutRequest = (
  environment: unknown,
  request: Request,
  startAuthentication: StartSubscriberAuthentication = (input) =>
    startSubscriberAuthenticationFromEnvironment(environment, input),
  preparePublicAuthStart?: PreparePublicAuthStart,
) => {
  const requestBoundary = createObservedPlatformRequestBoundary({
    environment,
    serviceName: publicWebBillingCheckoutTelemetryServiceName,
    buildUnhandledErrorResponse:
      buildPublicWebBillingCheckoutUnhandledErrorResponse,
  });

  return requestBoundary.wrap((currentRequest) => {
    const requestUrl = new URL(currentRequest.url);
    const correlationId = currentRequest.headers.get(
      platformRequestCorrelationIdHeaderName,
    );

    return Effect.runPromise(
      matchHttpEffect({
        effect: decodePublicWebBillingCheckoutQuery(requestUrl).pipe(
          Effect.mapError(
            (): PublicWebBillingCheckoutQueryParseError => ({
              _tag: "PublicWebBillingCheckoutQueryParseError",
            }),
          ),
          Effect.flatMap((query) =>
            resolvePublicWebBillingReturnUrlsFromEnvironment(environment).pipe(
              Effect.flatMap((returnUrls) =>
                createProductBillingCheckoutHandoffTokenFromEnvironment(
                  environment,
                  {
                    planId: query.planId,
                    priceId: query.priceId,
                    successUrl: returnUrls.successUrl,
                    cancelUrl: returnUrls.cancelUrl,
                    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
                  },
                ).pipe(
                  Effect.map((handoffToken) => ({
                    query,
                    handoffToken,
                  })),
                ),
              ),
            ),
          ),
          Effect.flatMap(({ query, handoffToken }) =>
            buildPublicWebAuthStartInputFromEnvironment(
              environment,
              {
                ...(correlationId !== null ? { correlationId } : {}),
                host: requestUrl.host,
                postAuthRedirectPath: `/billing/checkout?${new URLSearchParams({
                  handoff: handoffToken,
                }).toString()}`,
                ...(query.tenantHint !== undefined
                  ? { tenantHint: query.tenantHint }
                  : {}),
                ...(query.tenantScopeHint !== undefined
                  ? { tenantScopeHint: query.tenantScopeHint }
                  : {}),
              },
              preparePublicAuthStart,
            ).pipe(
              Effect.flatMap((authStartInput) =>
                startAuthentication(authStartInput),
              ),
            ),
          ),
        ),
        onFailure: buildPublicWebBillingCheckoutRouteErrorResponse,
        onSuccess: (result) => Response.redirect(result.redirect.url, 302),
      }),
    );
  })(request);
};
