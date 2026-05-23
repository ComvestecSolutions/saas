import { Effect, Schema } from "effect";
import { actorType } from "@comvestec/contracts";
import type { RequestContext } from "@comvestec/contracts";
import {
  buildAdminAuthenticationCompletionInputFromEnvironment,
  buildSubscriberJourneySessionCookieHeader,
  completeAdminAppAuthenticationFromEnvironment,
  createObservedPlatformRequestBoundary,
  decodeAdminAppAuthCallbackStatePayloadFromEnvironment,
  getAdminOperatorProfileFromSessionId,
  grantSupportBreakGlassAccessFromSessionId,
  isTaggedError,
  matchHttpEffect,
  platformRequestCorrelationIdHeaderName,
  readOptionalSearchParam,
  resolveSubscriberRequestContextFromSessionId,
  resolveAdminAuthCallbackCorrelationIdFromEnvironment,
} from "@comvestec/platform";
import { buildAdminSignInPath, type AdminAuthSignInReason } from "./paths";
import { retryTransientAdminSessionReadiness } from "../lib/admin-session-readiness";

const adminAuthCallbackTelemetryServiceName = "admin-app-auth-callback";

const AdminAuthCallbackQuerySchema = Schema.Struct({
  code: Schema.NonEmptyString,
  state: Schema.NonEmptyString,
});

const adminAuthCallbackBreakGlassReason =
  "Activate audited privileged access for the authenticated admin operator session.";

const adminAuthCallbackBreakGlassDurationMinutes = [30, 15, 5] as const;

type AdminAuthCallbackQuery = Schema.Schema.Type<
  typeof AdminAuthCallbackQuerySchema
>;

type AdminAuthCallbackCompletionResult = {
  readonly session: { readonly sessionId: string };
};

type AdminAuthCallbackSuccess = {
  readonly result: AdminAuthCallbackCompletionResult;
  readonly postAuthRedirectPath?: string;
};

type CompleteAdminAppAuthentication = (
  input: Parameters<typeof completeAdminAppAuthenticationFromEnvironment>[1],
) => Effect.Effect<AdminAuthCallbackCompletionResult, unknown, never>;

type GrantAdminOperatorBreakGlassAccess = (
  input: Parameters<typeof grantSupportBreakGlassAccessFromSessionId>[1],
) => Effect.Effect<unknown, unknown, never>;

type ResolveAdminOperatorRequestContext = (
  input: Parameters<typeof resolveSubscriberRequestContextFromSessionId>[1],
) => Effect.Effect<RequestContext, unknown, never>;

type EnsureAdminShellReady = (input: {
  readonly sessionId: string;
}) => Effect.Effect<unknown, unknown, never>;

type AdminAuthCallbackProviderError = {
  readonly _tag: "AdminAuthCallbackProviderError";
  readonly error: string;
  readonly description?: string;
};

const decodeAdminAuthCallbackQuery = (url: URL) =>
  Schema.decodeUnknown(AdminAuthCallbackQuerySchema)({
    code: readOptionalSearchParam(url, "code"),
    state: readOptionalSearchParam(url, "state"),
  });

const detectProviderError = (
  url: URL,
): Effect.Effect<void, AdminAuthCallbackProviderError> => {
  const providerError = url.searchParams.get("error");

  if (providerError === null) {
    return Effect.void;
  }

  const description = readOptionalSearchParam(url, "error_description");

  return Effect.fail({
    _tag: "AdminAuthCallbackProviderError",
    error: providerError,
    ...(description !== undefined ? { description } : {}),
  } satisfies AdminAuthCallbackProviderError);
};

const isAdminAuthCallbackProviderError = (
  error: unknown,
): error is AdminAuthCallbackProviderError =>
  isTaggedError(error) && error._tag === "AdminAuthCallbackProviderError";

const buildAdminAuthCallbackBreakGlassExpiry = (durationMinutes: number) =>
  new Date(Date.now() + durationMinutes * 60_000).toISOString();

const shouldBootstrapAdminBreakGlassAccess = (requestContext: RequestContext) =>
  requestContext.actorType === actorType.platformOperator;

const waitForAdminShellReadiness = (
  sessionId: string,
  ensureAdminShellReady: EnsureAdminShellReady,
) =>
  retryTransientAdminSessionReadiness(() =>
    ensureAdminShellReady({ sessionId }).pipe(Effect.asVoid),
  );

const grantAdminOperatorBreakGlassWithFallback = (
  sessionId: string,
  grantBreakGlassAccess: GrantAdminOperatorBreakGlassAccess,
  durations: readonly number[] = adminAuthCallbackBreakGlassDurationMinutes,
): Effect.Effect<void, unknown, never> =>
  Effect.gen(function* () {
    let lastFailure: unknown;

    for (const currentDurationMinutes of durations) {
      const attempt = yield* Effect.either(
        grantBreakGlassAccess({
          sessionId,
          reason: adminAuthCallbackBreakGlassReason,
          expiresAt: buildAdminAuthCallbackBreakGlassExpiry(
            currentDurationMinutes,
          ),
        }),
      );

      if (attempt._tag === "Right") {
        return;
      }

      lastFailure = attempt.left;

      if (
        !isTaggedError(attempt.left) ||
        attempt.left._tag !== "InvalidBreakGlassExpiryError"
      ) {
        return yield* Effect.fail(attempt.left);
      }
    }

    return lastFailure === undefined
      ? undefined
      : yield* Effect.fail(lastFailure);
  });

const resolveAdminAuthCallbackRecoveryReturnTo = (
  environment: unknown,
  requestUrl: URL,
) => {
  const state = readOptionalSearchParam(requestUrl, "state");

  if (state === undefined) {
    return Promise.resolve(undefined);
  }

  return Effect.runPromise(
    decodeAdminAppAuthCallbackStatePayloadFromEnvironment(
      environment,
      state,
    ).pipe(
      Effect.match({
        onFailure: () => undefined,
        onSuccess: (statePayload) => statePayload.postAuthRedirectPath,
      }),
    ),
  );
};

const buildAuthCallbackRecoveryResponse = (input: {
  readonly requestUrl: URL;
  readonly reason: AdminAuthSignInReason;
  readonly returnTo: string | undefined;
}) => {
  const location = buildAdminSignInPath({
    ...(input.returnTo === undefined ? {} : { returnTo: input.returnTo }),
    reason: input.reason,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(location, input.requestUrl.origin).toString(),
    },
  });
};

const buildAuthCallbackRouteErrorResponse = (input: {
  readonly error: unknown;
  readonly requestUrl: URL;
  readonly returnTo: string | undefined;
}) => {
  if (isAdminAuthCallbackProviderError(input.error)) {
    return buildAuthCallbackRecoveryResponse({
      requestUrl: input.requestUrl,
      returnTo: input.returnTo,
      reason: "restart-sign-in",
    });
  }

  if (isTaggedError(input.error)) {
    switch (input.error._tag) {
      case "ParseError":
      case "ProductAppAuthCallbackStateInvalidError":
      case "ProductAppAuthCallbackRedirectNotAllowedError":
      case "KeycloakSessionInactiveError":
        return buildAuthCallbackRecoveryResponse({
          requestUrl: input.requestUrl,
          returnTo: input.returnTo,
          reason: "restart-sign-in",
        });
      case "ProductAppAuthCallbackStateExpiredError":
        return buildAuthCallbackRecoveryResponse({
          requestUrl: input.requestUrl,
          returnTo: input.returnTo,
          reason: "callback-expired",
        });
      case "PlatformOperatorAuthenticationActorTypeNotAllowedError":
      case "SupportOperationsReadAccessDeniedError":
      case "SupportOperationsApprovalActorMissingError":
      case "UnauthenticatedBreakGlassActorError":
        return buildAuthCallbackRecoveryResponse({
          requestUrl: input.requestUrl,
          returnTo: input.returnTo,
          reason: "access-denied",
        });
      case "InvalidBreakGlassExpiryError":
      case "KeycloakAdapterRequestError":
      case "IdentitySessionRequestContextMalformedError":
      case "IdentitySessionRequestContextNotFoundError":
      case "OryKetoAdapterRequestError":
      case "PostgresAdapterConnectionError":
      case "SupportOperationsBreakGlassIncidentPostgresRepositoryError":
      case "SubscriberJourneyRuntimeLoadError":
      case "ValkeyAdapterOperationError":
        return buildAuthCallbackRecoveryResponse({
          requestUrl: input.requestUrl,
          returnTo: input.returnTo,
          reason: "sign-in-unavailable",
        });
    }
  }

  return buildAuthCallbackRecoveryResponse({
    requestUrl: input.requestUrl,
    returnTo: input.returnTo,
    reason: "sign-in-unavailable",
  });
};

const buildAuthCallbackUnhandledErrorResponse = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) =>
  Response.json(
    { error: "Admin auth callback failed." },
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
) =>
  resolveAdminAuthCallbackCorrelationIdFromEnvironment(
    environment,
    readOptionalSearchParam(new URL(request.url), "state"),
  );

export const handleAdminAuthCallbackRequest = (
  environment: unknown,
  request: Request,
  completeAuthentication: CompleteAdminAppAuthentication = (input) =>
    completeAdminAppAuthenticationFromEnvironment(environment, input),
  grantBreakGlassAccess: GrantAdminOperatorBreakGlassAccess = (input) =>
    grantSupportBreakGlassAccessFromSessionId(environment, input),
  resolveRequestContext: ResolveAdminOperatorRequestContext = (input) =>
    resolveSubscriberRequestContextFromSessionId(environment, input),
  ensureAdminShellReady: EnsureAdminShellReady = (input) =>
    getAdminOperatorProfileFromSessionId(environment, input),
) => {
  const requestBoundary = createObservedPlatformRequestBoundary({
    environment,
    serviceName: adminAuthCallbackTelemetryServiceName,
    buildUnhandledErrorResponse: buildAuthCallbackUnhandledErrorResponse,
    resolveCorrelationId: ({ request: currentRequest }) =>
      resolveAuthCallbackCorrelationId(environment, currentRequest),
  });

  return requestBoundary.wrap(async (currentRequest) => {
    const requestUrl = new URL(currentRequest.url);
    const callbackRequestUri = new URL(
      requestUrl.pathname,
      requestUrl.origin,
    ).toString();
    const recoveryReturnTo = await resolveAdminAuthCallbackRecoveryReturnTo(
      environment,
      requestUrl,
    );
    const correlationId = currentRequest.headers.get(
      platformRequestCorrelationIdHeaderName,
    );

    return Effect.runPromise(
      matchHttpEffect({
        effect: detectProviderError(requestUrl).pipe(
          Effect.flatMap(() => decodeAdminAuthCallbackQuery(requestUrl)),
          Effect.flatMap((query: AdminAuthCallbackQuery) =>
            buildAdminAuthenticationCompletionInputFromEnvironment(
              environment,
              {
                authorizationCode: query.code,
                state: query.state,
                callbackRequestUri,
                host: requestUrl.host,
                ...(correlationId !== null ? { correlationId } : {}),
              },
            ).pipe(
              Effect.flatMap(({ completionInput, postAuthRedirectPath }) =>
                completeAuthentication(completionInput).pipe(
                  Effect.flatMap((result) =>
                    resolveRequestContext({
                      sessionId: result.session.sessionId,
                    }).pipe(
                      Effect.flatMap((requestContext) =>
                        shouldBootstrapAdminBreakGlassAccess(requestContext)
                          ? grantAdminOperatorBreakGlassWithFallback(
                              result.session.sessionId,
                              grantBreakGlassAccess,
                            )
                          : Effect.succeed(undefined),
                      ),
                      Effect.flatMap(() =>
                        waitForAdminShellReadiness(
                          result.session.sessionId,
                          ensureAdminShellReady,
                        ),
                      ),
                      Effect.map(
                        (): AdminAuthCallbackSuccess => ({
                          result,
                          ...(postAuthRedirectPath !== undefined
                            ? { postAuthRedirectPath }
                            : {}),
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        onFailure: (error) =>
          buildAuthCallbackRouteErrorResponse({
            error,
            requestUrl,
            returnTo: recoveryReturnTo,
          }),
        onSuccess: ({ result, postAuthRedirectPath }) =>
          new Response(null, {
            status: 302,
            headers: {
              Location: new URL(
                postAuthRedirectPath ?? "/",
                requestUrl.origin,
              ).toString(),
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
