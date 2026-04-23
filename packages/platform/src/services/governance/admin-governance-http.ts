import { Effect, ParseResult, Schema } from "effect";
import {
  AdminGovernanceReadBySessionRequestSchema,
  type AdminGovernanceServiceError,
  type AdminGovernanceService,
  PersistRuntimeConfigProposalsRequestSchema,
  runAdminGovernanceFromEnvironment,
  UpsertRuntimeConfigOverrideRequestSchema,
} from "./admin-governance";

export type { AdminGovernanceService } from "./admin-governance";

type AdminGovernanceServiceRunner = <A, E>(
  use: (service: AdminGovernanceService) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | AdminGovernanceServiceError>;

type JsonRequestErrorTag =
  | "AdminGovernanceJsonInvalidError"
  | "AdminGovernanceJsonRequestParseError";

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

const createJsonResponse = (
  body: unknown,
  status = 200,
  headers?: HeadersInit,
) =>
  Response.json(body, {
    status,
    ...(headers !== undefined ? { headers } : {}),
  });

const parseRequestJson = (request: Request) =>
  Effect.tryPromise({
    try: () => request.json(),
    catch: () =>
      ({
        _tag: "AdminGovernanceJsonInvalidError",
      }) satisfies JsonRequestError,
  });

const readRequestJson = <A, R = never>(
  request: Request,
  decode: (payload: unknown) => Effect.Effect<A, ParseResult.ParseError, R>,
): Effect.Effect<A, JsonRequestError, R> =>
  parseRequestJson(request).pipe(
    Effect.flatMap((payload) =>
      decode(payload).pipe(
        Effect.mapError(
          () =>
            ({
              _tag: "AdminGovernanceJsonRequestParseError",
            }) satisfies JsonRequestError,
        ),
      ),
    ),
  );

const buildErrorResponse = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof error._tag === "string"
  ) {
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

const runRequest = <A, E>(
  effect: Effect.Effect<A, E>,
  onSuccess: (value: A) => Response,
) =>
  effect.pipe(
    Effect.match({
      onFailure: buildErrorResponse,
      onSuccess,
    }),
  );

const methodNotAllowedResponse = () =>
  createJsonResponse({ error: "Method not allowed." }, 405, {
    Allow: "POST",
  });

const notFoundResponse = () =>
  createJsonResponse({ error: "Admin governance route not found." }, 404);

export const createAdminGovernanceHttpHandler =
  (runWithService: AdminGovernanceServiceRunner) => (request: Request) => {
    const url = new URL(request.url);

    if (request.method !== "POST") {
      return Effect.succeed(
        url.pathname.startsWith(adminGovernanceApiBasePath)
          ? methodNotAllowedResponse()
          : notFoundResponse(),
      );
    }

    switch (url.pathname) {
      case adminGovernanceApiPath.listRuntimeConfigOverrides:
        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(AdminGovernanceReadBySessionRequestSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                service
                  .resolveRequestContext({
                    sessionId: input.sessionId,
                  })
                  .pipe(
                    Effect.flatMap((requestContext) =>
                      service.listRuntimeConfigOverrides({
                        requestContext,
                        moduleId: input.moduleId,
                      }),
                    ),
                  ),
              ),
            ),
          ),
          (result) => createJsonResponse(result),
        );
      case adminGovernanceApiPath.upsertRuntimeConfigOverride:
        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(UpsertRuntimeConfigOverrideRequestSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.upsertRuntimeConfigOverride(input),
              ),
            ),
          ),
          (result) => createJsonResponse(result, 202),
        );
      case adminGovernanceApiPath.persistRuntimeConfigProposals:
        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(PersistRuntimeConfigProposalsRequestSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.persistRuntimeConfigProposals(input),
              ),
            ),
          ),
          (result) => createJsonResponse(result, 202),
        );
      case adminGovernanceApiPath.listRuntimeConfigProposals:
        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(AdminGovernanceReadBySessionRequestSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                service
                  .resolveRequestContext({
                    sessionId: input.sessionId,
                  })
                  .pipe(
                    Effect.flatMap((requestContext) =>
                      service.listRuntimeConfigProposals({
                        requestContext,
                        moduleId: input.moduleId,
                      }),
                    ),
                  ),
              ),
            ),
          ),
          (result) => createJsonResponse(result),
        );
      case adminGovernanceApiPath.queryAuditEventsByModule:
        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(AdminGovernanceReadBySessionRequestSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                service
                  .resolveRequestContext({
                    sessionId: input.sessionId,
                  })
                  .pipe(
                    Effect.flatMap((requestContext) =>
                      service.queryAuditEventsByModule({
                        requestContext,
                        moduleId: input.moduleId,
                      }),
                    ),
                  ),
              ),
            ),
          ),
          (result) => createJsonResponse(result),
        );
      default:
        return Effect.succeed(notFoundResponse());
    }
  };

export const handleAdminGovernanceHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminGovernanceHttpHandler((use) =>
    runAdminGovernanceFromEnvironment(environment, use),
  )(request);
