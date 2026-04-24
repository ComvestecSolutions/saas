import { Effect, ParseResult, Schema } from "effect";
import {
  platformAdapterServiceName,
  type PolarWebhookValidationError,
  validateAndNormalizePolarWebhookRequest,
} from "../../adapters";
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

type WebhooksApiServiceRunner = <A, E>(
  use: (service: WebhooksApiService) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | ParseResult.ParseError>;

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
      case "ParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "WebhooksApiEnvironmentError":
        return createJsonResponse(
          { error: "Webhook verification is not configured for this backend." },
          500,
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

              return matchHttpEffect({
                effect: runWithService((service) =>
                  service.processBillingWebhook(input),
                ),
                onFailure: buildErrorResponse,
                onSuccess: (result) => createJsonResponse(result, 202),
              });
            }),
            Effect.catchAll((error) =>
              Effect.succeed(buildErrorResponse(error)),
            ),
          );
        }

        return Effect.succeed(
          createJsonResponse(
            {
              error: "Webhook verification is not configured for this backend.",
            },
            500,
          ),
        );
      case webhooksApiPath.replayPolarWebhook:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "WebhooksApiJsonInvalidError",
            decode: Schema.decodeUnknown(BillingWebhookReplayRequestSchema),
          }).pipe(
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
    (use) => runSubscriberJourneyFromEnvironment(environment, use),
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
