import { Effect, Option, ParseResult, Schema } from "effect";
import {
  PlatformScopeSchema,
  PolarRevenueProjectionBackfillInputSchema,
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
  type PolarRevenueProjectionRuntimeError,
  type PolarRevenueProjectionServiceImpl,
  runPolarRevenueProjectionFromEnvironment,
} from "../domains/polar-revenue-projection-service";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestJson,
} from "./http-transport";

// ---------------------------------------------------------------------------
// Path table (local — registry advertises only owned endpoints)
// ---------------------------------------------------------------------------

export const polarRevenueProjectionApiBasePath =
  "/api/polar-revenue-projection";

export const polarRevenueProjectionApiPath = {
  snapshot: `${polarRevenueProjectionApiBasePath}/snapshot`,
  backfill: `${polarRevenueProjectionApiBasePath}/backfill`,
} as const;

type PolarRevenueProjectionRouteMatch =
  | { readonly kind: "snapshot" }
  | { readonly kind: "backfill" };

const matchPolarRevenueProjectionRoute = (
  pathname: string,
): PolarRevenueProjectionRouteMatch | undefined => {
  if (pathname === polarRevenueProjectionApiPath.snapshot) {
    return { kind: "snapshot" };
  }
  if (pathname === polarRevenueProjectionApiPath.backfill) {
    return { kind: "backfill" };
  }
  return undefined;
};

const methodForRoute = (
  match: PolarRevenueProjectionRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "snapshot":
      return ["GET"];
    case "backfill":
      return ["POST"];
  }
};

// ---------------------------------------------------------------------------
// JSON body decode helpers
// ---------------------------------------------------------------------------

type JsonRequestErrorTag =
  | "PolarRevenueProjectionJsonInvalidError"
  | "PolarRevenueProjectionJsonRequestParseError";

type JsonRequestError = { readonly _tag: JsonRequestErrorTag };

const normalizeJsonRequestError = (
  error: JsonRequestError | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({
        _tag: "PolarRevenueProjectionJsonRequestParseError",
      } satisfies JsonRequestError)
    : error;

const readPolarRevenueProjectionRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag:
      "PolarRevenueProjectionJsonInvalidError" satisfies JsonRequestErrorTag,
    decode: input.decode,
  }).pipe(Effect.mapError(normalizeJsonRequestError));

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const PolarRevenueProjectionHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodePolarRevenueProjectionHttpEnvironment = Schema.decodeUnknown(
  PolarRevenueProjectionHttpEnvironmentSchema,
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
      yield* decodePolarRevenueProjectionHttpEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

// ---------------------------------------------------------------------------
// Per-route input schemas
// ---------------------------------------------------------------------------

const SnapshotQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
});

const decodeSnapshotQuery = Schema.decodeUnknown(SnapshotQuerySchema);
const decodeBackfillBody = Schema.decodeUnknown(
  PolarRevenueProjectionBackfillInputSchema,
);
const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "PolarRevenueProjectionJsonInvalidError":
      case "PolarRevenueProjectionJsonRequestParseError":
      case "ParseError":
      case "PolarRevenueProjectionReasonNotInCatalog":
      case "PolarRevenueProjectionReasonActionMismatch":
      case "PolarRevenueProjectionReasonAttachmentRequired":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "PolarRevenueProjectionUnauthorized":
      case "PolarRevenueProjectionMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "PolarApiClientError":
      case "PolarAdapterRequestError":
      case "PolarCatalogMetadataError":
        return createJsonResponse(
          { error: "Polar revenue projection upstream call failed." },
          502,
        );
    }
  }
  return createJsonResponse(
    { error: "Polar revenue projection request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type PolarRevenueProjectionServiceRunner = <A, E>(
  use: (service: PolarRevenueProjectionServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | PolarRevenueProjectionRuntimeError>;

type PolarRevenueProjectionRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam — accepts an injected request-context
// resolver so unit tests can exercise routing, decoding, and error
// mapping without provisioning a live Valkey adapter)
// ---------------------------------------------------------------------------

export const createPolarRevenueProjectionHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: PolarRevenueProjectionRequestContextResolver;
  readonly runWithService: PolarRevenueProjectionServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchPolarRevenueProjectionRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Polar revenue projection route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (match.kind) {
      case "snapshot":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeSnapshotQuery(
              Object.fromEntries(url.searchParams.entries()),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.getLatestSnapshot({
                  requestContext,
                  tenant: {
                    scope: query.tenantScope,
                    scopeId: query.tenantScopeId,
                  },
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (snapshot) =>
            createJsonResponse({ snapshot: Option.getOrNull(snapshot) }, 200),
        });
      case "backfill":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            backfill: readPolarRevenueProjectionRequestJson({
              request,
              decode: decodeBackfillBody,
            }),
          }).pipe(
            Effect.flatMap(({ requestContext, backfill }) =>
              runWithService((service) =>
                service.requestBackfill({ requestContext, backfill }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 202),
        });
    }
  };
};

export const createPolarRevenueProjectionHttpHandler = (
  environment: unknown,
  runWithService: PolarRevenueProjectionServiceRunner,
) =>
  createPolarRevenueProjectionHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handlePolarRevenueProjectionHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createPolarRevenueProjectionHttpHandler(environment, (use) =>
    runPolarRevenueProjectionFromEnvironment(environment, use),
  )(request);
