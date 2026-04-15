import { Effect, ParseResult, Schema } from "effect";
import {
  BillingCheckoutSessionInputSchema,
  BillingProviderWebhookInputSchema,
  PlatformModuleIdSchema,
  RequestContextSchema,
  TenantContextSchema,
  type BillingProviderWebhookInput,
} from "@comvestec/contracts";
import {
  KeycloakSessionInputSchema,
  platformAdapterServiceName,
  type PolarWebhookValidationError,
  validateAndNormalizePolarWebhookRequest,
} from "../adapters";
import {
  runSubscriberJourneyFromEnvironment,
  type SubscriberJourneyService,
} from "./subscriber-journey";

const StartAuthenticationRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  tenantHint: Schema.optional(Schema.NonEmptyString),
  displayNameHint: Schema.optional(Schema.NonEmptyString),
  returnHost: Schema.optional(Schema.NonEmptyString),
});

const CompleteAuthenticationRequestSchema = Schema.Struct({
  session: KeycloakSessionInputSchema,
  correlationId: Schema.NonEmptyString,
  host: Schema.optional(Schema.NonEmptyString),
  tenant: TenantContextSchema,
  enabledModules: Schema.Array(PlatformModuleIdSchema),
});

const ResolveRequestContextRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

const BillingWebhookReplayRequestSchema = Schema.Struct({
  deliveryId: Schema.NonEmptyString,
});

const ProductBootstrapRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

const SubscriberJourneyWebhookEnvironmentSchema = Schema.Struct({
  POLAR_WEBHOOK_SECRET: Schema.NonEmptyString,
});

type SubscriberJourneyServiceRunner = <A, E>(
  use: (service: SubscriberJourneyService) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | ParseResult.ParseError>;

type JsonRequestErrorTag =
  | "SubscriberJourneyJsonInvalidError"
  | "SubscriberJourneyJsonRequestParseError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

type SubscriberJourneyWebhookEnvironmentError = {
  readonly _tag: "SubscriberJourneyWebhookEnvironmentError";
};

type SubscriberJourneyWebhookParserError =
  | ParseResult.ParseError
  | PolarWebhookValidationError
  | SubscriberJourneyWebhookEnvironmentError;

export const subscriberJourneyApiBasePath = "/api/subscriber-journey";

export const subscriberJourneyApiPath = {
  listPublicPlans: `${subscriberJourneyApiBasePath}/billing/plans`,
  startAuthentication: `${subscriberJourneyApiBasePath}/auth/start`,
  completeAuthentication: `${subscriberJourneyApiBasePath}/auth/complete`,
  resolveRequestContext: `${subscriberJourneyApiBasePath}/identity/request-context`,
  createCheckoutSession: `${subscriberJourneyApiBasePath}/billing/checkouts`,
  processBillingWebhook: `${subscriberJourneyApiBasePath}/billing/webhooks/polar`,
  replayBillingWebhook: `${subscriberJourneyApiBasePath}/billing/webhooks/polar/replay`,
  buildProductBootstrap: `${subscriberJourneyApiBasePath}/product/bootstrap`,
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
        _tag: "SubscriberJourneyJsonInvalidError",
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
              _tag: "SubscriberJourneyJsonRequestParseError",
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
      case "SubscriberJourneyJsonInvalidError":
        return createJsonResponse(
          { error: "Request body must be valid JSON." },
          400,
        );
      case "SubscriberJourneyJsonRequestParseError":
      case "ParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneyWebhookEnvironmentError":
        return createJsonResponse(
          { error: "Webhook verification is not configured for this backend." },
          500,
        );
      case "PolarWebhookSignatureError":
      case "KeycloakSessionInactiveError":
        return createJsonResponse(
          { error: "Authentication or signature validation failed." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "BillingWebhookReceiptNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "PolarPlanNotFoundError":
      case "PolarPriceNotFoundError":
      case "KeycloakSessionIdentifierMissingError":
      case "PolarCatalogMetadataError":
      case "PolarWebhookPayloadMappingError":
        return createJsonResponse(
          {
            error:
              "Provider payload could not be mapped to the platform contract.",
          },
          422,
        );
      case "KeycloakAdapterRequestError":
      case "PolarAdapterRequestError":
      case "ValkeyAdapterOperationError":
      case "PostgresAdapterConnectionError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }

  return createJsonResponse(
    { error: "Subscriber journey request failed." },
    500,
  );
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
    Allow: "GET, POST",
  });

const notFoundResponse = () =>
  createJsonResponse({ error: "Subscriber journey route not found." }, 404);

type SubscriberJourneyHttpHandlerOptions = {
  readonly parsePolarWebhookRequest?: (
    request: Request,
  ) => Effect.Effect<
    BillingProviderWebhookInput | null,
    SubscriberJourneyWebhookParserError
  >;
};

export const createSubscriberJourneyHttpHandler =
  (
    runWithService: SubscriberJourneyServiceRunner,
    options?: SubscriberJourneyHttpHandlerOptions,
  ) =>
  (request: Request) => {
    const url = new URL(request.url);

    if (
      request.method === "GET" &&
      url.pathname === subscriberJourneyApiPath.listPublicPlans
    ) {
      return runRequest(
        runWithService((service) => service.listPublicPlans),
        (plans) => createJsonResponse({ plans }),
      );
    }

    if (request.method !== "POST") {
      return Effect.succeed(
        url.pathname.startsWith(subscriberJourneyApiBasePath)
          ? methodNotAllowedResponse()
          : notFoundResponse(),
      );
    }

    switch (url.pathname) {
      case subscriberJourneyApiPath.startAuthentication:
        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(StartAuthenticationRequestSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) => service.startAuthentication(input)),
            ),
          ),
          (result) => createJsonResponse(result, 202),
        );
      case subscriberJourneyApiPath.completeAuthentication:
        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(CompleteAuthenticationRequestSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.completeAuthentication(input),
              ),
            ),
          ),
          (result) => createJsonResponse(result, 202),
        );
      case subscriberJourneyApiPath.resolveRequestContext:
        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(ResolveRequestContextRequestSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) => service.resolveRequestContext(input)),
            ),
          ),
          (requestContext) => createJsonResponse({ requestContext }),
        );
      case subscriberJourneyApiPath.createCheckoutSession:
        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(BillingCheckoutSessionInputSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) => service.createCheckoutSession(input)),
            ),
          ),
          (checkoutSession) => createJsonResponse(checkoutSession, 202),
        );
      case subscriberJourneyApiPath.processBillingWebhook:
        if (options?.parsePolarWebhookRequest !== undefined) {
          return options.parsePolarWebhookRequest(request).pipe(
            Effect.flatMap((input) => {
              if (input === null) {
                return Effect.succeed(
                  createJsonResponse(
                    { acknowledged: true, ignored: true },
                    202,
                  ),
                );
              }

              return runRequest(
                runWithService((service) =>
                  service.processBillingWebhook(input),
                ),
                (result) => createJsonResponse(result, 202),
              );
            }),
            Effect.catchAll((error) =>
              Effect.succeed(buildErrorResponse(error)),
            ),
          );
        }

        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(BillingProviderWebhookInputSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) => service.processBillingWebhook(input)),
            ),
          ),
          (result) => createJsonResponse(result, 202),
        );
      case subscriberJourneyApiPath.replayBillingWebhook:
        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(BillingWebhookReplayRequestSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.replayBillingWebhook({
                  provider: platformAdapterServiceName.polar,
                  deliveryId: input.deliveryId,
                }),
              ),
            ),
          ),
          (result) => createJsonResponse(result, 202),
        );
      case subscriberJourneyApiPath.buildProductBootstrap:
        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(ProductBootstrapRequestSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) => service.buildProductBootstrap(input)),
            ),
          ),
          (result) => createJsonResponse(result),
        );
      default:
        return Effect.succeed(notFoundResponse());
    }
  };

export const handleSubscriberJourneyHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createSubscriberJourneyHttpHandler(
    (use) => runSubscriberJourneyFromEnvironment(environment, use),
    {
      parsePolarWebhookRequest: (webhookRequest) =>
        Schema.decodeUnknown(SubscriberJourneyWebhookEnvironmentSchema)(
          environment,
        ).pipe(
          Effect.mapError(
            () =>
              ({
                _tag: "SubscriberJourneyWebhookEnvironmentError",
              }) satisfies SubscriberJourneyWebhookEnvironmentError,
          ),
          Effect.flatMap((resolvedEnvironment) =>
            validateAndNormalizePolarWebhookRequest({
              request: webhookRequest,
              secret: resolvedEnvironment.POLAR_WEBHOOK_SECRET,
            }),
          ),
        ),
    },
  )(request);
