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
  type AdminEmailDeliveryRuntimeError,
  type AdminEmailDeliveryService,
  type InspectEmailDeliveryTrackingBySessionRequest,
  InspectEmailDeliveryTrackingBySessionRequestSchema,
  type InspectEmailRecipientSuppressionBySessionRequest,
  InspectEmailRecipientSuppressionBySessionRequestSchema,
  runAdminEmailDeliveryFromEnvironment,
} from "./admin-email-delivery";

type AdminEmailDeliveryServiceRunner = <A, E>(
  use: (service: AdminEmailDeliveryService) => Effect.Effect<A, E>,
) => Effect.Effect<
  A,
  E | ParseResult.ParseError | AdminEmailDeliveryRuntimeError
>;

const runAdminEmailDelivery = <A, E>(
  environment: unknown,
  use: (service: AdminEmailDeliveryService) => Effect.Effect<A, E>,
): Effect.Effect<
  A,
  E | ParseResult.ParseError | AdminEmailDeliveryRuntimeError
> =>
  runAdminEmailDeliveryFromEnvironment(environment, use) as Effect.Effect<
    A,
    E | ParseResult.ParseError | AdminEmailDeliveryRuntimeError
  >;

type JsonRequestErrorTag =
  | "AdminEmailDeliveryJsonInvalidError"
  | "AdminEmailDeliveryJsonRequestParseError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

const normalizeJsonRequestError = (
  error: JsonRequestError | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({ _tag: "AdminEmailDeliveryJsonRequestParseError" } as const)
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

const readAdminEmailDeliveryRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag:
      "AdminEmailDeliveryJsonInvalidError" satisfies JsonRequestErrorTag,
    decode: input.decode,
  }).pipe(
    Effect.mapError((cause) =>
      typeof cause === "object" &&
      cause !== null &&
      "_tag" in cause &&
      cause._tag === "ParseError"
        ? ({
            _tag: "AdminEmailDeliveryJsonRequestParseError",
          } satisfies JsonRequestError)
        : cause,
    ),
  );

const readAdminEmailDeliverySessionBoundRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  Effect.all({
    payload: readAdminEmailDeliveryRequestJson({
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

export const adminEmailDeliveryApiBasePath =
  "/api/admin/communication/email-delivery";

export const adminEmailDeliveryApiPath = {
  inspectTracking: `${adminEmailDeliveryApiBasePath}/tracking`,
  inspectRecipientSuppression: `${adminEmailDeliveryApiBasePath}/suppressions/lookup`,
} as const;

const adminEmailDeliveryAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [adminEmailDeliveryApiPath.inspectTracking]: ["POST"],
  [adminEmailDeliveryApiPath.inspectRecipientSuppression]: ["POST"],
};

const buildErrorResponse = (
  error: unknown,
): ReturnType<typeof createJsonResponse> => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminEmailDeliveryJsonInvalidError":
      case "AdminEmailDeliveryJsonRequestParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "AdminEmailDeliveryUnauthenticatedActorError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "ParseError":
      case "AdminEmailDeliveryInternalContractError":
      case "AdminEmailDeliveryProjectionConfigurationError":
      case "AdminEmailDeliveryDataIntegrityError":
        return createJsonResponse(
          { error: "Email delivery inspection request failed." },
          500,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "AdminEmailDeliveryTrackingNotFoundError":
      case "AdminEmailRecipientSuppressionNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "AdminEmailDeliveryAccessDeniedError":
        return createJsonResponse(
          {
            error: "Email delivery inspection is not allowed for this session.",
          },
          403,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "EmailDeliveryPostgresRepositoryQueryError":
      case "ValkeyAdapterOperationError":
      case "AdminEmailDeliveryRuntimeError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }

  return createJsonResponse(
    { error: "Email delivery inspection request failed." },
    500,
  );
};

export const createAdminEmailDeliveryHttpHandler = (
  runWithService: AdminEmailDeliveryServiceRunner,
) => {
  return (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods = adminEmailDeliveryAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Email delivery route not found."),
      );
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (url.pathname) {
      case adminEmailDeliveryApiPath.inspectTracking:
        return matchHttpEffect({
          effect: readAdminEmailDeliverySessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              InspectEmailDeliveryTrackingBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap(
              (input: InspectEmailDeliveryTrackingBySessionRequest) =>
                runWithService((service) =>
                  service.inspectTrackedDelivery(input),
                ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminEmailDeliveryApiPath.inspectRecipientSuppression:
        return matchHttpEffect({
          effect: readAdminEmailDeliverySessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              InspectEmailRecipientSuppressionBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap(
              (input: InspectEmailRecipientSuppressionBySessionRequest) =>
                runWithService((service) =>
                  service.inspectRecipientSuppression(input),
                ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Email delivery route not found."),
        );
    }
  };
};

export const handleAdminEmailDeliveryHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminEmailDeliveryHttpHandler((use) =>
    runAdminEmailDelivery(environment, use),
  )(request);
