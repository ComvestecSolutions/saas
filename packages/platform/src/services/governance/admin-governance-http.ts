import { Effect, Schema } from "effect";
import {
  AdminGovernanceReadBySessionRequestSchema,
  type AdminGovernanceServiceError,
  type AdminGovernanceService,
  PersistRuntimeConfigProposalsRequestSchema,
  runAdminGovernanceFromEnvironment,
  UpsertRuntimeConfigOverrideRequestSchema,
} from "./admin-governance";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestJson,
} from "../communication/http-transport";

export type { AdminGovernanceService } from "./admin-governance";

type AdminGovernanceServiceRunner = <A, E>(
  use: (service: AdminGovernanceService) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | AdminGovernanceServiceError>;

type JsonRequestErrorTag =
  | "AdminGovernanceJsonInvalidError"
  | "AdminGovernanceJsonRequestParseError"
  | "AdminGovernanceMutationRequestContextNotFoundError"
  | "AdminGovernanceMutationRequestContextMalformedError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

export const adminGovernanceApiBasePath = "/api/admin/governance";

export const adminGovernanceApiPath = {
  listRuntimeConfigOverrides: `${adminGovernanceApiBasePath}/runtime-config/overrides/list`,
  upsertRuntimeConfigOverride: `${adminGovernanceApiBasePath}/runtime-config/overrides/upsert`,
  persistRuntimeConfigProposals: `${adminGovernanceApiBasePath}/runtime-config/proposals/persist`,
  listRuntimeConfigProposals: `${adminGovernanceApiBasePath}/runtime-config/proposals/list`,
  queryAuditEventsByModule: `${adminGovernanceApiBasePath}/audit-log/query-by-module`,
} as const;

const adminGovernanceAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [adminGovernanceApiPath.listRuntimeConfigOverrides]: ["POST"],
  [adminGovernanceApiPath.upsertRuntimeConfigOverride]: ["POST"],
  [adminGovernanceApiPath.persistRuntimeConfigProposals]: ["POST"],
  [adminGovernanceApiPath.listRuntimeConfigProposals]: ["POST"],
  [adminGovernanceApiPath.queryAuditEventsByModule]: ["POST"],
};

const buildErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminGovernanceJsonInvalidError":
        return createJsonResponse(
          { error: "Request body must be valid JSON." },
          400,
        );
      case "AdminGovernanceJsonRequestParseError":
      case "ParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "AdminGovernanceProjectionConfigurationError":
      case "AdminGovernanceProjectedRecordParseError":
        return createJsonResponse(
          { error: "Admin governance response projection is misconfigured." },
          500,
        );
      case "AdminGovernanceRequestContextNotFoundError":
        return createJsonResponse(
          {
            error:
              "Admin governance reads require a valid authenticated session.",
          },
          401,
        );
      case "AdminGovernanceRequestContextMalformedError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
      case "AdminGovernanceMutationRequestContextNotFoundError":
        return createJsonResponse(
          {
            error:
              "Runtime-config mutations require a valid authenticated session.",
          },
          401,
        );
      case "AdminGovernanceMutationRequestContextMalformedError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
      case "AdminGovernanceReadUnauthenticatedActorError":
        return createJsonResponse(
          {
            error: "Admin governance reads require an authenticated operator.",
          },
          401,
        );
      case "AdminGovernanceReadAccessDeniedError":
        return createJsonResponse(
          {
            error:
              "Admin governance reads are restricted to platform and support operators.",
          },
          403,
        );
      case "AdminGovernanceUnauthenticatedActorError":
        return createJsonResponse(
          { error: "Runtime-config mutations require an authenticated actor." },
          401,
        );
      case "AdminGovernanceMutationAccessDeniedError":
        return createJsonResponse(
          {
            error:
              "Runtime-config mutations are restricted to platform and support operators.",
          },
          403,
        );
      case "ValkeyAdapterOperationError":
      case "PostgresAdapterConnectionError":
      case "RuntimeConfigPostgresRepositoryPersistenceError":
      case "AuditLogPostgresRepositoryPersistenceError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
      case "RuntimeConfigPersistenceNotConfiguredError":
        return createJsonResponse(
          { error: "Runtime-config persistence is not configured." },
          500,
        );
    }
  }

  return createJsonResponse({ error: "Admin governance request failed." }, 500);
};

const mapMutationRequestContextError = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminGovernanceRequestContextNotFoundError":
        return {
          _tag: "AdminGovernanceMutationRequestContextNotFoundError",
        } satisfies JsonRequestError;
      case "AdminGovernanceRequestContextMalformedError":
        return {
          _tag: "AdminGovernanceMutationRequestContextMalformedError",
        } satisfies JsonRequestError;
    }
  }

  return error;
};

type AdminGovernanceRequestContext = Parameters<
  AdminGovernanceService["listRuntimeConfigOverrides"]
>[0]["requestContext"];

const withResolvedAdminGovernanceRequestContext = <A, E>(input: {
  readonly service: AdminGovernanceService;
  readonly sessionId: string;
  readonly use: (
    requestContext: AdminGovernanceRequestContext,
  ) => Effect.Effect<A, E>;
  readonly mapError?: (error: unknown) => unknown;
}) => {
  const requestContextEffect = input.service.resolveRequestContext({
    sessionId: input.sessionId,
  });

  return (
    input.mapError === undefined
      ? requestContextEffect
      : requestContextEffect.pipe(Effect.mapError(input.mapError))
  ).pipe(Effect.flatMap(input.use));
};

export const createAdminGovernanceHttpHandler =
  (runWithService: AdminGovernanceServiceRunner) => (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods = adminGovernanceAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Admin governance route not found."),
      );
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (url.pathname) {
      case adminGovernanceApiPath.listRuntimeConfigOverrides:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "AdminGovernanceJsonInvalidError",
            decode: Schema.decodeUnknown(
              AdminGovernanceReadBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  use: (requestContext) =>
                    service.listRuntimeConfigOverrides({
                      requestContext,
                      moduleId: input.moduleId,
                    }),
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      case adminGovernanceApiPath.upsertRuntimeConfigOverride:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "AdminGovernanceJsonInvalidError",
            decode: Schema.decodeUnknown(
              UpsertRuntimeConfigOverrideRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  mapError: mapMutationRequestContextError,
                  use: (requestContext) =>
                    service.upsertRuntimeConfigOverride({
                      requestContext,
                      moduleId: input.moduleId,
                      key: input.key,
                      scope: input.scope,
                      scopeId: input.scopeId,
                      value: input.value,
                      approvalReason: input.approvalReason,
                    }),
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 202),
        });
      case adminGovernanceApiPath.persistRuntimeConfigProposals:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "AdminGovernanceJsonInvalidError",
            decode: Schema.decodeUnknown(
              PersistRuntimeConfigProposalsRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  mapError: mapMutationRequestContextError,
                  use: (requestContext) =>
                    service.persistRuntimeConfigProposals({
                      requestContext,
                      moduleId: input.moduleId,
                      renameMap: input.renameMap,
                    }),
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 202),
        });
      case adminGovernanceApiPath.listRuntimeConfigProposals:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "AdminGovernanceJsonInvalidError",
            decode: Schema.decodeUnknown(
              AdminGovernanceReadBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  use: (requestContext) =>
                    service.listRuntimeConfigProposals({
                      requestContext,
                      moduleId: input.moduleId,
                    }),
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      case adminGovernanceApiPath.queryAuditEventsByModule:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "AdminGovernanceJsonInvalidError",
            decode: Schema.decodeUnknown(
              AdminGovernanceReadBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  use: (requestContext) =>
                    service.queryAuditEventsByModule({
                      requestContext,
                      moduleId: input.moduleId,
                    }),
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Admin governance route not found."),
        );
    }
  };

export const handleAdminGovernanceHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminGovernanceHttpHandler((use) =>
    runAdminGovernanceFromEnvironment(environment, use),
  )(request);
