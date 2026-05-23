import { Effect, Option, ParseResult, Schema } from "effect";
import {
  OpenPanelEventGetByIdInputSchema,
  OpenPanelEventListByEventNameInputSchema,
  OpenPanelEventListByProjectInputSchema,
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
  runOpenPanelEventsReadFromEnvironment,
  type OpenPanelEventsReadRuntimeError,
  type OpenPanelEventsReadServiceImpl,
} from "../domains/openpanel-events-read-service";
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

export const openPanelEventsReadApiBasePath = "/api/openpanel-events-read";

export const openPanelEventsReadApiPath = {
  byId: `${openPanelEventsReadApiBasePath}/by-id`,
  byProject: `${openPanelEventsReadApiBasePath}/by-project`,
  byEventName: `${openPanelEventsReadApiBasePath}/by-event-name`,
} as const;

type OpenPanelEventsReadRouteMatch =
  | { readonly kind: "byId" }
  | { readonly kind: "byProject" }
  | { readonly kind: "byEventName" };

const matchOpenPanelEventsReadRoute = (
  pathname: string,
): OpenPanelEventsReadRouteMatch | undefined => {
  if (pathname === openPanelEventsReadApiPath.byId) {
    return { kind: "byId" };
  }
  if (pathname === openPanelEventsReadApiPath.byProject) {
    return { kind: "byProject" };
  }
  if (pathname === openPanelEventsReadApiPath.byEventName) {
    return { kind: "byEventName" };
  }
  return undefined;
};

const methodForRoute = (
  match: OpenPanelEventsReadRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "byId":
    case "byProject":
    case "byEventName":
      return ["GET"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const OpenPanelEventsReadHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeOpenPanelEventsReadHttpEnvironment = Schema.decodeUnknown(
  OpenPanelEventsReadHttpEnvironmentSchema,
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
      yield* decodeOpenPanelEventsReadHttpEnvironment(environment);
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
  eventId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

const ByProjectQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const ByEventNameQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  eventName: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const decodeByIdQuery = Schema.decodeUnknown(ByIdQuerySchema);
const decodeByProjectQuery = Schema.decodeUnknown(ByProjectQuerySchema);
const decodeByEventNameQuery = Schema.decodeUnknown(ByEventNameQuerySchema);

const decodeServiceByIdInput = Schema.decodeUnknown(
  OpenPanelEventGetByIdInputSchema,
);
const decodeServiceByProjectInput = Schema.decodeUnknown(
  OpenPanelEventListByProjectInputSchema,
);
const decodeServiceByEventNameInput = Schema.decodeUnknown(
  OpenPanelEventListByEventNameInputSchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
      case "OpenPanelEventsReadReasonNotInCatalog":
      case "OpenPanelEventsReadReasonActionMismatch":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "OpenPanelEventsReadUnauthorized":
      case "OpenPanelEventsReadMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "OpenPanelEventsReadAdapterClientError":
      case "OpenPanelAdapterRequestError":
      case "OpenPanelAdapterTransportError":
        return createJsonResponse(
          { error: "OpenPanel events read upstream call failed." },
          502,
        );
    }
  }
  return createJsonResponse(
    { error: "OpenPanel events read request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type OpenPanelEventsReadServiceRunner = <A, E>(
  use: (service: OpenPanelEventsReadServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | OpenPanelEventsReadRuntimeError>;

type OpenPanelEventsReadRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createOpenPanelEventsReadHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: OpenPanelEventsReadRequestContextResolver;
  readonly runWithService: OpenPanelEventsReadServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchOpenPanelEventsReadRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("OpenPanel events read route not found."),
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
                  eventId: parsed.eventId,
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
                  projectId: parsed.projectId,
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
      case "byEventName":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByEventNameQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByEventNameInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  eventName: parsed.eventName,
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
                service.listByEventName({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse(view, 200),
        });
    }
  };
};

export const createOpenPanelEventsReadHttpHandler = (
  environment: unknown,
  runWithService: OpenPanelEventsReadServiceRunner,
) =>
  createOpenPanelEventsReadHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleOpenPanelEventsReadHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createOpenPanelEventsReadHttpHandler(environment, (use) =>
    runOpenPanelEventsReadFromEnvironment(environment, use),
  )(request);
