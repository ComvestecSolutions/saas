import { Effect, ParseResult, Schema } from "effect";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestJson,
} from "../communication/http-transport";
import { extractRequiredSubscriberJourneySessionIdFromHeader } from "../access/request-context-transport";
import {
  type SupportOperationsInternalContractError,
  type SupportOperationsProjectionConfigurationError,
  type SupportOperationsRuntimeError,
  type SupportOperationsGetTenantHealthRequest,
  SupportOperationsGetTenantHealthRequestSchema,
  type SupportOperationsListCasesRequest,
  SupportOperationsListCasesRequestSchema,
  type SupportOperationsListImpersonationSessionsRequest,
  SupportOperationsListImpersonationSessionsRequestSchema,
  type SupportOperationsRevokeImpersonationSessionRequest,
  SupportOperationsRevokeImpersonationSessionRequestSchema,
  type SupportOperationsService,
  type SupportOperationsStartImpersonationRequest,
  SupportOperationsStartImpersonationRequestSchema,
  type SupportOperationsGrantBreakGlassRequest,
  SupportOperationsGrantBreakGlassRequestSchema,
  type SupportOperationsUpsertCaseRequest,
  SupportOperationsUpsertCaseRequestSchema,
  type SupportOperationsListBreakGlassIncidentsRequest,
  SupportOperationsListBreakGlassIncidentsRequestSchema,
  type SupportOperationsReviewBreakGlassIncidentRequest,
  SupportOperationsReviewBreakGlassIncidentRequestSchema,
  runSupportOperationsFromEnvironment,
} from "./support-operations";

type AdminSupportOperationsServiceRunner = <A, E>(
  use: (service: SupportOperationsService) => Effect.Effect<A, E>,
) => Effect.Effect<
  A,
  | E
  | ParseResult.ParseError
  | SupportOperationsInternalContractError
  | SupportOperationsProjectionConfigurationError
  | SupportOperationsRuntimeError
>;

type JsonRequestErrorTag =
  | "AdminSupportOperationsJsonInvalidError"
  | "AdminSupportOperationsJsonRequestParseError";

const normalizeJsonRequestError = (
  error: { readonly _tag: JsonRequestErrorTag } | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({ _tag: "AdminSupportOperationsJsonRequestParseError" } as const)
    : error;

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

const readAdminSupportOperationsSessionBoundRequestJson = <
  A,
  R = never,
>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  Effect.all({
    payload: readRequestJson({
      request: input.request,
      invalidJsonTag:
        "AdminSupportOperationsJsonInvalidError" as JsonRequestErrorTag,
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
        .pipe(Effect.mapError(normalizeJsonRequestError)),
    ),
  );

export const adminSupportOperationsApiBasePath =
  "/api/admin/governance/support-operations";

export const adminSupportOperationsApiPath = {
  tenantHealth: `${adminSupportOperationsApiBasePath}/tenants/health`,
  upsertCase: `${adminSupportOperationsApiBasePath}/cases/upsert`,
  listCases: `${adminSupportOperationsApiBasePath}/cases/list`,
  startImpersonation: `${adminSupportOperationsApiBasePath}/impersonation/start`,
  listImpersonationSessions: `${adminSupportOperationsApiBasePath}/impersonation/sessions/list`,
  revokeImpersonationSession: `${adminSupportOperationsApiBasePath}/impersonation/sessions/revoke`,
  grantBreakGlass: `${adminSupportOperationsApiBasePath}/break-glass/grants`,
  listBreakGlassIncidents: `${adminSupportOperationsApiBasePath}/break-glass/incidents/list`,
  reviewBreakGlassIncident: `${adminSupportOperationsApiBasePath}/break-glass/incidents/reviews`,
} as const;

const adminSupportOperationsAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [adminSupportOperationsApiPath.tenantHealth]: ["POST"],
  [adminSupportOperationsApiPath.upsertCase]: ["POST"],
  [adminSupportOperationsApiPath.listCases]: ["POST"],
  [adminSupportOperationsApiPath.startImpersonation]: ["POST"],
  [adminSupportOperationsApiPath.listImpersonationSessions]: ["POST"],
  [adminSupportOperationsApiPath.revokeImpersonationSession]: ["POST"],
  [adminSupportOperationsApiPath.grantBreakGlass]: ["POST"],
  [adminSupportOperationsApiPath.listBreakGlassIncidents]: ["POST"],
  [adminSupportOperationsApiPath.reviewBreakGlassIncident]: ["POST"],
};

const buildErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminSupportOperationsJsonInvalidError":
      case "AdminSupportOperationsJsonRequestParseError":
      case "InvalidBreakGlassExpiryError":
      case "InvalidImpersonationDurationError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "SupportOperationsBreakGlassIncidentNotFoundError":
      case "SupportOperationsImpersonationSessionNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "SupportOperationsApprovalActorMissingError":
      case "SupportOperationsReadUnauthenticatedActorError":
      case "SubscriberJourneySessionIdMissingError":
      case "UnauthenticatedBreakGlassActorError":
      case "UnauthenticatedImpersonationActorError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "SupportOperationsReadAccessDeniedError":
      case "UnsupportedSupportActorError":
        return createJsonResponse(
          { error: "Support operations are not allowed for this session." },
          403,
        );
      case "BreakGlassIncidentAlreadyReviewedError":
        return createJsonResponse(
          { error: "Break-glass incident has already been reviewed." },
          409,
        );
      case "SupportOperationsImpersonationSessionNoLongerActiveError":
        return createJsonResponse(
          { error: "Impersonation session is no longer active." },
          409,
        );
      case "SupportOperationsImpersonationSessionAlreadyRevokedError":
        return createJsonResponse(
          { error: "Impersonation session has already been revoked." },
          409,
        );
      case "SupportOperationsInternalContractError":
      case "SupportOperationsProjectionConfigurationError":
        return createJsonResponse(
          { error: "Support operations request failed." },
          500,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "KeycloakAdapterRequestError":
      case "KeycloakSessionInactiveError":
      case "KeycloakSessionIdentifierMissingError":
      case "KeycloakImpersonationIdTokenMissingError":
      case "KeycloakImpersonationActorMismatchError":
      case "KeycloakImpersonationCleanupUnavailableError":
      case "KeycloakImpersonationCompensationError":
      case "ImpersonationActorTypeMissingError":
      case "ImpersonationTenantHintMissingError":
      case "SupportImpersonationGrantCleanupError":
      case "SupportOperationsImpersonationCompensationError":
      case "SupportOperationsImpersonationRevocationCompensationError":
      case "SupportOperationsCasePostgresRepositoryQueryError":
      case "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError":
      case "SupportOperationsImpersonationSessionPostgresRepositoryQueryError":
      case "WorkflowJobsPostgresRepositoryQueryError":
      case "PostgresAdapterConnectionError":
      case "ValkeyAdapterOperationError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }

  return createJsonResponse(
    { error: "Support operations request failed." },
    500,
  );
};

export const createAdminSupportOperationsHttpHandler = (
  runWithService: AdminSupportOperationsServiceRunner,
) => {
  return (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods =
      adminSupportOperationsAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Support operations route not found."),
      );
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (url.pathname) {
      case adminSupportOperationsApiPath.tenantHealth:
        return matchHttpEffect({
          effect: readAdminSupportOperationsSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              SupportOperationsGetTenantHealthRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: SupportOperationsGetTenantHealthRequest) =>
              runWithService((service) => service.getTenantHealth(input)),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminSupportOperationsApiPath.upsertCase:
        return matchHttpEffect({
          effect: readAdminSupportOperationsSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              SupportOperationsUpsertCaseRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: SupportOperationsUpsertCaseRequest) =>
              runWithService((service) => service.upsertCase(input)),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminSupportOperationsApiPath.listCases:
        return matchHttpEffect({
          effect: readAdminSupportOperationsSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              SupportOperationsListCasesRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: SupportOperationsListCasesRequest) =>
              runWithService((service) => service.listCases(input)),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminSupportOperationsApiPath.startImpersonation:
        return matchHttpEffect({
          effect: readAdminSupportOperationsSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              SupportOperationsStartImpersonationRequestSchema,
            ),
          }).pipe(
            Effect.flatMap(
              (input: SupportOperationsStartImpersonationRequest) =>
                runWithService((service) => service.startImpersonation(input)),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 201),
        });
      case adminSupportOperationsApiPath.listImpersonationSessions:
        return matchHttpEffect({
          effect: readAdminSupportOperationsSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              SupportOperationsListImpersonationSessionsRequestSchema,
            ),
          }).pipe(
            Effect.flatMap(
              (input: SupportOperationsListImpersonationSessionsRequest) =>
                runWithService((service) =>
                  service.listImpersonationSessions(input),
                ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminSupportOperationsApiPath.revokeImpersonationSession:
        return matchHttpEffect({
          effect: readAdminSupportOperationsSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              SupportOperationsRevokeImpersonationSessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap(
              (input: SupportOperationsRevokeImpersonationSessionRequest) =>
                runWithService((service) =>
                  service.revokeImpersonationSession(input),
                ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminSupportOperationsApiPath.grantBreakGlass:
        return matchHttpEffect({
          effect: readAdminSupportOperationsSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              SupportOperationsGrantBreakGlassRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: SupportOperationsGrantBreakGlassRequest) =>
              runWithService((service) => service.grantBreakGlassAccess(input)),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 201),
        });
      case adminSupportOperationsApiPath.listBreakGlassIncidents:
        return matchHttpEffect({
          effect: readAdminSupportOperationsSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              SupportOperationsListBreakGlassIncidentsRequestSchema,
            ),
          }).pipe(
            Effect.flatMap(
              (input: SupportOperationsListBreakGlassIncidentsRequest) =>
                runWithService((service) =>
                  service.listBreakGlassIncidents(input),
                ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminSupportOperationsApiPath.reviewBreakGlassIncident:
        return matchHttpEffect({
          effect: readAdminSupportOperationsSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              SupportOperationsReviewBreakGlassIncidentRequestSchema,
            ),
          }).pipe(
            Effect.flatMap(
              (input: SupportOperationsReviewBreakGlassIncidentRequest) =>
                runWithService((service) =>
                  service.reviewBreakGlassIncident(input),
                ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Support operations route not found."),
        );
    }
  };
};

export const handleAdminSupportOperationsHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminSupportOperationsHttpHandler((use) =>
    runSupportOperationsFromEnvironment(environment, use),
  )(request);
