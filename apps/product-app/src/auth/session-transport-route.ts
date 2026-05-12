import { Effect } from "effect";
import {
  createJsonResponse,
  buildClearedSubscriberJourneySessionCookieHeader,
  createObservedPlatformRequestBoundary,
  invalidateSubscriberSessionFromRequest,
  isTaggedError,
  matchHttpEffect,
  platformRequestCorrelationIdHeaderName,
} from "@comvestec/platform";

export type ProductSessionTransportResetReason = "logout" | "stale-session";

const productSessionTransportResetTelemetryServiceName: Record<
  ProductSessionTransportResetReason,
  string
> = {
  logout: "product-app-auth-logout",
  "stale-session": "product-app-auth-stale-session",
};

const buildSessionTransportUnhandledErrorResponse = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) =>
  Response.json(
    { error: "Product auth session recovery failed." },
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
              "A backend dependency request failed while clearing the product session.",
          },
          502,
        );
      case "ParseError":
        return createJsonResponse(
          { error: "Product auth session recovery failed." },
          500,
        );
    }
  }

  return createJsonResponse(
    { error: "Product auth session recovery failed." },
    500,
  );
};

type InvalidateSubscriberSession = (
  input: Parameters<typeof invalidateSubscriberSessionFromRequest>[1],
) => ReturnType<typeof invalidateSubscriberSessionFromRequest>;

const buildSessionTransportResetResponse = (request: Request) => {
  const requestUrl = new URL(request.url);
  const secure =
    requestUrl.hostname !== "localhost" && requestUrl.hostname !== "127.0.0.1";

  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL("/", requestUrl.origin).toString(),
      "Set-Cookie": buildClearedSubscriberJourneySessionCookieHeader({
        secure,
      }),
    },
  });
};

export const handleProductSessionTransportResetRequest = (
  environment: unknown,
  request: Request,
  reason: ProductSessionTransportResetReason,
  invalidateSubscriberSession: InvalidateSubscriberSession = (input) =>
    invalidateSubscriberSessionFromRequest(environment, input),
) => {
  const requestBoundary = createObservedPlatformRequestBoundary({
    environment,
    serviceName: productSessionTransportResetTelemetryServiceName[reason],
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
        onSuccess: () => buildSessionTransportResetResponse(currentRequest),
      }),
    );
  })(request);
};

export const handleProductLogoutRequest = (
  environment: unknown,
  request: Request,
  invalidateSubscriberSession?: InvalidateSubscriberSession,
) =>
  handleProductSessionTransportResetRequest(
    environment,
    request,
    "logout",
    invalidateSubscriberSession,
  );

export const handleProductStaleSessionRecoveryRequest = (
  environment: unknown,
  request: Request,
  invalidateSubscriberSession?: InvalidateSubscriberSession,
) =>
  handleProductSessionTransportResetRequest(
    environment,
    request,
    "stale-session",
    invalidateSubscriberSession,
  );
