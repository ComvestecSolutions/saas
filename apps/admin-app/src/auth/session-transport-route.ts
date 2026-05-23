import { Effect } from "effect";
import {
  buildClearedSubscriberJourneySessionCookieHeader,
  createJsonResponse,
  createObservedPlatformRequestBoundary,
  invalidateSubscriberSessionFromRequest,
  isTaggedError,
  matchHttpEffect,
  platformRequestCorrelationIdHeaderName,
} from "@comvestec/platform";
import { buildAdminSignInPath, parseAdminAuthSearch } from "./paths";

export type AdminSessionTransportResetReason = "logout" | "stale-session";

const adminSessionTransportResetTelemetryServiceName: Record<
  AdminSessionTransportResetReason,
  string
> = {
  logout: "admin-app-auth-logout",
  "stale-session": "admin-app-auth-stale-session",
};

const buildSessionTransportUnhandledErrorResponse = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) =>
  Response.json(
    { error: "Admin auth session recovery failed." },
    {
      status: 500,
      headers: {
        [input.correlationHeaderName]: input.correlationId,
      },
    },
  );

const buildSessionTransportRouteErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "SubscriberJourneyRuntimeLoadError":
      case "ValkeyAdapterOperationError":
      case "IdentitySessionPostgresRepositoryPersistenceError":
        return createJsonResponse(
          {
            error:
              "A backend dependency request failed while clearing the admin session.",
          },
          502,
        );
      case "ParseError":
        return createJsonResponse(
          { error: "Admin auth session recovery failed." },
          500,
        );
    }
  }

  return createJsonResponse(
    { error: "Admin auth session recovery failed." },
    500,
  );
};

type InvalidateSubscriberSession = (
  input: Parameters<typeof invalidateSubscriberSessionFromRequest>[1],
) => ReturnType<typeof invalidateSubscriberSessionFromRequest>;

const buildSessionTransportResetResponse = (
  request: Request,
  reason: AdminSessionTransportResetReason,
) => {
  const requestUrl = new URL(request.url);
  const { returnTo } = parseAdminAuthSearch(requestUrl.search);
  const secure =
    requestUrl.hostname !== "localhost" && requestUrl.hostname !== "127.0.0.1";
  const location = buildAdminSignInPath({
    ...(returnTo === undefined ? {} : { returnTo }),
    reason: reason === "logout" ? "signed-out" : "stale-session",
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(location, requestUrl.origin).toString(),
      "Set-Cookie": buildClearedSubscriberJourneySessionCookieHeader({
        secure,
      }),
    },
  });
};

export const handleAdminSessionTransportResetRequest = (
  environment: unknown,
  request: Request,
  reason: AdminSessionTransportResetReason,
  invalidateSubscriberSession: InvalidateSubscriberSession = (input) =>
    invalidateSubscriberSessionFromRequest(environment, input),
) => {
  const requestBoundary = createObservedPlatformRequestBoundary({
    environment,
    serviceName: adminSessionTransportResetTelemetryServiceName[reason],
    buildUnhandledErrorResponse: buildSessionTransportUnhandledErrorResponse,
  });

  return requestBoundary.wrap((currentRequest) => {
    const correlationId =
      currentRequest.headers.get(platformRequestCorrelationIdHeaderName) ??
      crypto.randomUUID();

    return Effect.runPromise(
      matchHttpEffect({
        effect: invalidateSubscriberSession({
          request: currentRequest,
          correlationId,
          reason,
        }),
        onFailure: buildSessionTransportRouteErrorResponse,
        onSuccess: () =>
          buildSessionTransportResetResponse(currentRequest, reason),
      }),
    );
  })(request);
};

export const handleAdminLogoutRequest = (
  environment: unknown,
  request: Request,
  invalidateSubscriberSession?: InvalidateSubscriberSession,
) =>
  handleAdminSessionTransportResetRequest(
    environment,
    request,
    "logout",
    invalidateSubscriberSession,
  );

export const handleAdminStaleSessionRecoveryRequest = (
  environment: unknown,
  request: Request,
  invalidateSubscriberSession?: InvalidateSubscriberSession,
) =>
  handleAdminSessionTransportResetRequest(
    environment,
    request,
    "stale-session",
    invalidateSubscriberSession,
  );
