import { Effect, Option, ParseResult, Schema } from "effect";
import {
  KeycloakRoleGetByIdInputSchema,
  PlatformScopeSchema,
  RequestContextSchema,
  type RequestContext,
} from "@comvestec/contracts";
import {
  resolveIdentitySessionRequestContext,
  type IdentitySessionRequestContextNotFoundError,
} from "@comvestec/modules";

import { makeValkeyAdapter, type ValkeyAdapterError } from "../../adapters";
import { extractRequiredSubscriberJourneySessionIdFromHeader } from "../access/request-context-transport";
import {
  type KeycloakRoleReadRuntimeError,
  type KeycloakRoleReadServiceImpl,
  runKeycloakRoleReadFromEnvironment,
} from "../domains/keycloak-role-read-service";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
} from "./http-transport";

export const keycloakRoleReadApiBasePath = "/api/keycloak-role-read";

export const keycloakRoleReadApiPath = {
  byId: `${keycloakRoleReadApiBasePath}/by-id`,
} as const;

type KeycloakRoleReadRouteMatch = {
  readonly kind: "byId";
};

const matchKeycloakRoleReadRoute = (
  pathname: string,
): KeycloakRoleReadRouteMatch | undefined =>
  pathname === keycloakRoleReadApiPath.byId ? { kind: "byId" } : undefined;

const methodForRoute = (
  _match: KeycloakRoleReadRouteMatch,
): readonly string[] => ["GET"];

const KeycloakRoleReadHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeKeycloakRoleReadHttpEnvironment = Schema.decodeUnknown(
  KeycloakRoleReadHttpEnvironmentSchema,
);

export class KeycloakRoleReadHttpEnvironmentError {
  readonly _tag = "KeycloakRoleReadHttpEnvironmentError" as const;
  constructor(readonly args: { readonly cause: ParseResult.ParseError }) {}
}

type ResolveTrustedRequestContextError =
  | KeycloakRoleReadHttpEnvironmentError
  | ValkeyAdapterError
  | IdentitySessionRequestContextNotFoundError
  | { readonly _tag: "SubscriberJourneySessionIdMissingError" };

const resolveTrustedRequestContextFromRequest = (
  environment: unknown,
  request: Request,
): Effect.Effect<RequestContext, ResolveTrustedRequestContextError> =>
  Effect.gen(function* () {
    const sessionId =
      yield* extractRequiredSubscriberJourneySessionIdFromHeader(request);
    const resolvedEnvironment = yield* decodeKeycloakRoleReadHttpEnvironment(
      environment,
    ).pipe(
      Effect.mapError(
        (cause) => new KeycloakRoleReadHttpEnvironmentError({ cause }),
      ),
    );
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });

    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

const ByIdQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  roleId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

const decodeByIdQuery = Schema.decodeUnknown(ByIdQuerySchema);
const decodeServiceByIdInput = Schema.decodeUnknown(
  KeycloakRoleGetByIdInputSchema,
);
const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
      case "KeycloakRoleReadReasonNotInCatalog":
      case "KeycloakRoleReadReasonActionMismatch":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "KeycloakRoleReadHttpEnvironmentError":
      case "KeycloakRoleReadRuntimeEnvironmentError":
        return createJsonResponse(
          { error: "Keycloak role read service is not configured correctly." },
          500,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "KeycloakRoleReadUnauthorized":
      case "KeycloakRoleReadMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "KeycloakRoleReadAdapterClientError":
      case "KeycloakAdapterRequestError":
        return createJsonResponse(
          { error: "Keycloak role read upstream call failed." },
          502,
        );
    }
  }

  return createJsonResponse(
    { error: "Keycloak role read request failed." },
    500,
  );
};

type KeycloakRoleReadServiceRunner = <A, E>(
  use: (service: KeycloakRoleReadServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | KeycloakRoleReadRuntimeError>;

type KeycloakRoleReadRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

export const createKeycloakRoleReadHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: KeycloakRoleReadRequestContextResolver;
  readonly runWithService: KeycloakRoleReadServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchKeycloakRoleReadRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Keycloak role read route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    const rawQuery = Object.fromEntries(url.searchParams.entries());

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
              roleId: parsed.roleId,
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
        createJsonResponse({ role: Option.getOrNull(view) }, 200),
    });
  };
};

export const createKeycloakRoleReadHttpHandler = (
  environment: unknown,
  runWithService: KeycloakRoleReadServiceRunner,
) =>
  createKeycloakRoleReadHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleKeycloakRoleReadHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createKeycloakRoleReadHttpHandler(environment, (use) =>
    runKeycloakRoleReadFromEnvironment(environment, use),
  )(request);
