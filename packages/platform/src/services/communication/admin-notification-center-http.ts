import { Effect, ParseResult, Schema } from "effect";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestJson,
} from "./http-transport";
import { extractRequiredSubscriberJourneySessionIdFromHeader } from "../access/request-context-transport";
import {
  type AdminNotificationCenterRuntimeError,
  type AdminNotificationCenterService,
  type InspectNotificationCenterEmailPreferenceBySessionRequest,
  InspectNotificationCenterEmailPreferenceBySessionRequestSchema,
  type InspectNotificationCenterEmailReceiptBySessionRequest,
  InspectNotificationCenterEmailReceiptBySessionRequestSchema,
  type InspectNotificationCenterInAppNotificationBySessionRequest,
  InspectNotificationCenterInAppNotificationBySessionRequestSchema,
  type UpsertNotificationCenterEmailPreferenceBySessionRequest,
  UpsertNotificationCenterEmailPreferenceBySessionRequestSchema,
  runAdminNotificationCenterFromEnvironment,
} from "./admin-notification-center";

type AdminNotificationCenterServiceRunner = <A, E>(
  use: (service: AdminNotificationCenterService) => Effect.Effect<A, E>,
) => Effect.Effect<
  A,
  E | ParseResult.ParseError | AdminNotificationCenterRuntimeError
>;

const runAdminNotificationCenter = <A, E>(
  environment: unknown,
  use: (service: AdminNotificationCenterService) => Effect.Effect<A, E>,
): Effect.Effect<
  A,
  E | ParseResult.ParseError | AdminNotificationCenterRuntimeError
> =>
  runAdminNotificationCenterFromEnvironment(environment, use) as Effect.Effect<
    A,
    E | ParseResult.ParseError | AdminNotificationCenterRuntimeError
  >;

type JsonRequestErrorTag =
  | "AdminNotificationCenterJsonInvalidError"
  | "AdminNotificationCenterJsonRequestParseError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

const normalizeJsonRequestError = (
  error: JsonRequestError | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({ _tag: "AdminNotificationCenterJsonRequestParseError" } as const)
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

const readAdminNotificationCenterRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag:
      "AdminNotificationCenterJsonInvalidError" satisfies JsonRequestErrorTag,
    decode: input.decode,
  }).pipe(
    Effect.mapError((cause) =>
      typeof cause === "object" &&
      cause !== null &&
      "_tag" in cause &&
      cause._tag === "ParseError"
        ? ({
            _tag: "AdminNotificationCenterJsonRequestParseError",
          } satisfies JsonRequestError)
        : cause,
    ),
  );

const readAdminNotificationCenterSessionBoundRequestJson = <
  A,
  R = never,
>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  Effect.all({
    payload: readAdminNotificationCenterRequestJson({
      request: input.request,
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

export const adminNotificationCenterApiBasePath =
  "/api/admin/communication/notification-center";

export const adminNotificationCenterApiPath = {
  inspectEmailReceipt: `${adminNotificationCenterApiBasePath}/email-receipts/inspect`,
  inspectInAppNotification: `${adminNotificationCenterApiBasePath}/in-app/inspect`,
  inspectEmailPreference: `${adminNotificationCenterApiBasePath}/email-preferences/inspect`,
  upsertEmailPreference: `${adminNotificationCenterApiBasePath}/email-preferences/upsert`,
} as const;

const adminNotificationCenterAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [adminNotificationCenterApiPath.inspectEmailReceipt]: ["POST"],
  [adminNotificationCenterApiPath.inspectInAppNotification]: ["POST"],
  [adminNotificationCenterApiPath.inspectEmailPreference]: ["POST"],
  [adminNotificationCenterApiPath.upsertEmailPreference]: ["POST"],
};

const buildErrorResponse = (
  error: unknown,
): ReturnType<typeof createJsonResponse> => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminNotificationCenterJsonInvalidError":
      case "AdminNotificationCenterJsonRequestParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "AdminNotificationCenterUnauthenticatedActorError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "ParseError":
      case "AdminNotificationCenterInternalContractError":
      case "AdminNotificationCenterProjectionConfigurationError":
        return createJsonResponse(
          { error: "Notification-center inspection request failed." },
          500,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "AdminNotificationCenterEmailReceiptNotFoundError":
      case "AdminNotificationCenterInAppNotificationNotFoundError":
      case "AdminNotificationCenterEmailPreferenceNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "AdminNotificationCenterAccessDeniedError":
        return createJsonResponse(
          {
            error:
              "Notification-center inspection is not allowed for this session.",
          },
          403,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "ConvexNotificationCenterInAppAdapterRequestError":
      case "KeycloakAdapterRequestError":
      case "KeycloakPasswordGrantIdTokenMissingError":
      case "NotificationCenterPostgresRepositoryQueryError":
      case "ValkeyAdapterOperationError":
      case "AdminNotificationCenterRuntimeError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }

  return createJsonResponse(
    { error: "Notification-center inspection request failed." },
    500,
  );
};

export const createAdminNotificationCenterHttpHandler = (
  runWithService: AdminNotificationCenterServiceRunner,
) => {
  return (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods =
      adminNotificationCenterAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Notification-center route not found."),
      );
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (url.pathname) {
      case adminNotificationCenterApiPath.inspectEmailReceipt:
        return matchHttpEffect({
          effect: readAdminNotificationCenterSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              InspectNotificationCenterEmailReceiptBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap(
              (input: InspectNotificationCenterEmailReceiptBySessionRequest) =>
                runWithService((service) => service.inspectEmailReceipt(input)),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminNotificationCenterApiPath.inspectInAppNotification:
        return matchHttpEffect({
          effect: readAdminNotificationCenterSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              InspectNotificationCenterInAppNotificationBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap(
              (
                input: InspectNotificationCenterInAppNotificationBySessionRequest,
              ) =>
                runWithService((service) =>
                  service.inspectInAppNotification(input),
                ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminNotificationCenterApiPath.inspectEmailPreference:
        return matchHttpEffect({
          effect: readAdminNotificationCenterSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              InspectNotificationCenterEmailPreferenceBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap(
              (
                input: InspectNotificationCenterEmailPreferenceBySessionRequest,
              ) =>
                runWithService((service) =>
                  service.inspectEmailPreference(input),
                ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminNotificationCenterApiPath.upsertEmailPreference:
        return matchHttpEffect({
          effect: readAdminNotificationCenterSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              UpsertNotificationCenterEmailPreferenceBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap(
              (
                input: UpsertNotificationCenterEmailPreferenceBySessionRequest,
              ) =>
                runWithService((service) =>
                  service.upsertEmailPreference(input),
                ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Notification-center route not found."),
        );
    }
  };
};

export const handleAdminNotificationCenterHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminNotificationCenterHttpHandler((use) =>
    runAdminNotificationCenter(environment, use),
  )(request);
