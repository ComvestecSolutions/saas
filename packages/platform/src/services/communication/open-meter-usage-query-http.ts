import { Effect, Option, ParseResult, Schema } from "effect";
import {
  IsoTimestampSchema,
  OpenMeterUsageBackfillInputSchema,
  OpenMeterUsageQueryGranularitySchema,
  PlatformScopeSchema,
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
  type OpenMeterUsageQueryRuntimeError,
  type OpenMeterUsageQueryServiceImpl,
  runOpenMeterUsageQueryFromEnvironment,
} from "../domains/open-meter-usage-query-service";
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

export const openMeterUsageQueryApiBasePath = "/api/open-meter-usage-query";

export const openMeterUsageQueryApiPath = {
  query: `${openMeterUsageQueryApiBasePath}/query`,
  backfill: `${openMeterUsageQueryApiBasePath}/backfill`,
} as const;

type OpenMeterUsageQueryRouteMatch =
  | { readonly kind: "query" }
  | { readonly kind: "backfill" };

const matchOpenMeterUsageQueryRoute = (
  pathname: string,
): OpenMeterUsageQueryRouteMatch | undefined => {
  if (pathname === openMeterUsageQueryApiPath.query) {
    return { kind: "query" };
  }
  if (pathname === openMeterUsageQueryApiPath.backfill) {
    return { kind: "backfill" };
  }
  return undefined;
};

const methodForRoute = (
  match: OpenMeterUsageQueryRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "query":
      return ["GET"];
    case "backfill":
      return ["POST"];
  }
};

// ---------------------------------------------------------------------------
// JSON body decode helpers
// ---------------------------------------------------------------------------

type JsonRequestErrorTag =
  | "OpenMeterUsageQueryJsonInvalidError"
  | "OpenMeterUsageQueryJsonRequestParseError";

type JsonRequestError = { readonly _tag: JsonRequestErrorTag };

const normalizeJsonRequestError = (
  error: JsonRequestError | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({
        _tag: "OpenMeterUsageQueryJsonRequestParseError",
      } satisfies JsonRequestError)
    : error;

const readOpenMeterUsageQueryRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag:
      "OpenMeterUsageQueryJsonInvalidError" satisfies JsonRequestErrorTag,
    decode: input.decode,
  }).pipe(Effect.mapError(normalizeJsonRequestError));

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const OpenMeterUsageQueryHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeOpenMeterUsageQueryHttpEnvironment = Schema.decodeUnknown(
  OpenMeterUsageQueryHttpEnvironmentSchema,
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
      yield* decodeOpenMeterUsageQueryHttpEnvironment(environment);
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

const QueryStringSchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  subject: Schema.NonEmptyString,
  meterSlug: Schema.NonEmptyString,
  from: IsoTimestampSchema,
  to: IsoTimestampSchema,
  granularity: OpenMeterUsageQueryGranularitySchema,
});

const decodeQueryString = Schema.decodeUnknown(QueryStringSchema);
const decodeBackfillBody = Schema.decodeUnknown(
  OpenMeterUsageBackfillInputSchema,
);
const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "OpenMeterUsageQueryJsonInvalidError":
      case "OpenMeterUsageQueryJsonRequestParseError":
      case "ParseError":
      case "OpenMeterUsageQueryReasonNotInCatalog":
      case "OpenMeterUsageQueryReasonActionMismatch":
      case "OpenMeterUsageQueryReasonAttachmentRequired":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "OpenMeterUsageQueryWindowTooLarge":
        return createJsonResponse(
          {
            error:
              "Requested window exceeds the configured maximum window size.",
          },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "OpenMeterUsageQueryUnauthorized":
      case "OpenMeterUsageQueryMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "OpenMeterApiClientError":
      case "OpenmeterAdapterRequestError":
      case "OpenmeterAdapterTransportError":
        return createJsonResponse(
          { error: "OpenMeter usage query upstream call failed." },
          502,
        );
    }
  }
  return createJsonResponse(
    { error: "OpenMeter usage query request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type OpenMeterUsageQueryServiceRunner = <A, E>(
  use: (service: OpenMeterUsageQueryServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | OpenMeterUsageQueryRuntimeError>;

type OpenMeterUsageQueryRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam — accepts an injected request-context
// resolver so unit tests can exercise routing, decoding, and error
// mapping without provisioning a live Valkey adapter)
// ---------------------------------------------------------------------------

export const createOpenMeterUsageQueryHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: OpenMeterUsageQueryRequestContextResolver;
  readonly runWithService: OpenMeterUsageQueryServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchOpenMeterUsageQueryRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("OpenMeter usage query route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (match.kind) {
      case "query":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeQueryString(
              Object.fromEntries(url.searchParams.entries()),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.getLatestUsageQuery({
                  requestContext,
                  query: {
                    tenant: {
                      scope: query.tenantScope,
                      scopeId: query.tenantScopeId,
                    },
                    subject: query.subject,
                    meterSlug: query.meterSlug,
                    window: { from: query.from, to: query.to },
                    granularity: query.granularity,
                  },
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) =>
            createJsonResponse({ result: Option.getOrNull(view) }, 200),
        });
      case "backfill":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            backfill: readOpenMeterUsageQueryRequestJson({
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

export const createOpenMeterUsageQueryHttpHandler = (
  environment: unknown,
  runWithService: OpenMeterUsageQueryServiceRunner,
) =>
  createOpenMeterUsageQueryHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleOpenMeterUsageQueryHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createOpenMeterUsageQueryHttpHandler(environment, (use) =>
    runOpenMeterUsageQueryFromEnvironment(environment, use),
  )(request);
