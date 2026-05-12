import { Effect, ParseResult, Schema } from "effect";
import {
  platformAdapterServiceName,
  type PolarWebhookValidationError,
  validateAndNormalizePolarWebhookRequest,
} from "../../adapters";
import { readPreparedBackendApiPolarWebhookRequest } from "../../http/request-middleware";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestJson,
} from "./http-transport";
import {
  runSubscriberJourneyFromEnvironment,
  type SubscriberJourneyService,
} from "../domains/subscriber-journey";

export const BillingWebhookReplayRequestSchema = Schema.Struct({
  deliveryId: Schema.NonEmptyString,
});

export const WebhookIgnoredResponseSchema = Schema.Struct({
  acknowledged: Schema.Boolean,
  ignored: Schema.Boolean,
});

const WebhooksApiEnvironmentSchema = Schema.Struct({
  POLAR_WEBHOOK_SECRET: Schema.NonEmptyString,
});

type WebhooksApiService = Pick<
  SubscriberJourneyService,
  "processBillingWebhook" | "replayBillingWebhook"
>;

type SubscriberJourneyDomainRuntimeError = {
  readonly _tag: "SubscriberJourneyRuntimeError";
  readonly cause: unknown;
};

type WebhooksApiRuntimeError = {
  readonly _tag: "WebhooksApiRuntimeError";
  readonly cause: unknown;
};

type WebhooksApiServiceRunner = <A, E>(
  use: (service: WebhooksApiService) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | ParseResult.ParseError | WebhooksApiRuntimeError>;

type JsonRequestErrorTag =
  | "WebhooksApiJsonInvalidError"
  | "WebhooksApiJsonRequestParseError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

type WebhooksApiEnvironmentError = {
  readonly _tag: "WebhooksApiEnvironmentError";
};

type WebhooksApiParserError =
  | ParseResult.ParseError
  | WebhooksApiEnvironmentError
  | PolarWebhookValidationError;

const readWebhookReplayRequestJson = (request: Request) =>
  readRequestJson({
    request,
    invalidJsonTag: "WebhooksApiJsonInvalidError",
    decode: Schema.decodeUnknown(BillingWebhookReplayRequestSchema),
  }).pipe(
    Effect.mapError((cause) =>
      typeof cause === "object" &&
      cause !== null &&
      "_tag" in cause &&
      cause._tag === "ParseError"
        ? ({
            _tag: "WebhooksApiJsonRequestParseError",
          } satisfies JsonRequestError)
        : cause,
    ),
  );

const mapWebhooksApiRuntimeError = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  Exclude<E, SubscriberJourneyDomainRuntimeError> | WebhooksApiRuntimeError
> =>
  effect.pipe(
    Effect.mapError((cause) =>
      typeof cause === "object" &&
      cause !== null &&
      "_tag" in cause &&
      cause._tag === "SubscriberJourneyRuntimeError"
        ? ({
            _tag: "WebhooksApiRuntimeError",
            cause,
          } satisfies WebhooksApiRuntimeError)
        : (cause as Exclude<E, SubscriberJourneyDomainRuntimeError>),
    ),
  ) as Effect.Effect<
    A,
    Exclude<E, SubscriberJourneyDomainRuntimeError> | WebhooksApiRuntimeError
  >;

export const webhooksApiBasePath = "/api/subscriber-journey/billing/webhooks";

export const webhooksApiPath = {
  processPolarWebhook: `${webhooksApiBasePath}/polar`,
  replayPolarWebhook: `${webhooksApiBasePath}/polar/replay`,
} as const;

const webhooksApiAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [webhooksApiPath.processPolarWebhook]: ["POST"],
  [webhooksApiPath.replayPolarWebhook]: ["POST"],
};

const buildErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "WebhooksApiJsonInvalidError":
        return createJsonResponse(
          { error: "Request body must be valid JSON." },
          400,
        );
      case "WebhooksApiJsonRequestParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "ParseError":
        return createJsonResponse(
          { error: "Webhook API request failed." },
          500,
        );
      case "WebhooksApiEnvironmentError":
        return createJsonResponse(
          { error: "Webhook verification is not configured for this backend." },
          500,
        );
      case "WebhooksApiRuntimeError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
      case "PolarWebhookSignatureError":
        return createJsonResponse(
          { error: "Authentication or signature validation failed." },
          401,
        );
      case "BillingWebhookReceiptNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "PolarPlanNotFoundError":
      case "PolarPriceNotFoundError":
      case "PolarCatalogMetadataError":
      case "PolarWebhookPayloadMappingError":
        return createJsonResponse(
          {
            error:
              "Provider payload could not be mapped to the platform contract.",
          },
          422,
        );
      case "PolarAdapterRequestError":
      case "PostgresAdapterConnectionError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }

  return createJsonResponse({ error: "Webhook API request failed." }, 500);
};

type WebhooksApiHttpHandlerOptions = {
  readonly parsePolarWebhookRequest?: (
    request: Request,
  ) => Effect.Effect<
    Parameters<WebhooksApiService["processBillingWebhook"]>[0] | null,
    WebhooksApiParserError
  >;
};

type VerifiedPolarWebhookRequest =
  | Parameters<WebhooksApiService["processBillingWebhook"]>[0]
  | null;

const readVerifiedPolarWebhookRequest = (input: {
  readonly request: Request;
  readonly parsePolarWebhookRequest?: (
    request: Request,
  ) => Effect.Effect<VerifiedPolarWebhookRequest, WebhooksApiParserError>;
}): Effect.Effect<VerifiedPolarWebhookRequest, WebhooksApiParserError> =>
  Effect.flatMap(
    readPreparedBackendApiPolarWebhookRequest(input.request),
    (
      preparedRequest,
    ): Effect.Effect<VerifiedPolarWebhookRequest, WebhooksApiParserError> => {
      if (preparedRequest !== undefined) {
        return Effect.succeed(preparedRequest);
      }

      if (input.parsePolarWebhookRequest !== undefined) {
        return input.parsePolarWebhookRequest(input.request);
      }

      return Effect.fail({
        _tag: "WebhooksApiEnvironmentError",
      } satisfies WebhooksApiEnvironmentError);
    },
  );

export const createWebhooksApiHttpHandler = (
  runWithService: WebhooksApiServiceRunner,
  options?: WebhooksApiHttpHandlerOptions,
) => {
  return (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods = webhooksApiAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Webhook API route not found."),
      );
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (url.pathname) {
      case webhooksApiPath.processPolarWebhook:
        return readVerifiedPolarWebhookRequest({
          request,
          ...(options?.parsePolarWebhookRequest !== undefined
            ? { parsePolarWebhookRequest: options.parsePolarWebhookRequest }
            : {}),
        }).pipe(
          Effect.flatMap((input) => {
            if (input === null) {
              return Effect.succeed(
                createJsonResponse({ acknowledged: true, ignored: true }, 202),
              );
            }

            return matchHttpEffect({
              effect: runWithService((service) =>
                service.processBillingWebhook(input),
              ),
              onFailure: buildErrorResponse,
              onSuccess: (result) => createJsonResponse(result, 202),
            });
          }),
          Effect.catchAll((error) => Effect.succeed(buildErrorResponse(error))),
        );
      case webhooksApiPath.replayPolarWebhook:
        return matchHttpEffect({
          effect: readWebhookReplayRequestJson(request).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.replayBillingWebhook({
                  provider: platformAdapterServiceName.polar,
                  deliveryId: input.deliveryId,
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 202),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Webhook API route not found."),
        );
    }
  };
};

export const handleWebhooksApiHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createWebhooksApiHttpHandler(
    (use) =>
      mapWebhooksApiRuntimeError(
        runSubscriberJourneyFromEnvironment(environment, use),
      ),
    {
      parsePolarWebhookRequest: (webhookRequest) =>
        Schema.decodeUnknown(WebhooksApiEnvironmentSchema)(environment).pipe(
          Effect.mapError(
            () =>
              ({
                _tag: "WebhooksApiEnvironmentError",
              }) satisfies WebhooksApiEnvironmentError,
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
