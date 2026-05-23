import { Effect, ParseResult, Schema } from "effect";
import {
  RequestContextSchema,
  type RequestContext,
} from "@comvestec/contracts";
import {
  resolveIdentitySessionRequestContext,
  type IdentitySessionRequestContextNotFoundError,
} from "@comvestec/modules";
import {
  makeValkeyAdapter,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import { extractRequiredSubscriberJourneySessionIdFromHeader } from "../access/request-context-transport";
import {
  runVendorHealthAggregatorFromEnvironment,
  type VendorHealthAggregatorRuntimeError,
  type VendorHealthAggregatorServiceImpl,
} from "../domains/vendor-health-aggregator-service";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
} from "./http-transport";

// ---------------------------------------------------------------------------
// Path table (local — registry advertises only owned endpoints)
// ---------------------------------------------------------------------------

export const vendorHealthAggregatorApiBasePath =
  "/api/vendor-health-aggregator";

export const vendorHealthAggregatorApiPath = {
  snapshot: `${vendorHealthAggregatorApiBasePath}/snapshot`,
} as const;

type VendorHealthAggregatorRouteMatch = { readonly kind: "snapshot" };

const matchVendorHealthAggregatorRoute = (
  pathname: string,
): VendorHealthAggregatorRouteMatch | undefined => {
  if (pathname === vendorHealthAggregatorApiPath.snapshot) {
    return { kind: "snapshot" };
  }
  return undefined;
};

const methodForRoute = (
  match: VendorHealthAggregatorRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "snapshot":
      return ["GET"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution (shared session-resolver
// pattern — mirrors polar-revenue-projection-http.ts +
// open-meter-usage-query-http.ts).
// ---------------------------------------------------------------------------

const VendorHealthAggregatorHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeVendorHealthAggregatorHttpEnvironment = Schema.decodeUnknown(
  VendorHealthAggregatorHttpEnvironmentSchema,
);

type ResolveTrustedRequestContextError =
  | ParseResult.ParseError
  | ValkeyAdapterOperationError
  | IdentitySessionRequestContextNotFoundError
  | { readonly _tag: "SubscriberJourneySessionIdMissingError" };

const resolveTrustedRequestContextFromRequest = (
  environment: unknown,
  request: Request,
): Effect.Effect<RequestContext, ResolveTrustedRequestContextError> =>
  Effect.gen(function* () {
    const sessionId =
      yield* extractRequiredSubscriberJourneySessionIdFromHeader(request);
    const resolvedEnvironment =
      yield* decodeVendorHealthAggregatorHttpEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "VendorHealthAggregatorUnauthorized":
      case "VendorHealthAggregatorMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "VendorHealthAggregatorAllSourcesFailedError":
        return createJsonResponse(
          { error: "Vendor-health aggregate currently unavailable." },
          503,
        );
    }
  }
  return createJsonResponse(
    { error: "Vendor-health aggregator request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type VendorHealthAggregatorServiceRunner = <A, E>(
  use: (service: VendorHealthAggregatorServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | VendorHealthAggregatorRuntimeError>;

type VendorHealthAggregatorRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam — accepts an injected request-
// context resolver so unit tests can exercise routing + error
// mapping without provisioning a live Valkey adapter)
// ---------------------------------------------------------------------------

export const createVendorHealthAggregatorHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: VendorHealthAggregatorRequestContextResolver;
  readonly runWithService: VendorHealthAggregatorServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchVendorHealthAggregatorRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Vendor-health aggregator route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (match.kind) {
      case "snapshot":
        return matchHttpEffect({
          effect: buildRequestContext(request).pipe(
            Effect.flatMap((requestContext) =>
              runWithService((service) =>
                service.getAggregate({ requestContext }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse({ aggregate: view }, 200),
        });
    }
  };
};

export const createVendorHealthAggregatorHttpHandler = (
  environment: unknown,
  runWithService: VendorHealthAggregatorServiceRunner,
) =>
  createVendorHealthAggregatorHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleVendorHealthAggregatorHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createVendorHealthAggregatorHttpHandler(environment, (use) =>
    runVendorHealthAggregatorFromEnvironment(environment, use),
  )(request);
