import { Effect, Schema } from "effect";
import {
  createObservedPlatformRequestBoundary,
  FirstPartyAppPostAuthRedirectPathSchema,
  isTaggedError,
  matchHttpEffect,
  platformRequestCorrelationIdHeaderName,
  readOptionalSearchParam,
  startAdminAppAuthenticationFromEnvironment,
} from "@comvestec/platform";
import { buildAdminSignInPath, parseAdminAuthSearch } from "./paths";

const adminAuthStartTelemetryServiceName = "admin-app-auth-start";

const AdminAuthStartQuerySchema = Schema.Struct({
  returnTo: Schema.optional(FirstPartyAppPostAuthRedirectPathSchema),
});

type AdminAuthStartQueryParseError = {
  readonly _tag: "AdminAuthStartQueryParseError";
};

const decodeAdminAuthStartQuery = (url: URL) =>
  Schema.decodeUnknown(AdminAuthStartQuerySchema)({
    returnTo: readOptionalSearchParam(url, "returnTo"),
  });

type StartAdminAppAuthentication = (
  input: Parameters<typeof startAdminAppAuthenticationFromEnvironment>[1],
) => Effect.Effect<{ readonly redirect: { readonly url: string } }, unknown>;

const buildAuthStartRecoveryResponse = (input: {
  readonly requestUrl: URL;
  readonly reason: "restart-sign-in" | "sign-in-unavailable";
}) => {
  const { returnTo } = parseAdminAuthSearch(input.requestUrl.search);
  const location = buildAdminSignInPath({
    ...(returnTo === undefined ? {} : { returnTo }),
    reason: input.reason,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(location, input.requestUrl.origin).toString(),
    },
  });
};

const buildAuthStartRouteErrorResponse = (input: {
  readonly error: unknown;
  readonly requestUrl: URL;
}) => {
  if (isTaggedError(input.error)) {
    switch (input.error._tag) {
      case "AdminAuthStartQueryParseError":
        return buildAuthStartRecoveryResponse({
          requestUrl: input.requestUrl,
          reason: "restart-sign-in",
        });
      case "ParseError":
      case "ProductAppAuthCallbackStateInvalidError":
      case "ProductAppAuthCallbackRedirectNotAllowedError":
      case "KeycloakAdapterRequestError":
      case "SubscriberJourneyRuntimeLoadError":
      case "ValkeyAdapterOperationError":
      case "PostgresAdapterConnectionError":
        return buildAuthStartRecoveryResponse({
          requestUrl: input.requestUrl,
          reason: "sign-in-unavailable",
        });
    }
  }

  return buildAuthStartRecoveryResponse({
    requestUrl: input.requestUrl,
    reason: "sign-in-unavailable",
  });
};

const buildAuthStartUnhandledErrorResponse = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) =>
  Response.json(
    { error: "Admin auth start failed." },
    {
      status: 500,
      headers: {
        [input.correlationHeaderName]: input.correlationId,
      },
    },
  );

export const handleAdminAuthStartRequest = (
  environment: unknown,
  request: Request,
  startAuthentication: StartAdminAppAuthentication = (input) =>
    startAdminAppAuthenticationFromEnvironment(environment, input),
) => {
  const requestBoundary = createObservedPlatformRequestBoundary({
    environment,
    serviceName: adminAuthStartTelemetryServiceName,
    buildUnhandledErrorResponse: buildAuthStartUnhandledErrorResponse,
  });

  return requestBoundary.wrap((currentRequest) => {
    const requestUrl = new URL(currentRequest.url);
    const correlationId = currentRequest.headers.get(
      platformRequestCorrelationIdHeaderName,
    );

    return Effect.runPromise(
      matchHttpEffect({
        effect: decodeAdminAuthStartQuery(requestUrl).pipe(
          Effect.mapError(
            (): AdminAuthStartQueryParseError => ({
              _tag: "AdminAuthStartQueryParseError",
            }),
          ),
          Effect.flatMap((query) =>
            startAuthentication({
              ...(correlationId !== null ? { correlationId } : {}),
              host: requestUrl.host,
              ...(query.returnTo !== undefined
                ? { postAuthRedirectPath: query.returnTo }
                : {}),
            }),
          ),
        ),
        onFailure: (error) =>
          buildAuthStartRouteErrorResponse({ error, requestUrl }),
        onSuccess: (result) => Response.redirect(result.redirect.url, 302),
      }),
    );
  })(request);
};
