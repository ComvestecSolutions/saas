import { Effect, ParseResult, Schema } from "effect";
import { Option } from "effect";
import {
  AdminSavedViewResourceKindSchema,
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
  type AdminSavedViewsRuntimeError,
  type AdminSavedViewsServiceImpl,
  runAdminSavedViewsFromEnvironment,
} from "../access/admin-saved-views-service";
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

export const adminSavedViewsApiBasePath = "/api/admin-saved-views";

export const adminSavedViewsApiPath = {
  collection: `${adminSavedViewsApiBasePath}/`,
  byIdTemplate: `${adminSavedViewsApiBasePath}/:id`,
  pinByIdTemplate: `${adminSavedViewsApiBasePath}/:id/pin`,
  unpinByIdTemplate: `${adminSavedViewsApiBasePath}/:id/unpin`,
} as const;

const byIdPrefix = `${adminSavedViewsApiBasePath}/`;
const pinSuffix = "/pin";
const unpinSuffix = "/unpin";

type AdminSavedViewsRouteMatch =
  | { readonly kind: "list" }
  | { readonly kind: "create" }
  | { readonly kind: "get"; readonly id: string }
  | { readonly kind: "update"; readonly id: string }
  | { readonly kind: "delete"; readonly id: string }
  | { readonly kind: "pin"; readonly id: string }
  | { readonly kind: "unpin"; readonly id: string };

const extractIdSegment = (
  pathname: string,
  suffix: string,
): string | undefined => {
  if (!pathname.startsWith(byIdPrefix) || !pathname.endsWith(suffix)) {
    return undefined;
  }
  const id = pathname.slice(byIdPrefix.length, pathname.length - suffix.length);
  if (id.length === 0 || id.includes("/")) {
    return undefined;
  }
  return id;
};

const matchAdminSavedViewsRoute = (
  pathname: string,
  method: string,
): AdminSavedViewsRouteMatch | undefined => {
  if (
    pathname === adminSavedViewsApiBasePath ||
    pathname === adminSavedViewsApiPath.collection
  ) {
    if (method === "POST") return { kind: "create" };
    return { kind: "list" };
  }
  const pinId = extractIdSegment(pathname, pinSuffix);
  if (pinId !== undefined) {
    return { kind: "pin", id: pinId };
  }
  const unpinId = extractIdSegment(pathname, unpinSuffix);
  if (unpinId !== undefined) {
    return { kind: "unpin", id: unpinId };
  }
  if (pathname.startsWith(byIdPrefix)) {
    const tail = pathname.slice(byIdPrefix.length);
    if (tail.length > 0 && !tail.includes("/")) {
      if (method === "PATCH") return { kind: "update", id: tail };
      if (method === "DELETE") return { kind: "delete", id: tail };
      return { kind: "get", id: tail };
    }
  }
  return undefined;
};

const methodForRoute = (
  match: AdminSavedViewsRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "list":
      return ["GET"];
    case "create":
      return ["POST"];
    case "get":
      return ["GET"];
    case "update":
      return ["PATCH"];
    case "delete":
      return ["DELETE"];
    case "pin":
    case "unpin":
      return ["POST"];
  }
};

// ---------------------------------------------------------------------------
// JSON body decode helpers
// ---------------------------------------------------------------------------

type JsonRequestErrorTag =
  | "AdminSavedViewsJsonInvalidError"
  | "AdminSavedViewsJsonRequestParseError";

type JsonRequestError = { readonly _tag: JsonRequestErrorTag };

const normalizeJsonRequestError = (
  error: JsonRequestError | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({
        _tag: "AdminSavedViewsJsonRequestParseError",
      } satisfies JsonRequestError)
    : error;

const readAdminSavedViewsRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag:
      "AdminSavedViewsJsonInvalidError" satisfies JsonRequestErrorTag,
    decode: input.decode,
  }).pipe(Effect.mapError(normalizeJsonRequestError));

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const AdminSavedViewsHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeAdminSavedViewsHttpEnvironment = Schema.decodeUnknown(
  AdminSavedViewsHttpEnvironmentSchema,
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
      yield* decodeAdminSavedViewsHttpEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

// ---------------------------------------------------------------------------
// Per-route input schemas (query / body shapes)
// ---------------------------------------------------------------------------

const ListSavedViewsQuerySchema = Schema.Struct({
  resourceKind: Schema.optional(AdminSavedViewResourceKindSchema),
  pinnedOnly: Schema.optional(Schema.Literal("true", "false")),
});

const CreateSavedViewBodySchema = Schema.Struct({
  name: Schema.NonEmptyString,
  resourceKind: AdminSavedViewResourceKindSchema,
  serializedView: Schema.NonEmptyString,
  pinned: Schema.optional(Schema.Boolean),
});

const UpdateSavedViewBodySchema = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  serializedView: Schema.optional(Schema.NonEmptyString),
  pinned: Schema.optional(Schema.Boolean),
});

const decodeListQuery = Schema.decodeUnknown(ListSavedViewsQuerySchema);
const decodeCreateBody = Schema.decodeUnknown(CreateSavedViewBodySchema);
const decodeUpdateBody = Schema.decodeUnknown(UpdateSavedViewBodySchema);
const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminSavedViewsJsonInvalidError":
      case "AdminSavedViewsJsonRequestParseError":
      case "ParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "MissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "CrossUserAccessDenied":
        return createJsonResponse(
          { error: "Saved views are scoped to the requesting operator." },
          403,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "SavedViewNotFound":
      case "AdminSavedViewsNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "SavedViewAlreadyExists":
      case "AdminSavedViewsUniqueViolationError":
        return createJsonResponse(
          { error: "Saved view with this name already exists for the owner." },
          409,
        );
      case "AdminSavedViewsPersistenceError":
      case "AdminSavedViewsQueryError":
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuditLogParseError":
      case "PostgresAdapterConnectionError":
      case "ValkeyAdapterOperationError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }
  return createJsonResponse(
    { error: "Admin saved views request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type AdminSavedViewsServiceRunner = <A, E>(
  use: (service: AdminSavedViewsServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | AdminSavedViewsRuntimeError>;

type AdminSavedViewsRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

const requireActorId = (
  requestContext: RequestContext,
): Effect.Effect<string, { readonly _tag: "MissingActorIdentity" }> =>
  requestContext.actorId === undefined
    ? Effect.fail({ _tag: "MissingActorIdentity" as const })
    : Effect.succeed(requestContext.actorId);

export const createAdminSavedViewsHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: AdminSavedViewsRequestContextResolver;
  readonly runWithService: AdminSavedViewsServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchAdminSavedViewsRoute(url.pathname, request.method);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Admin saved views route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (match.kind) {
      case "list":
        return matchHttpEffect({
          effect: Effect.gen(function* () {
            const requestContext = yield* buildRequestContext(request);
            const ownerSubjectId = yield* requireActorId(requestContext);
            const query = yield* decodeListQuery(
              Object.fromEntries(url.searchParams.entries()),
            );
            return yield* runWithService((service) =>
              service.list({
                requestContext,
                ownerSubjectId,
                ...(query.resourceKind === undefined &&
                query.pinnedOnly === undefined
                  ? {}
                  : {
                      filter: {
                        ...(query.resourceKind === undefined
                          ? {}
                          : { resourceKind: query.resourceKind }),
                        ...(query.pinnedOnly === undefined
                          ? {}
                          : { pinnedOnly: query.pinnedOnly === "true" }),
                      },
                    }),
              }),
            );
          }),
          onFailure: buildErrorResponse,
          onSuccess: (savedViews) => createJsonResponse({ savedViews }, 200),
        });
      case "create":
        return matchHttpEffect({
          effect: Effect.gen(function* () {
            const requestContext = yield* buildRequestContext(request);
            const ownerSubjectId = yield* requireActorId(requestContext);
            const body = yield* readAdminSavedViewsRequestJson({
              request,
              decode: decodeCreateBody,
            });
            return yield* runWithService((service) =>
              service.create({
                requestContext,
                ownerSubjectId,
                name: body.name,
                resourceKind: body.resourceKind,
                serializedView: body.serializedView,
                ...(body.pinned === undefined ? {} : { pinned: body.pinned }),
              }),
            );
          }),
          onFailure: buildErrorResponse,
          onSuccess: (savedView) => createJsonResponse({ savedView }, 201),
        });
      case "get": {
        const id = match.id;
        return matchHttpEffect({
          effect: Effect.gen(function* () {
            const requestContext = yield* buildRequestContext(request);
            const ownerSubjectId = yield* requireActorId(requestContext);
            const result = yield* runWithService((service) =>
              service.get({ requestContext, ownerSubjectId, id }),
            );
            return result;
          }),
          onFailure: buildErrorResponse,
          onSuccess: (maybeSavedView) =>
            Option.isNone(maybeSavedView)
              ? createNotFoundResponse("Saved view not found.")
              : createJsonResponse({ savedView: maybeSavedView.value }, 200),
        });
      }
      case "update": {
        const id = match.id;
        return matchHttpEffect({
          effect: Effect.gen(function* () {
            const requestContext = yield* buildRequestContext(request);
            const ownerSubjectId = yield* requireActorId(requestContext);
            const patch = yield* readAdminSavedViewsRequestJson({
              request,
              decode: decodeUpdateBody,
            });
            return yield* runWithService((service) =>
              service.update({
                requestContext,
                ownerSubjectId,
                id,
                patch,
              }),
            );
          }),
          onFailure: buildErrorResponse,
          onSuccess: (savedView) => createJsonResponse({ savedView }, 200),
        });
      }
      case "delete": {
        const id = match.id;
        return matchHttpEffect({
          effect: Effect.gen(function* () {
            const requestContext = yield* buildRequestContext(request);
            const ownerSubjectId = yield* requireActorId(requestContext);
            yield* runWithService((service) =>
              service.delete({ requestContext, ownerSubjectId, id }),
            );
            return id;
          }),
          onFailure: buildErrorResponse,
          onSuccess: (deletedId) => createJsonResponse({ id: deletedId }, 200),
        });
      }
      case "pin":
      case "unpin": {
        const id = match.id;
        const pinned = match.kind === "pin";
        return matchHttpEffect({
          effect: Effect.gen(function* () {
            const requestContext = yield* buildRequestContext(request);
            const ownerSubjectId = yield* requireActorId(requestContext);
            return yield* runWithService((service) =>
              service.setPinned({
                requestContext,
                ownerSubjectId,
                id,
                pinned,
              }),
            );
          }),
          onFailure: buildErrorResponse,
          onSuccess: (savedView) => createJsonResponse({ savedView }, 200),
        });
      }
    }
  };
};

export const createAdminSavedViewsHttpHandler = (
  environment: unknown,
  runWithService: AdminSavedViewsServiceRunner,
) =>
  createAdminSavedViewsHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleAdminSavedViewsHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminSavedViewsHttpHandler(environment, (use) =>
    runAdminSavedViewsFromEnvironment(environment, use),
  )(request);
