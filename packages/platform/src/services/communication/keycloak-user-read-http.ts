import { Effect, Option, ParseResult, Schema } from "effect";
import {
  KeycloakUserGetByIdInputSchema,
  KeycloakUserListByEmailInputSchema,
  KeycloakUserListByUsernameInputSchema,
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
  type KeycloakUserReadRuntimeError,
  type KeycloakUserReadServiceImpl,
  runKeycloakUserReadFromEnvironment,
} from "../domains/keycloak-user-read-service";
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

export const keycloakUserReadApiBasePath = "/api/keycloak-user-read";

export const keycloakUserReadApiPath = {
  byId: `${keycloakUserReadApiBasePath}/by-id`,
  byEmail: `${keycloakUserReadApiBasePath}/by-email`,
  byUsername: `${keycloakUserReadApiBasePath}/by-username`,
} as const;

type KeycloakUserReadRouteMatch =
  | { readonly kind: "byId" }
  | { readonly kind: "byEmail" }
  | { readonly kind: "byUsername" };

const matchKeycloakUserReadRoute = (
  pathname: string,
): KeycloakUserReadRouteMatch | undefined => {
  if (pathname === keycloakUserReadApiPath.byId) {
    return { kind: "byId" };
  }
  if (pathname === keycloakUserReadApiPath.byEmail) {
    return { kind: "byEmail" };
  }
  if (pathname === keycloakUserReadApiPath.byUsername) {
    return { kind: "byUsername" };
  }
  return undefined;
};

const methodForRoute = (
  match: KeycloakUserReadRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "byId":
    case "byEmail":
    case "byUsername":
      return ["GET"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const KeycloakUserReadHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeKeycloakUserReadHttpEnvironment = Schema.decodeUnknown(
  KeycloakUserReadHttpEnvironmentSchema,
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
      yield* decodeKeycloakUserReadHttpEnvironment(environment);
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
  userId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

const ByEmailQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const ByUsernameQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  username: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const decodeByIdQuery = Schema.decodeUnknown(ByIdQuerySchema);
const decodeByEmailQuery = Schema.decodeUnknown(ByEmailQuerySchema);
const decodeByUsernameQuery = Schema.decodeUnknown(ByUsernameQuerySchema);

const decodeServiceByIdInput = Schema.decodeUnknown(
  KeycloakUserGetByIdInputSchema,
);
const decodeServiceByEmailInput = Schema.decodeUnknown(
  KeycloakUserListByEmailInputSchema,
);
const decodeServiceByUsernameInput = Schema.decodeUnknown(
  KeycloakUserListByUsernameInputSchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
      case "KeycloakUserReadReasonNotInCatalog":
      case "KeycloakUserReadReasonActionMismatch":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "KeycloakUserReadUnauthorized":
      case "KeycloakUserReadMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "KeycloakUserReadAdapterClientError":
      case "KeycloakAdapterRequestError":
        return createJsonResponse(
          { error: "Keycloak user read upstream call failed." },
          502,
        );
    }
  }
  return createJsonResponse(
    { error: "Keycloak user read request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type KeycloakUserReadServiceRunner = <A, E>(
  use: (service: KeycloakUserReadServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | KeycloakUserReadRuntimeError>;

type KeycloakUserReadRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam — accepts an injected request-context
// resolver so unit tests can exercise routing, decoding, and error
// mapping without provisioning a live Valkey adapter)
// ---------------------------------------------------------------------------

export const createKeycloakUserReadHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: KeycloakUserReadRequestContextResolver;
  readonly runWithService: KeycloakUserReadServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchKeycloakUserReadRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Keycloak user read route not found."),
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
                  userId: parsed.userId,
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
            createJsonResponse({ user: Option.getOrNull(view) }, 200),
        });
      case "byEmail":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByEmailQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByEmailInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  email: parsed.email,
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
                service.listByEmail({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse(view, 200),
        });
      case "byUsername":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByUsernameQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByUsernameInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  username: parsed.username,
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
                service.listByUsername({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse(view, 200),
        });
    }
  };
};

export const createKeycloakUserReadHttpHandler = (
  environment: unknown,
  runWithService: KeycloakUserReadServiceRunner,
) =>
  createKeycloakUserReadHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleKeycloakUserReadHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createKeycloakUserReadHttpHandler(environment, (use) =>
    runKeycloakUserReadFromEnvironment(environment, use),
  )(request);
