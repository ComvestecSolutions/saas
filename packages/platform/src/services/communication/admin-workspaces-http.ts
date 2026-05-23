import { Effect, ParseResult, Schema } from "effect";
import { Option } from "effect";
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
  type AdminWorkspacesRuntimeError,
  type AdminWorkspacesServiceImpl,
  runAdminWorkspacesFromEnvironment,
} from "../access/admin-workspaces-service";
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

export const adminWorkspacesApiBasePath = "/api/admin-workspaces";

export const adminWorkspacesApiPath = {
  collection: `${adminWorkspacesApiBasePath}/`,
  byIdTemplate: `${adminWorkspacesApiBasePath}/:id`,
  reorder: `${adminWorkspacesApiBasePath}/reorder`,
} as const;

const byIdPrefix = `${adminWorkspacesApiBasePath}/`;
const reorderPath = `${adminWorkspacesApiBasePath}/reorder`;

type AdminWorkspacesRouteMatch =
  | { readonly kind: "list" }
  | { readonly kind: "create" }
  | { readonly kind: "reorder" }
  | { readonly kind: "get"; readonly id: string }
  | { readonly kind: "update"; readonly id: string }
  | { readonly kind: "delete"; readonly id: string };

const matchAdminWorkspacesRoute = (
  pathname: string,
  method: string,
): AdminWorkspacesRouteMatch | undefined => {
  if (
    pathname === adminWorkspacesApiBasePath ||
    pathname === adminWorkspacesApiPath.collection
  ) {
    if (method === "POST") return { kind: "create" };
    return { kind: "list" };
  }
  if (pathname === reorderPath) {
    return { kind: "reorder" };
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
  match: AdminWorkspacesRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "list":
      return ["GET"];
    case "create":
      return ["POST"];
    case "reorder":
      return ["POST"];
    case "get":
      return ["GET"];
    case "update":
      return ["PATCH"];
    case "delete":
      return ["DELETE"];
  }
};

// ---------------------------------------------------------------------------
// JSON body decode helpers
// ---------------------------------------------------------------------------

type JsonRequestErrorTag =
  | "AdminWorkspacesJsonInvalidError"
  | "AdminWorkspacesJsonRequestParseError";

type JsonRequestError = { readonly _tag: JsonRequestErrorTag };

const normalizeJsonRequestError = (
  error: JsonRequestError | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({
        _tag: "AdminWorkspacesJsonRequestParseError",
      } satisfies JsonRequestError)
    : error;

const readAdminWorkspacesRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag:
      "AdminWorkspacesJsonInvalidError" satisfies JsonRequestErrorTag,
    decode: input.decode,
  }).pipe(Effect.mapError(normalizeJsonRequestError));

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const AdminWorkspacesHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeAdminWorkspacesHttpEnvironment = Schema.decodeUnknown(
  AdminWorkspacesHttpEnvironmentSchema,
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
      yield* decodeAdminWorkspacesHttpEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

// ---------------------------------------------------------------------------
// Per-route input schemas (body shapes)
// ---------------------------------------------------------------------------

const CreateWorkspaceBodySchema = Schema.Struct({
  name: Schema.NonEmptyString,
  serializedLayout: Schema.NonEmptyString,
});

const UpdateWorkspaceBodySchema = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  serializedLayout: Schema.optional(Schema.NonEmptyString),
});

const ReorderWorkspacesBodySchema = Schema.Struct({
  idsInOrder: Schema.NonEmptyArray(Schema.NonEmptyString),
});

const decodeCreateBody = Schema.decodeUnknown(CreateWorkspaceBodySchema);
const decodeUpdateBody = Schema.decodeUnknown(UpdateWorkspaceBodySchema);
const decodeReorderBody = Schema.decodeUnknown(ReorderWorkspacesBodySchema);
const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminWorkspacesJsonInvalidError":
      case "AdminWorkspacesJsonRequestParseError":
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
          { error: "Workspaces are scoped to the requesting operator." },
          403,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "WorkspaceNotFound":
      case "AdminWorkspacesNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "WorkspaceAlreadyExists":
      case "AdminWorkspacesUniqueViolationError":
        return createJsonResponse(
          { error: "Workspace with this name already exists for the owner." },
          409,
        );
      case "WorkspaceReorderInputMismatch":
      case "AdminWorkspacesReorderMismatchError":
        return createJsonResponse(
          {
            error:
              "Reorder ids must equal the operator's current workspace set exactly.",
          },
          409,
        );
      case "AdminWorkspacesPersistenceError":
      case "AdminWorkspacesQueryError":
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
  return createJsonResponse({ error: "Admin workspaces request failed." }, 500);
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type AdminWorkspacesServiceRunner = <A, E>(
  use: (service: AdminWorkspacesServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | AdminWorkspacesRuntimeError>;

type AdminWorkspacesRequestContextResolver = (
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

export const createAdminWorkspacesHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: AdminWorkspacesRequestContextResolver;
  readonly runWithService: AdminWorkspacesServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchAdminWorkspacesRoute(url.pathname, request.method);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Admin workspaces route not found."),
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
            return yield* runWithService((service) =>
              service.list({ requestContext, ownerSubjectId }),
            );
          }),
          onFailure: buildErrorResponse,
          onSuccess: (workspaces) => createJsonResponse({ workspaces }, 200),
        });
      case "create":
        return matchHttpEffect({
          effect: Effect.gen(function* () {
            const requestContext = yield* buildRequestContext(request);
            const ownerSubjectId = yield* requireActorId(requestContext);
            const body = yield* readAdminWorkspacesRequestJson({
              request,
              decode: decodeCreateBody,
            });
            return yield* runWithService((service) =>
              service.create({
                requestContext,
                ownerSubjectId,
                name: body.name,
                serializedLayout: body.serializedLayout,
              }),
            );
          }),
          onFailure: buildErrorResponse,
          onSuccess: (workspace) => createJsonResponse({ workspace }, 201),
        });
      case "reorder":
        return matchHttpEffect({
          effect: Effect.gen(function* () {
            const requestContext = yield* buildRequestContext(request);
            const ownerSubjectId = yield* requireActorId(requestContext);
            const body = yield* readAdminWorkspacesRequestJson({
              request,
              decode: decodeReorderBody,
            });
            return yield* runWithService((service) =>
              service.reorder({
                requestContext,
                ownerSubjectId,
                idsInOrder: body.idsInOrder,
              }),
            );
          }),
          onFailure: buildErrorResponse,
          onSuccess: (workspaces) => createJsonResponse({ workspaces }, 200),
        });
      case "get": {
        const id = match.id;
        return matchHttpEffect({
          effect: Effect.gen(function* () {
            const requestContext = yield* buildRequestContext(request);
            const ownerSubjectId = yield* requireActorId(requestContext);
            return yield* runWithService((service) =>
              service.get({ requestContext, ownerSubjectId, id }),
            );
          }),
          onFailure: buildErrorResponse,
          onSuccess: (maybeWorkspace) =>
            Option.isNone(maybeWorkspace)
              ? createNotFoundResponse("Workspace not found.")
              : createJsonResponse({ workspace: maybeWorkspace.value }, 200),
        });
      }
      case "update": {
        const id = match.id;
        return matchHttpEffect({
          effect: Effect.gen(function* () {
            const requestContext = yield* buildRequestContext(request);
            const ownerSubjectId = yield* requireActorId(requestContext);
            const patch = yield* readAdminWorkspacesRequestJson({
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
          onSuccess: (workspace) => createJsonResponse({ workspace }, 200),
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
    }
  };
};

export const createAdminWorkspacesHttpHandler = (
  environment: unknown,
  runWithService: AdminWorkspacesServiceRunner,
) =>
  createAdminWorkspacesHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleAdminWorkspacesHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminWorkspacesHttpHandler(environment, (use) =>
    runAdminWorkspacesFromEnvironment(environment, use),
  )(request);
