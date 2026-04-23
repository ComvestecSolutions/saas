import { Effect, Schema } from "effect";
import { platformScope } from "@comvestec/contracts";
import {
  buildPublicWebAuthStartInputFromEnvironment,
  startSubscriberAuthenticationFromEnvironment,
} from "@comvestec/platform";

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

const readOptionalSearchParam = (url: URL, key: string) => {
  const value = url.searchParams.get(key);

  return value === null ? undefined : value;
};

const decodePublicWebAuthStartQuery = (url: URL) =>
  Schema.decodeUnknown(PublicWebAuthStartQuerySchema)({
    tenantHint: readOptionalSearchParam(url, "tenantHint"),
    tenantScopeHint: readOptionalSearchParam(url, "tenantScopeHint"),
  });

const createJsonResponse = (body: unknown, status: number) =>
  Response.json(body, { status });

const buildAuthStartRouteErrorResponse = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof error._tag === "string"
  ) {
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

export const handlePublicWebAuthStartRequest = (
  environment: unknown,
  request: Request,
  startAuthentication: StartSubscriberAuthentication = (input) =>
    startSubscriberAuthenticationFromEnvironment(environment, input),
) => {
  const requestUrl = new URL(request.url);

  return decodePublicWebAuthStartQuery(requestUrl).pipe(
    Effect.mapError(
      (): PublicWebAuthStartQueryParseError => ({
        _tag: "PublicWebAuthStartQueryParseError",
      }),
    ),
    Effect.flatMap((query) =>
      buildPublicWebAuthStartInputFromEnvironment(environment, {
        host: requestUrl.host,
        ...(query.tenantHint !== undefined
          ? { tenantHint: query.tenantHint }
          : {}),
        ...(query.tenantScopeHint !== undefined
          ? { tenantScopeHint: query.tenantScopeHint }
          : {}),
      }).pipe(
        Effect.flatMap((authStartInput) => startAuthentication(authStartInput)),
      ),
    ),
    Effect.match({
      onFailure: buildAuthStartRouteErrorResponse,
      onSuccess: (result) => Response.redirect(result.redirect.url, 302),
    }),
  );
};
