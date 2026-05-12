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
  createCachedWebhooksApiAccessServiceRunner,
  type CreateWebhookApiKeyBySessionRequest,
  CreateWebhookApiKeyBySessionRequestSchema,
  type CreateWebhookSubscriptionBySessionRequest,
  CreateWebhookSubscriptionBySessionRequestSchema,
  type ListWebhookApiKeysBySessionRequest,
  ListWebhookApiKeysBySessionRequestSchema,
  type ListWebhookSubscriptionsBySessionRequest,
  type RequestWebhookOutboundDeliveryBySessionRequest,
  RequestWebhookOutboundDeliveryBySessionRequestSchema,
  type RevokeWebhookApiKeyBySessionRequest,
  RevokeWebhookApiKeyBySessionRequestSchema,
  type RotateWebhookApiKeyBySessionRequest,
  RotateWebhookApiKeyBySessionRequestSchema,
  type WebhooksApiAccessRuntimeError,
  type WebhooksApiAccessService,
  ListWebhookSubscriptionsBySessionRequestSchema,
} from "./webhooks-api-access";

type AdminWebhooksApiAccessServiceRunner = <A, E>(
  use: (service: WebhooksApiAccessService) => Effect.Effect<A, E>,
) => Effect.Effect<
  A,
  E | ParseResult.ParseError | WebhooksApiAccessRuntimeError
>;

type JsonRequestErrorTag =
  | "AdminWebhooksApiAccessJsonInvalidError"
  | "AdminWebhooksApiAccessJsonRequestParseError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

const normalizeJsonRequestError = (
  error: JsonRequestError | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({ _tag: "AdminWebhooksApiAccessJsonRequestParseError" } as const)
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

const readAdminWebhooksApiAccessRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag:
      "AdminWebhooksApiAccessJsonInvalidError" satisfies JsonRequestErrorTag,
    decode: input.decode,
  }).pipe(
    Effect.mapError((cause) =>
      typeof cause === "object" &&
      cause !== null &&
      "_tag" in cause &&
      cause._tag === "ParseError"
        ? ({
            _tag: "AdminWebhooksApiAccessJsonRequestParseError",
          } satisfies JsonRequestError)
        : cause,
    ),
  );

const readAdminWebhooksApiAccessSessionBoundRequestJson = <
  A,
  R = never,
>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  Effect.all({
    payload: readAdminWebhooksApiAccessRequestJson({
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

export const adminWebhooksApiAccessApiBasePath =
  "/api/admin/communication/webhooks";

export const adminWebhooksApiAccessApiPath = {
  createApiKey: `${adminWebhooksApiAccessApiBasePath}/api-keys`,
  listApiKeys: `${adminWebhooksApiAccessApiBasePath}/api-keys/list`,
  rotateApiKey: `${adminWebhooksApiAccessApiBasePath}/api-keys/rotate`,
  revokeApiKey: `${adminWebhooksApiAccessApiBasePath}/api-keys/revoke`,
  requestDelivery: `${adminWebhooksApiAccessApiBasePath}/deliveries/request`,
  createSubscription: `${adminWebhooksApiAccessApiBasePath}/subscriptions`,
  listSubscriptions: `${adminWebhooksApiAccessApiBasePath}/subscriptions/list`,
} as const;

const adminWebhooksApiAccessAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [adminWebhooksApiAccessApiPath.createApiKey]: ["POST"],
  [adminWebhooksApiAccessApiPath.listApiKeys]: ["POST"],
  [adminWebhooksApiAccessApiPath.rotateApiKey]: ["POST"],
  [adminWebhooksApiAccessApiPath.revokeApiKey]: ["POST"],
  [adminWebhooksApiAccessApiPath.requestDelivery]: ["POST"],
  [adminWebhooksApiAccessApiPath.createSubscription]: ["POST"],
  [adminWebhooksApiAccessApiPath.listSubscriptions]: ["POST"],
};

const buildWebhookSubscriptionErrorResponse = (
  error: unknown,
): ReturnType<typeof createJsonResponse> => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminWebhooksApiAccessJsonInvalidError":
      case "AdminWebhooksApiAccessJsonRequestParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "ParseError":
        return createJsonResponse(
          { error: "Webhook subscription request failed." },
          500,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "WebhooksApiAccessUnauthenticatedActorError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "WebhooksApiAccessAccessDeniedError":
        return createJsonResponse(
          {
            error:
              "Webhook subscription management is not allowed for this session.",
          },
          403,
        );
      case "WebhooksApiAccessInternalContractError":
      case "WebhooksApiAccessProjectionConfigurationError":
        return createJsonResponse(
          { error: "Webhook subscription request failed." },
          500,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "WebhookSubscriptionPostgresRepositoryQueryError":
      case "ValkeyAdapterOperationError":
      case "WebhooksApiAccessRuntimeError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
      case "WebhookSubscriptionAlreadyExistsError":
        return createJsonResponse(
          {
            error:
              "Webhook subscription already exists for this scope and URL.",
          },
          409,
        );
    }
  }

  return createJsonResponse(
    { error: "Webhook subscription request failed." },
    500,
  );
};

const buildWebhookApiKeyErrorResponse = (
  error: unknown,
): ReturnType<typeof createJsonResponse> => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminWebhooksApiAccessJsonInvalidError":
      case "AdminWebhooksApiAccessJsonRequestParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "ParseError":
        return createJsonResponse(
          { error: "Webhook API key request failed." },
          500,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "WebhookApiKeyNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "WebhooksApiAccessUnauthenticatedActorError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "WebhooksApiAccessAccessDeniedError":
        return createJsonResponse(
          {
            error:
              "Webhook API key management is not allowed for this session.",
          },
          403,
        );
      case "WebhooksApiAccessInternalContractError":
      case "WebhooksApiAccessProjectionConfigurationError":
        return createJsonResponse(
          { error: "Webhook API key request failed." },
          500,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "ValkeyAdapterOperationError":
      case "WebhookApiKeyPostgresRepositoryQueryError":
      case "WebhooksApiAccessRuntimeError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
      case "WebhookApiKeyRevokedError":
        return createJsonResponse(
          {
            error: "Webhook API key has already been revoked.",
          },
          409,
        );
      case "WebhookApiKeyMutationConflictError":
        return createJsonResponse(
          {
            error:
              "Webhook API key changed during the request. Retry the operation.",
          },
          409,
        );
    }
  }

  return createJsonResponse({ error: "Webhook API key request failed." }, 500);
};

const buildWebhookDeliveryRequestErrorResponse = (
  error: unknown,
): ReturnType<typeof createJsonResponse> => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminWebhooksApiAccessJsonInvalidError":
      case "AdminWebhooksApiAccessJsonRequestParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "WebhooksApiAccessUnauthenticatedActorError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "WebhooksApiAccessAccessDeniedError":
        return createJsonResponse(
          {
            error:
              "Webhook delivery management is not allowed for this session.",
          },
          403,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "WebhookSubscriptionNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "WebhooksApiAccessSubscriptionPausedError":
        return createJsonResponse(
          {
            error: "Webhook subscription is paused and cannot deliver events.",
          },
          409,
        );
      case "WebhooksApiAccessSubscriptionEventNotAllowedError":
        return createJsonResponse(
          {
            error:
              "Webhook subscription does not allow deliveries for the requested event.",
          },
          409,
        );
      case "WebhooksApiAccessWorkflowUnavailableError":
        return createJsonResponse(
          { error: "Webhook delivery workflow is not available." },
          503,
        );
      case "ParseError":
      case "UnknownConfigKeyError":
      case "WebhooksApiAccessInternalContractError":
      case "WebhooksApiAccessProjectionConfigurationError":
        return createJsonResponse(
          { error: "Webhook delivery request failed." },
          500,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "ConvexAdapterRequestError":
      case "KeycloakAdapterRequestError":
      case "KeycloakPasswordGrantIdTokenMissingError":
      case "RuntimeConfigModulePersistenceError":
      case "ValkeyAdapterOperationError":
      case "WebhookSubscriptionPostgresRepositoryQueryError":
      case "WorkflowJobsPostgresRepositoryQueryError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }

  return createJsonResponse({ error: "Webhook delivery request failed." }, 500);
};

export const createAdminWebhooksApiAccessHttpHandler = (
  runWithService: AdminWebhooksApiAccessServiceRunner,
) => {
  return (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods =
      adminWebhooksApiAccessAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Webhook subscription route not found."),
      );
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (url.pathname) {
      case adminWebhooksApiAccessApiPath.createApiKey:
        return matchHttpEffect({
          effect: readAdminWebhooksApiAccessSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              CreateWebhookApiKeyBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: CreateWebhookApiKeyBySessionRequest) =>
              runWithService((service) => service.createWebhookApiKey(input)),
            ),
          ),
          onFailure: buildWebhookApiKeyErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 201),
        });
      case adminWebhooksApiAccessApiPath.listApiKeys:
        return matchHttpEffect({
          effect: readAdminWebhooksApiAccessSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              ListWebhookApiKeysBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: ListWebhookApiKeysBySessionRequest) =>
              runWithService((service) => service.listWebhookApiKeys(input)),
            ),
          ),
          onFailure: buildWebhookApiKeyErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminWebhooksApiAccessApiPath.rotateApiKey:
        return matchHttpEffect({
          effect: readAdminWebhooksApiAccessSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              RotateWebhookApiKeyBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: RotateWebhookApiKeyBySessionRequest) =>
              runWithService((service) => service.rotateWebhookApiKey(input)),
            ),
          ),
          onFailure: buildWebhookApiKeyErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminWebhooksApiAccessApiPath.revokeApiKey:
        return matchHttpEffect({
          effect: readAdminWebhooksApiAccessSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              RevokeWebhookApiKeyBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: RevokeWebhookApiKeyBySessionRequest) =>
              runWithService((service) => service.revokeWebhookApiKey(input)),
            ),
          ),
          onFailure: buildWebhookApiKeyErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case adminWebhooksApiAccessApiPath.requestDelivery:
        return matchHttpEffect({
          effect: readAdminWebhooksApiAccessSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              RequestWebhookOutboundDeliveryBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap(
              (input: RequestWebhookOutboundDeliveryBySessionRequest) =>
                runWithService((service) =>
                  service.requestWebhookOutboundDelivery(input),
                ),
            ),
          ),
          onFailure: buildWebhookDeliveryRequestErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 202),
        });
      case adminWebhooksApiAccessApiPath.createSubscription:
        return matchHttpEffect({
          effect: readAdminWebhooksApiAccessSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              CreateWebhookSubscriptionBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: CreateWebhookSubscriptionBySessionRequest) =>
              runWithService((service) =>
                service.createWebhookSubscription(input),
              ),
            ),
          ),
          onFailure: buildWebhookSubscriptionErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 201),
        });
      case adminWebhooksApiAccessApiPath.listSubscriptions:
        return matchHttpEffect({
          effect: readAdminWebhooksApiAccessSessionBoundRequestJson({
            request,
            decode: Schema.decodeUnknown(
              ListWebhookSubscriptionsBySessionRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((input: ListWebhookSubscriptionsBySessionRequest) =>
              runWithService((service) =>
                service.listWebhookSubscriptions(input),
              ),
            ),
          ),
          onFailure: buildWebhookSubscriptionErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Webhook subscription route not found."),
        );
    }
  };
};

export const createAdminWebhooksApiAccessRequestHandler = (
  environment: unknown,
) => {
  const runAdminWebhooksApiAccess =
    createCachedWebhooksApiAccessServiceRunner(environment);

  return createAdminWebhooksApiAccessHttpHandler((use) =>
    runAdminWebhooksApiAccess(use),
  );
};

export const handleAdminWebhooksApiAccessHttpRequest = (
  environment: unknown,
  request: Request,
) => createAdminWebhooksApiAccessRequestHandler(environment)(request);
