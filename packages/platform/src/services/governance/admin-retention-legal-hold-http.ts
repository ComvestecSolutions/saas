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
  type ListRetentionLegalHoldsBySessionRequest,
  ListRetentionLegalHoldsBySessionRequestSchema,
  type ListRetentionPoliciesBySessionRequest,
  ListRetentionPoliciesBySessionRequestSchema,
  type PlaceRetentionLegalHoldBySessionRequest,
  PlaceRetentionLegalHoldBySessionRequestSchema,
  type ReleaseRetentionLegalHoldBySessionRequest,
  ReleaseRetentionLegalHoldBySessionRequestSchema,
  type RetentionLegalHoldProjectionConfigurationError,
  type RetentionLegalHoldRuntimeError,
  type RetentionLegalHoldService,
  runRetentionLegalHoldFromEnvironment,
  type UpsertRetentionPolicyBySessionRequest,
  UpsertRetentionPolicyBySessionRequestSchema,
} from "./retention-legal-hold";

type AdminRetentionLegalHoldServiceRunner = <A, E>(
  use: (service: RetentionLegalHoldService) => Effect.Effect<A, E>,
) => Effect.Effect<
  A,
  | E
  | ParseResult.ParseError
  | RetentionLegalHoldProjectionConfigurationError
  | RetentionLegalHoldRuntimeError
>;

type JsonRequestErrorTag =
  | "AdminRetentionLegalHoldJsonInvalidError"
  | "AdminRetentionLegalHoldJsonRequestParseError";

export const adminRetentionLegalHoldApiBasePath =
  "/api/admin/governance/retention";

export const adminRetentionLegalHoldApiPath = {
  upsertPolicy: `${adminRetentionLegalHoldApiBasePath}/policies`,
  listPolicies: `${adminRetentionLegalHoldApiBasePath}/policies/list`,
  placeLegalHold: `${adminRetentionLegalHoldApiBasePath}/holds`,
  listLegalHolds: `${adminRetentionLegalHoldApiBasePath}/holds/list`,
  releaseLegalHold: `${adminRetentionLegalHoldApiBasePath}/holds/releases`,
} as const;

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

const readAdminRetentionLegalHoldSessionBoundRequestJson = <
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
        "AdminRetentionLegalHoldJsonInvalidError" as JsonRequestErrorTag,
      decode: (payload) => Effect.succeed(payload),
    }),
    sessionId: extractRequiredSubscriberJourneySessionIdFromHeader(
      input.request,
    ),
  }).pipe(
    Effect.flatMap(({ payload, sessionId }) =>
      input.decode(
        attachTrustedSessionIdToPayload({
          payload,
          sessionId,
        }),
      ),
    ),
  );

const adminRetentionLegalHoldAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [adminRetentionLegalHoldApiPath.upsertPolicy]: ["POST"],
  [adminRetentionLegalHoldApiPath.listPolicies]: ["POST"],
  [adminRetentionLegalHoldApiPath.placeLegalHold]: ["POST"],
  [adminRetentionLegalHoldApiPath.listLegalHolds]: ["POST"],
  [adminRetentionLegalHoldApiPath.releaseLegalHold]: ["POST"],
};

const buildErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminRetentionLegalHoldJsonInvalidError":
      case "AdminRetentionLegalHoldJsonRequestParseError":
      case "ParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "RetentionLegalHoldNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "RetentionLegalHoldUnauthenticatedActorError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "RetentionLegalHoldAccessDeniedError":
        return createJsonResponse(
          {
            error: "Retention management is not allowed for this session.",
          },
          403,
        );
      case "RetentionLegalHoldAlreadyExistsError":
        return createJsonResponse(
          {
            error:
              "Legal hold already exists for this scope, data type, and target.",
          },
          409,
        );
      case "RetentionLegalHoldReleaseUnavailableError":
        return createJsonResponse(
          {
            error: "Legal hold is no longer eligible for release.",
          },
          409,
        );
      case "RetentionLegalHoldInternalContractError":
      case "RetentionLegalHoldProjectionConfigurationError":
        return createJsonResponse(
          { error: "Retention management request failed." },
          500,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "RetentionLegalHoldPostgresRepositoryQueryError":
      case "RetentionLegalHoldRuntimeError":
      case "ValkeyAdapterOperationError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }

  return createJsonResponse(
    { error: "Retention management request failed." },
    500,
  );
};

export const createAdminRetentionLegalHoldHttpHandler = (
  runWithService: AdminRetentionLegalHoldServiceRunner,
) => {
  return (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods =
      adminRetentionLegalHoldAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Retention management route not found."),
      );
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (url.pathname) {
      case adminRetentionLegalHoldApiPath.upsertPolicy:
        return matchHttpEffect({
          effect: readAdminRetentionLegalHoldSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              UpsertRetentionPolicyBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: UpsertRetentionPolicyBySessionRequest) =>
              runWithService((service) => service.upsertRetentionPolicy(input)),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminRetentionLegalHoldApiPath.listPolicies:
        return matchHttpEffect({
          effect: readAdminRetentionLegalHoldSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              ListRetentionPoliciesBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: ListRetentionPoliciesBySessionRequest) =>
              runWithService((service) => service.listRetentionPolicies(input)),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminRetentionLegalHoldApiPath.placeLegalHold:
        return matchHttpEffect({
          effect: readAdminRetentionLegalHoldSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              PlaceRetentionLegalHoldBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: PlaceRetentionLegalHoldBySessionRequest) =>
              runWithService((service) =>
                service.placeRetentionLegalHold(input),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 201),
        });
      case adminRetentionLegalHoldApiPath.listLegalHolds:
        return matchHttpEffect({
          effect: readAdminRetentionLegalHoldSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              ListRetentionLegalHoldsBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: ListRetentionLegalHoldsBySessionRequest) =>
              runWithService((service) =>
                service.listRetentionLegalHolds(input),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminRetentionLegalHoldApiPath.releaseLegalHold:
        return matchHttpEffect({
          effect: readAdminRetentionLegalHoldSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              ReleaseRetentionLegalHoldBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: ReleaseRetentionLegalHoldBySessionRequest) =>
              runWithService((service) =>
                service.releaseRetentionLegalHold(input),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Retention management route not found."),
        );
    }
  };
};

export const handleAdminRetentionLegalHoldHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminRetentionLegalHoldHttpHandler((use) =>
    runRetentionLegalHoldFromEnvironment(environment, use),
  )(request);
