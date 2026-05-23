import { Effect, Option, ParseResult, Schema } from "effect";
import {
  GlitchTipIssueGetByIdInputSchema,
  GlitchTipIssueLevelSchema,
  GlitchTipIssueListByLevelInputSchema,
  GlitchTipIssueListByProjectInputSchema,
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
  runGlitchTipIssuesReadFromEnvironment,
  type GlitchTipIssuesReadRuntimeError,
  type GlitchTipIssuesReadServiceImpl,
} from "../domains/glitchtip-issues-read-service";
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

export const glitchTipIssuesReadApiBasePath = "/api/glitchtip-issues-read";

export const glitchTipIssuesReadApiPath = {
  byId: `${glitchTipIssuesReadApiBasePath}/by-id`,
  byProject: `${glitchTipIssuesReadApiBasePath}/by-project`,
  byLevel: `${glitchTipIssuesReadApiBasePath}/by-level`,
} as const;

type GlitchTipIssuesReadRouteMatch =
  | { readonly kind: "byId" }
  | { readonly kind: "byProject" }
  | { readonly kind: "byLevel" };

const matchGlitchTipIssuesReadRoute = (
  pathname: string,
): GlitchTipIssuesReadRouteMatch | undefined => {
  if (pathname === glitchTipIssuesReadApiPath.byId) {
    return { kind: "byId" };
  }
  if (pathname === glitchTipIssuesReadApiPath.byProject) {
    return { kind: "byProject" };
  }
  if (pathname === glitchTipIssuesReadApiPath.byLevel) {
    return { kind: "byLevel" };
  }
  return undefined;
};

const methodForRoute = (
  match: GlitchTipIssuesReadRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "byId":
    case "byProject":
    case "byLevel":
      return ["GET"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const GlitchTipIssuesReadHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeGlitchTipIssuesReadHttpEnvironment = Schema.decodeUnknown(
  GlitchTipIssuesReadHttpEnvironmentSchema,
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
      yield* decodeGlitchTipIssuesReadHttpEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

// ---------------------------------------------------------------------------
// Per-route query-string schemas (raw query string → service input wire)
// ---------------------------------------------------------------------------

const ByIdQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  issueId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

const ByProjectQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  projectSlug: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const ByLevelQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  level: GlitchTipIssueLevelSchema,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const decodeByIdQuery = Schema.decodeUnknown(ByIdQuerySchema);
const decodeByProjectQuery = Schema.decodeUnknown(ByProjectQuerySchema);
const decodeByLevelQuery = Schema.decodeUnknown(ByLevelQuerySchema);

const decodeServiceByIdInput = Schema.decodeUnknown(
  GlitchTipIssueGetByIdInputSchema,
);
const decodeServiceByProjectInput = Schema.decodeUnknown(
  GlitchTipIssueListByProjectInputSchema,
);
const decodeServiceByLevelInput = Schema.decodeUnknown(
  GlitchTipIssueListByLevelInputSchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
      case "GlitchTipIssuesReadReasonNotInCatalog":
      case "GlitchTipIssuesReadReasonActionMismatch":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "GlitchTipIssuesReadUnauthorized":
      case "GlitchTipIssuesReadMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "GlitchTipIssuesReadAdapterClientError":
      case "GlitchtipAdapterRequestError":
      case "GlitchtipAdapterTransportError":
        return createJsonResponse(
          { error: "GlitchTip issues read upstream call failed." },
          502,
        );
    }
  }
  return createJsonResponse(
    { error: "GlitchTip issues read request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type GlitchTipIssuesReadServiceRunner = <A, E>(
  use: (service: GlitchTipIssuesReadServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | GlitchTipIssuesReadRuntimeError>;

type GlitchTipIssuesReadRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createGlitchTipIssuesReadHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: GlitchTipIssuesReadRequestContextResolver;
  readonly runWithService: GlitchTipIssuesReadServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchGlitchTipIssuesReadRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("GlitchTip issues read route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    const rawQuery = Object.fromEntries(url.searchParams.entries());

    switch (match.kind) {
      case "byId":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByIdQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByIdInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  issueId: parsed.issueId,
                  reasonCatalogId: parsed.reasonCatalogId,
                }),
              ),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.getById({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) =>
            createJsonResponse({ entry: Option.getOrNull(view) }, 200),
        });
      case "byProject":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByProjectQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByProjectInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  projectSlug: parsed.projectSlug,
                  reasonCatalogId: parsed.reasonCatalogId,
                  ...(parsed.limit === undefined
                    ? {}
                    : { limit: parsed.limit }),
                }),
              ),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.listByProject({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse(view, 200),
        });
      case "byLevel":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByLevelQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByLevelInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  level: parsed.level,
                  reasonCatalogId: parsed.reasonCatalogId,
                  ...(parsed.limit === undefined
                    ? {}
                    : { limit: parsed.limit }),
                }),
              ),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.listByLevel({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse(view, 200),
        });
    }
  };
};

export const createGlitchTipIssuesReadHttpHandler = (
  environment: unknown,
  runWithService: GlitchTipIssuesReadServiceRunner,
) =>
  createGlitchTipIssuesReadHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleGlitchTipIssuesReadHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createGlitchTipIssuesReadHttpHandler(environment, (use) =>
    runGlitchTipIssuesReadFromEnvironment(environment, use),
  )(request);
