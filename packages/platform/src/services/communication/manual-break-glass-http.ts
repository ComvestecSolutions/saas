import { Effect, Option, ParseResult, Schema } from "effect";
import {
  ManualBreakGlassGrantInputSchema,
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
  type ManualBreakGlassRuntimeError,
  type ManualBreakGlassServiceImpl,
  runManualBreakGlassFromEnvironment,
} from "../access/manual-break-glass-service";
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

export const manualBreakGlassApiBasePath = "/api/manual-break-glass";

export const manualBreakGlassApiPath = {
  issue: `${manualBreakGlassApiBasePath}/grants`,
  list: `${manualBreakGlassApiBasePath}/grants`,
  current: `${manualBreakGlassApiBasePath}/grants/current`,
  release: `${manualBreakGlassApiBasePath}/grants/:id/release`,
} as const;

const grantsPath = `${manualBreakGlassApiBasePath}/grants`;
const currentPath = `${manualBreakGlassApiBasePath}/grants/current`;
const releaseSuffix = "/release";
const grantsPathPrefix = `${grantsPath}/`;

type ManualBreakGlassRouteMatch =
  | { readonly kind: "issue" }
  | { readonly kind: "list" }
  | { readonly kind: "current" }
  | { readonly kind: "release"; readonly grantId: string };

const matchManualBreakGlassRoute = (
  pathname: string,
  method: string,
): ManualBreakGlassRouteMatch | undefined => {
  if (pathname === currentPath) {
    return { kind: "current" };
  }
  if (pathname === grantsPath) {
    if (method === "POST") return { kind: "issue" };
    return { kind: "list" };
  }
  if (
    pathname.startsWith(grantsPathPrefix) &&
    pathname.endsWith(releaseSuffix)
  ) {
    const grantId = pathname.slice(
      grantsPathPrefix.length,
      pathname.length - releaseSuffix.length,
    );
    if (grantId.length > 0 && !grantId.includes("/")) {
      return { kind: "release", grantId };
    }
  }
  return undefined;
};

const methodForRoute = (
  match: ManualBreakGlassRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "issue":
      return ["POST"];
    case "list":
      return ["GET"];
    case "current":
      return ["GET"];
    case "release":
      return ["POST"];
  }
};

// ---------------------------------------------------------------------------
// JSON body decode helpers
// ---------------------------------------------------------------------------

type JsonRequestErrorTag =
  | "ManualBreakGlassJsonInvalidError"
  | "ManualBreakGlassJsonRequestParseError";

type JsonRequestError = { readonly _tag: JsonRequestErrorTag };

const normalizeJsonRequestError = (
  error: JsonRequestError | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({
        _tag: "ManualBreakGlassJsonRequestParseError",
      } satisfies JsonRequestError)
    : error;

const readManualBreakGlassRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag:
      "ManualBreakGlassJsonInvalidError" satisfies JsonRequestErrorTag,
    decode: input.decode,
  }).pipe(Effect.mapError(normalizeJsonRequestError));

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const ManualBreakGlassHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeManualBreakGlassHttpEnvironment = Schema.decodeUnknown(
  ManualBreakGlassHttpEnvironmentSchema,
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
      yield* decodeManualBreakGlassHttpEnvironment(environment);
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

const IssueGrantBodySchema = ManualBreakGlassGrantInputSchema;

const ReleaseGrantBodySchema = Schema.Struct({
  releaseReasonCatalogId: Schema.NonEmptyString,
});

const ListGrantsQuerySchema = Schema.Struct({
  subjectId: Schema.NonEmptyString,
});

const decodeIssueGrantBody = Schema.decodeUnknown(IssueGrantBodySchema);
const decodeReleaseGrantBody = Schema.decodeUnknown(ReleaseGrantBodySchema);
const decodeListGrantsQuery = Schema.decodeUnknown(ListGrantsQuerySchema);
const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ManualBreakGlassJsonInvalidError":
      case "ManualBreakGlassJsonRequestParseError":
      case "ParseError":
      case "BreakGlassReasonNotInCatalog":
      case "BreakGlassReasonActionMismatch":
      case "BreakGlassReasonAttachmentRequired":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "BreakGlassUnauthorized":
      case "ManualBreakGlassMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "BreakGlassGrantNotFound":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "BreakGlassGrantAlreadyReleased":
      case "BreakGlassActiveLimitExceeded":
        return createJsonResponse(
          { error: "Manual break-glass invariant violation." },
          409,
        );
      case "BreakGlassGrantExpired":
        return createJsonResponse(
          { error: "Manual break-glass grant has expired." },
          410,
        );
      case "BreakGlassTtlExceeded":
        return createJsonResponse(
          { error: "Manual break-glass TTL ceiling exceeded." },
          422,
        );
    }
  }
  return createJsonResponse(
    { error: "Manual break-glass request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type ManualBreakGlassServiceRunner = <A, E>(
  use: (service: ManualBreakGlassServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | ManualBreakGlassRuntimeError>;

type ManualBreakGlassRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam — accepts an injected request-context
// resolver so unit tests can exercise routing, decoding, and error
// mapping without provisioning a live Valkey adapter)
// ---------------------------------------------------------------------------

export const createManualBreakGlassHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: ManualBreakGlassRequestContextResolver;
  readonly runWithService: ManualBreakGlassServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchManualBreakGlassRoute(url.pathname, request.method);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Manual break-glass route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (match.kind) {
      case "issue":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            grant: readManualBreakGlassRequestJson({
              request,
              decode: decodeIssueGrantBody,
            }),
          }).pipe(
            Effect.flatMap(({ requestContext, grant }) =>
              runWithService((service) =>
                service.issueGrant({ requestContext, grant }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (grant) => createJsonResponse({ grant }, 201),
        });
      case "list":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeListGrantsQuery(
              Object.fromEntries(url.searchParams.entries()),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.listActiveGrantsForSubject({
                  requestContext,
                  subjectId: query.subjectId,
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (grants) => createJsonResponse({ grants }, 200),
        });
      case "current":
        return matchHttpEffect({
          effect: buildRequestContext(request).pipe(
            Effect.flatMap((requestContext) =>
              runWithService((service) =>
                service.currentBreakGlassContextForActor({
                  requestContext,
                  subjectId: requestContext.actorId ?? "",
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (maybeGrant) =>
            createJsonResponse(
              {
                grant: Option.getOrNull(maybeGrant),
              },
              200,
            ),
        });
      case "release": {
        const grantId = match.grantId;
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            body: readManualBreakGlassRequestJson({
              request,
              decode: decodeReleaseGrantBody,
            }),
          }).pipe(
            Effect.flatMap(({ requestContext, body }) =>
              runWithService((service) =>
                service.releaseGrant({
                  requestContext,
                  release: {
                    id: grantId,
                    releaseReasonCatalogId: body.releaseReasonCatalogId,
                  },
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (grant) => createJsonResponse({ grant }, 200),
        });
      }
    }
  };
};

export const createManualBreakGlassHttpHandler = (
  environment: unknown,
  runWithService: ManualBreakGlassServiceRunner,
) =>
  createManualBreakGlassHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleManualBreakGlassHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createManualBreakGlassHttpHandler(environment, (use) =>
    runManualBreakGlassFromEnvironment(environment, use),
  )(request);
