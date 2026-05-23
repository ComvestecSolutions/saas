import { Effect, ParseResult, Schema } from "effect";
import {
  RequestContextSchema,
  UniversalSearchQueryInputSchema,
  UniversalSearchReindexInputSchema,
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
  runUniversalSearchPlatformFromEnvironment,
  type UniversalSearchRuntimeError,
  type UniversalSearchServiceImpl,
} from "../domains/universal-search-service";
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

export const universalSearchApiBasePath = "/api/universal-search";

export const universalSearchApiPath = {
  search: `${universalSearchApiBasePath}/search`,
  reindex: `${universalSearchApiBasePath}/reindex`,
} as const;

type UniversalSearchRouteMatch =
  | { readonly kind: "search" }
  | { readonly kind: "reindex" };

const matchUniversalSearchRoute = (
  pathname: string,
): UniversalSearchRouteMatch | undefined => {
  if (pathname === universalSearchApiPath.search) {
    return { kind: "search" };
  }
  if (pathname === universalSearchApiPath.reindex) {
    return { kind: "reindex" };
  }
  return undefined;
};

const methodForRoute = (
  match: UniversalSearchRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "search":
    case "reindex":
      return ["POST"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution (Valkey VALKEY_URL local decode)
// ---------------------------------------------------------------------------

const UniversalSearchHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeUniversalSearchHttpEnvironment = Schema.decodeUnknown(
  UniversalSearchHttpEnvironmentSchema,
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
      yield* decodeUniversalSearchHttpEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

// ---------------------------------------------------------------------------
// Per-route body schemas (raw JSON body → service input wire)
// ---------------------------------------------------------------------------

const decodeServiceSearchInput = Schema.decodeUnknown(
  UniversalSearchQueryInputSchema,
);
const decodeServiceReindexInput = Schema.decodeUnknown(
  UniversalSearchReindexInputSchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

const readJsonBody = (request: Request) =>
  Effect.tryPromise({
    try: () => request.json() as Promise<unknown>,
    catch: (cause): { readonly _tag: "JsonInvalid"; readonly cause: unknown } =>
      ({ _tag: "JsonInvalid", cause }) as const,
  });

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
      case "UniversalSearchReasonNotInCatalog":
      case "UniversalSearchReasonActionMismatch":
      case "UniversalSearchReasonAttachmentRequired":
      case "JsonInvalid":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "UniversalSearchUnauthorized":
      case "UniversalSearchMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "UniversalSearchAllFacetsFailedError":
        return createJsonResponse(
          { error: "All universal-search facets failed." },
          503,
        );
      case "MeilisearchAdapterRequestError":
      case "MeilisearchAdapterTransportError":
      case "UniversalSearchFacetAdapterError":
      case "UniversalSearchFacetIndexMissing":
        return createJsonResponse(
          { error: "Universal-search upstream call failed." },
          502,
        );
    }
  }
  return createJsonResponse({ error: "Universal-search request failed." }, 500);
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type UniversalSearchServiceRunner = <A, E>(
  use: (service: UniversalSearchServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | UniversalSearchRuntimeError>;

type UniversalSearchRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createUniversalSearchHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: UniversalSearchRequestContextResolver;
  readonly runWithService: UniversalSearchServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchUniversalSearchRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Universal-search route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (match.kind) {
      case "search":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: readJsonBody(request).pipe(
              Effect.flatMap((raw) => decodeServiceSearchInput(raw)),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.search({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) =>
            createJsonResponse(
              { result: view.result, fromCache: view.fromCache },
              200,
            ),
        });
      case "reindex":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: readJsonBody(request).pipe(
              Effect.flatMap((raw) => decodeServiceReindexInput(raw)),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.requestReindex({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: () => createJsonResponse({ accepted: true }, 202),
        });
    }
  };
};

export const createUniversalSearchHttpHandler = (
  environment: unknown,
  runWithService: UniversalSearchServiceRunner,
) =>
  createUniversalSearchHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleUniversalSearchHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createUniversalSearchHttpHandler(environment, (use) =>
    runUniversalSearchPlatformFromEnvironment(environment, use),
  )(request);
