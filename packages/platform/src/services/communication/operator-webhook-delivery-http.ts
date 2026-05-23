import { Effect, Option, ParseResult, Schema } from "effect";
import {
  OperatorWebhookDeliveryCancelInputSchema,
  OperatorWebhookDeliveryEnqueueInputSchema,
  OperatorWebhookDeliveryListFilterSchema,
  OperatorWebhookDeliveryReplayInputSchema,
  OperatorWebhookDeliveryRetryInputSchema,
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
  type OperatorWebhookDeliveryRuntimeError,
  type OperatorWebhookDeliveryServiceImpl,
  runOperatorWebhookDeliveryFromEnvironment,
} from "./operator-webhook-delivery-service";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestJson,
} from "./http-transport";

// ---------------------------------------------------------------------------
// Path table (local — registry advertises only owned endpoints)
// ---------------------------------------------------------------------------

export const operatorWebhookDeliveryApiBasePath =
  "/api/operator-webhook-delivery";

export const operatorWebhookDeliveryApiPath = {
  enqueue: `${operatorWebhookDeliveryApiBasePath}/deliveries`,
  list: `${operatorWebhookDeliveryApiBasePath}/deliveries`,
  get: `${operatorWebhookDeliveryApiBasePath}/deliveries/:id`,
  replay: `${operatorWebhookDeliveryApiBasePath}/deliveries/:id/replay`,
  retry: `${operatorWebhookDeliveryApiBasePath}/deliveries/:id/retry`,
  cancel: `${operatorWebhookDeliveryApiBasePath}/deliveries/:id/cancel`,
  recomputeSignature: `${operatorWebhookDeliveryApiBasePath}/deliveries/:id/recompute-signature`,
} as const;

const deliveriesPath = `${operatorWebhookDeliveryApiBasePath}/deliveries`;
const deliveriesPathPrefix = `${deliveriesPath}/`;
const replaySuffix = "/replay";
const retrySuffix = "/retry";
const cancelSuffix = "/cancel";
const recomputeSignatureSuffix = "/recompute-signature";

type OperatorWebhookDeliveryRouteMatch =
  | { readonly kind: "enqueue" }
  | { readonly kind: "list" }
  | { readonly kind: "get"; readonly deliveryId: string }
  | { readonly kind: "replay"; readonly deliveryId: string }
  | { readonly kind: "retry"; readonly deliveryId: string }
  | { readonly kind: "cancel"; readonly deliveryId: string }
  | { readonly kind: "recomputeSignature"; readonly deliveryId: string };

const matchSuffix = (pathname: string, suffix: string): string | undefined => {
  if (
    !pathname.startsWith(deliveriesPathPrefix) ||
    !pathname.endsWith(suffix)
  ) {
    return undefined;
  }
  const id = pathname.slice(
    deliveriesPathPrefix.length,
    pathname.length - suffix.length,
  );
  if (id.length === 0 || id.includes("/")) return undefined;
  return id;
};

const matchOperatorWebhookDeliveryRoute = (
  pathname: string,
  method: string,
): OperatorWebhookDeliveryRouteMatch | undefined => {
  if (pathname === deliveriesPath) {
    if (method === "POST") return { kind: "enqueue" };
    return { kind: "list" };
  }
  const replayId = matchSuffix(pathname, replaySuffix);
  if (replayId !== undefined) return { kind: "replay", deliveryId: replayId };
  const retryId = matchSuffix(pathname, retrySuffix);
  if (retryId !== undefined) return { kind: "retry", deliveryId: retryId };
  const cancelId = matchSuffix(pathname, cancelSuffix);
  if (cancelId !== undefined) return { kind: "cancel", deliveryId: cancelId };
  const recomputeId = matchSuffix(pathname, recomputeSignatureSuffix);
  if (recomputeId !== undefined)
    return { kind: "recomputeSignature", deliveryId: recomputeId };
  if (
    pathname.startsWith(deliveriesPathPrefix) &&
    !pathname.slice(deliveriesPathPrefix.length).includes("/")
  ) {
    const deliveryId = pathname.slice(deliveriesPathPrefix.length);
    if (deliveryId.length > 0) return { kind: "get", deliveryId };
  }
  return undefined;
};

const methodForRoute = (
  match: OperatorWebhookDeliveryRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "enqueue":
      return ["POST"];
    case "list":
      return ["GET"];
    case "get":
      return ["GET"];
    case "replay":
      return ["POST"];
    case "retry":
      return ["POST"];
    case "cancel":
      return ["POST"];
    case "recomputeSignature":
      return ["POST"];
  }
};

// ---------------------------------------------------------------------------
// JSON body decode helpers
// ---------------------------------------------------------------------------

type JsonRequestErrorTag =
  | "OperatorWebhookDeliveryJsonInvalidError"
  | "OperatorWebhookDeliveryJsonRequestParseError";

type JsonRequestError = { readonly _tag: JsonRequestErrorTag };

const normalizeJsonRequestError = (
  error: JsonRequestError | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({
        _tag: "OperatorWebhookDeliveryJsonRequestParseError",
      } satisfies JsonRequestError)
    : error;

const readOperatorWebhookDeliveryRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag:
      "OperatorWebhookDeliveryJsonInvalidError" satisfies JsonRequestErrorTag,
    decode: input.decode,
  }).pipe(Effect.mapError(normalizeJsonRequestError));

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const OperatorWebhookDeliveryHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeOperatorWebhookDeliveryHttpEnvironment = Schema.decodeUnknown(
  OperatorWebhookDeliveryHttpEnvironmentSchema,
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
      yield* decodeOperatorWebhookDeliveryHttpEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

// ---------------------------------------------------------------------------
// Per-route input schemas
// ---------------------------------------------------------------------------

const EnqueueBodySchema = OperatorWebhookDeliveryEnqueueInputSchema;

// Body schemas for the action endpoints (id is taken from URL).
const ReplayBodySchema = Schema.Struct({
  replayReasonCatalogId: Schema.NonEmptyString,
  reasonAttachmentText: Schema.NonEmptyString,
});
const RetryBodySchema = Schema.Struct({
  retryReasonCatalogId: Schema.NonEmptyString,
});
const CancelBodySchema = Schema.Struct({
  cancelReasonCatalogId: Schema.NonEmptyString,
});

const ListQuerySchema = OperatorWebhookDeliveryListFilterSchema;

const decodeEnqueueBody = Schema.decodeUnknown(EnqueueBodySchema);
const decodeReplayBody = Schema.decodeUnknown(ReplayBodySchema);
const decodeRetryBody = Schema.decodeUnknown(RetryBodySchema);
const decodeCancelBody = Schema.decodeUnknown(CancelBodySchema);
const decodeListQuery = Schema.decodeUnknown(ListQuerySchema);
const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// Sanity assertions: keep the action input schemas aligned with the
// contract input schemas (body shape + id from URL).
type _ReplayCheck = Schema.Schema.Type<
  typeof OperatorWebhookDeliveryReplayInputSchema
>;
type _RetryCheck = Schema.Schema.Type<
  typeof OperatorWebhookDeliveryRetryInputSchema
>;
type _CancelCheck = Schema.Schema.Type<
  typeof OperatorWebhookDeliveryCancelInputSchema
>;

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "OperatorWebhookDeliveryJsonInvalidError":
      case "OperatorWebhookDeliveryJsonRequestParseError":
      case "ParseError":
      case "OperatorWebhookDeliveryReasonNotInCatalog":
      case "OperatorWebhookDeliveryReasonActionMismatch":
      case "OperatorWebhookDeliveryReasonAttachmentRequired":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "OperatorWebhookDeliveryUnauthorized":
      case "OperatorWebhookDeliveryMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "OperatorWebhookDeliveryNotFound":
      case "OperatorWebhookDeliveryNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "OperatorWebhookDeliveryReplayGuardHit":
      case "OperatorWebhookDeliveryAlreadyTerminalError":
        return createJsonResponse(
          { error: "Operator webhook delivery invariant violation." },
          409,
        );
      case "OperatorWebhookDeliveryAttemptBudgetExceeded":
        return createJsonResponse(
          { error: "Operator webhook delivery attempt budget exhausted." },
          422,
        );
      case "OperatorWebhookDeliverySignatureRecomputeStale":
        return createJsonResponse(
          { error: "Stored signature is past its freshness window." },
          410,
        );
      case "OperatorWebhookDeliverySubscriptionSecretError":
        return createJsonResponse(
          { error: "Subscription secret resolution failed." },
          500,
        );
    }
  }
  return createJsonResponse(
    { error: "Operator webhook delivery request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type OperatorWebhookDeliveryServiceRunner = <A, E>(
  use: (service: OperatorWebhookDeliveryServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | OperatorWebhookDeliveryRuntimeError>;

type OperatorWebhookDeliveryRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam — accepts an injected request-context
// resolver so unit tests can exercise routing, decoding, and error
// mapping without provisioning a live Valkey adapter)
// ---------------------------------------------------------------------------

export const createOperatorWebhookDeliveryHttpHandlerWithDependencies =
  (input: {
    readonly resolveRequestContext: OperatorWebhookDeliveryRequestContextResolver;
    readonly runWithService: OperatorWebhookDeliveryServiceRunner;
  }) => {
    const { resolveRequestContext, runWithService } = input;
    const buildRequestContext = (request: Request) =>
      resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

    return (request: Request) => {
      const url = new URL(request.url);
      const match = matchOperatorWebhookDeliveryRoute(
        url.pathname,
        request.method,
      );

      if (match === undefined) {
        return Effect.succeed(
          createNotFoundResponse("Operator webhook delivery route not found."),
        );
      }

      const allowedMethods = methodForRoute(match);
      if (!allowedMethods.includes(request.method)) {
        return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
      }

      switch (match.kind) {
        case "enqueue":
          return matchHttpEffect({
            effect: Effect.all({
              requestContext: buildRequestContext(request),
              delivery: readOperatorWebhookDeliveryRequestJson({
                request,
                decode: decodeEnqueueBody,
              }),
            }).pipe(
              Effect.flatMap(({ requestContext, delivery }) =>
                runWithService((service) =>
                  service.enqueueDelivery({ requestContext, delivery }),
                ),
              ),
            ),
            onFailure: buildErrorResponse,
            onSuccess: (delivery) => createJsonResponse({ delivery }, 201),
          });
        case "list":
          return matchHttpEffect({
            effect: Effect.all({
              requestContext: buildRequestContext(request),
              filter: decodeListQuery(
                Object.fromEntries(url.searchParams.entries()),
              ),
            }).pipe(
              Effect.flatMap(({ requestContext, filter }) =>
                runWithService((service) =>
                  service.listDeliveries({ requestContext, filter }),
                ),
              ),
            ),
            onFailure: buildErrorResponse,
            onSuccess: (deliveries) => createJsonResponse({ deliveries }, 200),
          });
        case "get": {
          const deliveryId = match.deliveryId;
          return matchHttpEffect({
            effect: buildRequestContext(request).pipe(
              Effect.flatMap((requestContext) =>
                runWithService((service) =>
                  service.getDelivery({ requestContext, id: deliveryId }),
                ),
              ),
            ),
            onFailure: buildErrorResponse,
            onSuccess: (maybeDelivery) =>
              createJsonResponse(
                { delivery: Option.getOrNull(maybeDelivery) },
                200,
              ),
          });
        }
        case "replay": {
          const deliveryId = match.deliveryId;
          return matchHttpEffect({
            effect: Effect.all({
              requestContext: buildRequestContext(request),
              body: readOperatorWebhookDeliveryRequestJson({
                request,
                decode: decodeReplayBody,
              }),
            }).pipe(
              Effect.flatMap(({ requestContext, body }) =>
                runWithService((service) =>
                  service.replayDelivery({
                    requestContext,
                    replay: {
                      id: deliveryId,
                      replayReasonCatalogId: body.replayReasonCatalogId,
                      reasonAttachmentText: body.reasonAttachmentText,
                    },
                  }),
                ),
              ),
            ),
            onFailure: buildErrorResponse,
            onSuccess: (delivery) => createJsonResponse({ delivery }, 201),
          });
        }
        case "retry": {
          const deliveryId = match.deliveryId;
          return matchHttpEffect({
            effect: Effect.all({
              requestContext: buildRequestContext(request),
              body: readOperatorWebhookDeliveryRequestJson({
                request,
                decode: decodeRetryBody,
              }),
            }).pipe(
              Effect.flatMap(({ requestContext, body }) =>
                runWithService((service) =>
                  service.retryDelivery({
                    requestContext,
                    retry: {
                      id: deliveryId,
                      retryReasonCatalogId: body.retryReasonCatalogId,
                    },
                  }),
                ),
              ),
            ),
            onFailure: buildErrorResponse,
            onSuccess: (delivery) => createJsonResponse({ delivery }, 200),
          });
        }
        case "cancel": {
          const deliveryId = match.deliveryId;
          return matchHttpEffect({
            effect: Effect.all({
              requestContext: buildRequestContext(request),
              body: readOperatorWebhookDeliveryRequestJson({
                request,
                decode: decodeCancelBody,
              }),
            }).pipe(
              Effect.flatMap(({ requestContext, body }) =>
                runWithService((service) =>
                  service.cancelDelivery({
                    requestContext,
                    cancel: {
                      id: deliveryId,
                      cancelReasonCatalogId: body.cancelReasonCatalogId,
                    },
                  }),
                ),
              ),
            ),
            onFailure: buildErrorResponse,
            onSuccess: (delivery) => createJsonResponse({ delivery }, 200),
          });
        }
        case "recomputeSignature": {
          const deliveryId = match.deliveryId;
          return matchHttpEffect({
            effect: buildRequestContext(request).pipe(
              Effect.flatMap((requestContext) =>
                runWithService((service) =>
                  service.recomputeSignatureHeader({
                    requestContext,
                    id: deliveryId,
                  }),
                ),
              ),
            ),
            onFailure: buildErrorResponse,
            onSuccess: (signatureHeader) =>
              createJsonResponse({ signatureHeader }, 200),
          });
        }
      }
    };
  };

export const createOperatorWebhookDeliveryHttpHandler = (
  environment: unknown,
  runWithService: OperatorWebhookDeliveryServiceRunner,
) =>
  createOperatorWebhookDeliveryHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleOperatorWebhookDeliveryHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createOperatorWebhookDeliveryHttpHandler(environment, (use) =>
    runOperatorWebhookDeliveryFromEnvironment(environment, use),
  )(request);
