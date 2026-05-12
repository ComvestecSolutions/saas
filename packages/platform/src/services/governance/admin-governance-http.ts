import { Effect, ParseResult, Schema } from "effect";
import {
  AdminGovernanceAuthorizationInspectionViewSchema,
  AdminGovernanceExportAuditEventsRequestSchema,
  AdminGovernanceFeatureFlagViewListSchema,
  AdminGovernanceInspectAuthorizationRequestSchema,
  AdminGovernanceQueryAuditEventsByActorRequestSchema,
  AdminGovernanceQueryAuditEventsByTenantRequestSchema,
  AdminGovernanceQueryAuditEventsByTargetRequestSchema,
  AdminGovernanceReadBySessionRequestSchema,
  AdminGovernanceWriteAuthorizationTupleRequestSchema,
  AdminGovernanceWriteAuthorizationTupleResponseSchema,
  ReviewRuntimeConfigProposalRequestSchema,
  type AdminGovernanceServiceError,
  type AdminGovernanceService,
  PersistRuntimeConfigProposalsRequestSchema,
  runAdminGovernanceFromEnvironment,
  SubmitRuntimeConfigOverrideProposalRequestSchema,
} from "./admin-governance";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestJson,
} from "../communication/http-transport";
import { extractRequiredSubscriberJourneySessionIdFromHeader } from "../access/request-context-transport";

export type { AdminGovernanceService } from "./admin-governance";

type UnleashInitializationError = {
  readonly _tag: "UnleashAdapterInitializationError";
  readonly cause: unknown;
};

type AdminGovernanceHttpRuntimeError = {
  readonly _tag: "AdminGovernanceHttpRuntimeError";
  readonly cause: unknown;
};

type AdminGovernanceServiceRunner = <A, E>(
  use: (service: AdminGovernanceService) => Effect.Effect<A, E>,
) => Effect.Effect<
  A,
  E | AdminGovernanceServiceError | AdminGovernanceHttpRuntimeError
>;

const mapAdminGovernanceRuntimeError = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  Exclude<E, UnleashInitializationError> | AdminGovernanceHttpRuntimeError
> =>
  effect.pipe(
    Effect.mapError((cause) =>
      typeof cause === "object" &&
      cause !== null &&
      "_tag" in cause &&
      cause._tag === "UnleashAdapterInitializationError"
        ? ({
            _tag: "AdminGovernanceHttpRuntimeError",
            cause,
          } satisfies AdminGovernanceHttpRuntimeError)
        : (cause as Exclude<E, UnleashInitializationError>),
    ),
  ) as Effect.Effect<
    A,
    Exclude<E, UnleashInitializationError> | AdminGovernanceHttpRuntimeError
  >;

type JsonRequestErrorTag =
  | "AdminGovernanceJsonInvalidError"
  | "AdminGovernanceJsonRequestParseError"
  | "AdminGovernanceMutationRequestContextNotFoundError"
  | "AdminGovernanceMutationRequestContextMalformedError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

const readAdminGovernanceRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag: "AdminGovernanceJsonInvalidError",
    decode: input.decode,
  }).pipe(
    Effect.mapError((cause) =>
      typeof cause === "object" &&
      cause !== null &&
      "_tag" in cause &&
      cause._tag === "ParseError"
        ? ({
            _tag: "AdminGovernanceJsonRequestParseError",
          } satisfies JsonRequestError)
        : cause,
    ),
  );

const attachTrustedSessionIdToPayload = (input: {
  readonly payload: unknown;
  readonly sessionId: string;
}): unknown =>
  typeof input.payload === "object" &&
  input.payload !== null &&
  !Array.isArray(input.payload)
    ? {
        ...(input.payload as Record<string, unknown>),
        sessionId: input.sessionId,
      }
    : { sessionId: input.sessionId };

const readAdminGovernanceSessionBoundRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  Effect.all({
    payload: readRequestJson({
      request: input.request,
      invalidJsonTag: "AdminGovernanceJsonInvalidError",
      decode: (payload) => Effect.succeed(payload),
    }),
    sessionId: extractRequiredSubscriberJourneySessionIdFromHeader(
      input.request,
    ),
  }).pipe(
    Effect.flatMap(({ payload, sessionId }) =>
      input
        .decode(
          attachTrustedSessionIdToPayload({
            payload,
            sessionId,
          }),
        )
        .pipe(
          Effect.mapError(
            () =>
              ({
                _tag: "AdminGovernanceJsonRequestParseError",
              }) satisfies JsonRequestError,
          ),
        ),
    ),
  );

export const adminGovernanceApiBasePath = "/api/admin/governance";

export const adminGovernanceApiPath = {
  inspectAuthorization: `${adminGovernanceApiBasePath}/authorization/inspect`,
  writeAuthorizationTuple: `${adminGovernanceApiBasePath}/authorization/tuples/write`,
  listRuntimeConfigOverrides: `${adminGovernanceApiBasePath}/runtime-config/overrides/list`,
  listFeatureFlags: `${adminGovernanceApiBasePath}/feature-flags/list`,
  submitRuntimeConfigOverrideProposal: `${adminGovernanceApiBasePath}/runtime-config/override-proposals/submit`,
  persistRuntimeConfigProposals: `${adminGovernanceApiBasePath}/runtime-config/proposals/persist`,
  reviewRuntimeConfigProposal: `${adminGovernanceApiBasePath}/runtime-config/proposals/review`,
  listRuntimeConfigProposals: `${adminGovernanceApiBasePath}/runtime-config/proposals/list`,
  queryAuditEventsByModule: `${adminGovernanceApiBasePath}/audit-log/query-by-module`,
  queryAuditEventsByActor: `${adminGovernanceApiBasePath}/audit-log/query-by-actor`,
  queryAuditEventsByTenant: `${adminGovernanceApiBasePath}/audit-log/query-by-tenant`,
  queryAuditEventsByTarget: `${adminGovernanceApiBasePath}/audit-log/query-by-target`,
  exportAuditEvents: `${adminGovernanceApiBasePath}/audit-log/export`,
} as const;

const adminGovernanceAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [adminGovernanceApiPath.inspectAuthorization]: ["POST"],
  [adminGovernanceApiPath.writeAuthorizationTuple]: ["POST"],
  [adminGovernanceApiPath.listRuntimeConfigOverrides]: ["POST"],
  [adminGovernanceApiPath.listFeatureFlags]: ["POST"],
  [adminGovernanceApiPath.submitRuntimeConfigOverrideProposal]: ["POST"],
  [adminGovernanceApiPath.persistRuntimeConfigProposals]: ["POST"],
  [adminGovernanceApiPath.reviewRuntimeConfigProposal]: ["POST"],
  [adminGovernanceApiPath.listRuntimeConfigProposals]: ["POST"],
  [adminGovernanceApiPath.queryAuditEventsByModule]: ["POST"],
  [adminGovernanceApiPath.queryAuditEventsByActor]: ["POST"],
  [adminGovernanceApiPath.queryAuditEventsByTenant]: ["POST"],
  [adminGovernanceApiPath.queryAuditEventsByTarget]: ["POST"],
  [adminGovernanceApiPath.exportAuditEvents]: ["POST"],
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
      case "SubscriberJourneySessionIdMissingError":
        return createJsonResponse(
          {
            error:
              error._tag === "SubscriberJourneySessionIdMissingError"
                ? "Admin governance requests require a valid authenticated session."
                : "Request payload did not match the expected schema.",
          },
          error._tag === "SubscriberJourneySessionIdMissingError" ? 401 : 400,
        );
      case "ParseError":
        return createJsonResponse(
          { error: "Admin governance request failed." },
          500,
        );
      case "AdminGovernanceHttpRuntimeError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
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
              "Admin governance mutations require a valid authenticated session.",
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
            error:
              "Admin governance reads require a valid authenticated session.",
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
      case "AdminGovernanceAuditExportFilterError":
      case "AdminGovernanceRuntimeGovernedOverrideValidationError":
        return createJsonResponse(
          {
            error:
              "reason" in error
                ? String(error.reason)
                : "Runtime-governed override proposal was invalid.",
          },
          400,
        );
      case "AdminGovernanceUnauthenticatedActorError":
        return createJsonResponse(
          {
            error:
              "Admin governance mutations require a valid authenticated session.",
          },
          401,
        );
      case "AdminGovernanceMutationAccessDeniedError":
        return createJsonResponse(
          {
            error:
              "Admin governance mutations are restricted to platform and support operators.",
          },
          403,
        );
      case "AuthorizationDelegatedCheckError":
      case "BillingStatePostgresRepositoryQueryError":
      case "OryKetoAdapterRequestError":
      case "ValkeyAdapterOperationError":
      case "PostgresAdapterConnectionError":
      case "AdminGovernanceProposalPersistenceError":
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
      case "RuntimeConfigSyncArtifactNotFoundError":
      case "RuntimeConfigOverrideProposalNotFoundError":
        return createJsonResponse(
          { error: "Requested runtime-config proposal was not found." },
          404,
        );
      case "AdminGovernanceProposalReviewConflictError":
        return createJsonResponse(
          {
            error:
              "Runtime-config proposals can only be reviewed while pending.",
          },
          409,
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

const decodeAdminGovernanceAuthorizationInspectionView = Schema.decodeUnknown(
  AdminGovernanceAuthorizationInspectionViewSchema,
);

const decodeAdminGovernanceWriteAuthorizationTupleResponse =
  Schema.decodeUnknown(AdminGovernanceWriteAuthorizationTupleResponseSchema);

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
      case adminGovernanceApiPath.inspectAuthorization:
        return matchHttpEffect({
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              AdminGovernanceInspectAuthorizationRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  use: (requestContext) =>
                    service
                      .inspectAuthorization({
                        requestContext,
                        checkInput: input.checkInput,
                      })
                      .pipe(
                        Effect.flatMap((result) =>
                          decodeAdminGovernanceAuthorizationInspectionView(
                            result,
                          ).pipe(
                            Effect.mapError(
                              (cause) =>
                                ({
                                  _tag: "AdminGovernanceProjectedRecordParseError",
                                  recordType: "authorizationInspection",
                                  cause,
                                }) as const,
                            ),
                          ),
                        ),
                      ),
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      case adminGovernanceApiPath.writeAuthorizationTuple:
        return matchHttpEffect({
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              AdminGovernanceWriteAuthorizationTupleRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  mapError: mapMutationRequestContextError,
                  use: (requestContext) =>
                    service
                      .writeAuthorizationTuple({
                        requestContext,
                        tuple: input.tuple,
                        reason: input.reason,
                      })
                      .pipe(
                        Effect.flatMap((result) =>
                          decodeAdminGovernanceWriteAuthorizationTupleResponse(
                            result,
                          ).pipe(
                            Effect.mapError(
                              (cause) =>
                                ({
                                  _tag: "AdminGovernanceProjectedRecordParseError",
                                  recordType: "authorizationTupleMutation",
                                  cause,
                                }) as const,
                            ),
                          ),
                        ),
                      ),
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      case adminGovernanceApiPath.listRuntimeConfigOverrides:
        return matchHttpEffect({
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
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
      case adminGovernanceApiPath.listFeatureFlags:
        return matchHttpEffect({
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
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
                    service.listFeatureFlags({
                      requestContext,
                      moduleId: input.moduleId,
                    }),
                }),
              ),
            ),
            Effect.flatMap((result) =>
              Schema.decodeUnknown(AdminGovernanceFeatureFlagViewListSchema)(
                result,
              ).pipe(
                Effect.mapError(
                  (cause) =>
                    ({
                      _tag: "AdminGovernanceProjectedRecordParseError",
                      recordType: "featureFlag",
                      cause,
                    }) as const,
                ),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      case adminGovernanceApiPath.submitRuntimeConfigOverrideProposal:
        return matchHttpEffect({
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              SubmitRuntimeConfigOverrideProposalRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  mapError: mapMutationRequestContextError,
                  use: (requestContext) =>
                    service.submitRuntimeConfigOverrideProposal({
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
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
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
      case adminGovernanceApiPath.reviewRuntimeConfigProposal:
        return matchHttpEffect({
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              ReviewRuntimeConfigProposalRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  mapError: mapMutationRequestContextError,
                  use: (requestContext) =>
                    service.reviewRuntimeConfigProposal({
                      requestContext,
                      proposalId: input.proposalId,
                      status: input.status,
                      decisionReason: input.decisionReason,
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
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
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
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
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
      case adminGovernanceApiPath.queryAuditEventsByActor:
        return matchHttpEffect({
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              AdminGovernanceQueryAuditEventsByActorRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  use: (requestContext) =>
                    service.queryAuditEventsByActor({
                      requestContext,
                      actorId: input.actorId,
                    }),
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      case adminGovernanceApiPath.queryAuditEventsByTenant:
        return matchHttpEffect({
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              AdminGovernanceQueryAuditEventsByTenantRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  use: (requestContext) =>
                    service.queryAuditEventsByTenant({
                      requestContext,
                      tenantScope: input.tenantScope,
                      tenantScopeId: input.tenantScopeId,
                    }),
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      case adminGovernanceApiPath.queryAuditEventsByTarget:
        return matchHttpEffect({
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              AdminGovernanceQueryAuditEventsByTargetRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  use: (requestContext) =>
                    service.queryAuditEventsByTarget({
                      requestContext,
                      moduleId: input.moduleId,
                      target: input.target,
                    }),
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      case adminGovernanceApiPath.exportAuditEvents:
        return matchHttpEffect({
          effect: readAdminGovernanceSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              AdminGovernanceExportAuditEventsRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                withResolvedAdminGovernanceRequestContext({
                  service,
                  sessionId: input.sessionId,
                  use: (requestContext) =>
                    service.exportAuditEvents({
                      requestContext,
                      filter: input.filter,
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
    mapAdminGovernanceRuntimeError(
      runAdminGovernanceFromEnvironment(environment, use),
    ),
  )(request);
