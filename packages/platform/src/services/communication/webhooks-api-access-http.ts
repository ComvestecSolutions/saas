import { Effect, ParseResult, Schema } from "effect";
import {
  platformAdapterServiceName,
  type PolarWebhookValidationError,
  validateAndNormalizePolarWebhookRequest,
} from "../../adapters";
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
        _tag: "WebhooksApiJsonInvalidError",
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
              _tag: "WebhooksApiJsonRequestParseError",
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
    Allow: "POST",
  });

const notFoundResponse = () =>
  createJsonResponse({ error: "Webhook API route not found." }, 404);

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

    if (request.method !== "POST") {
      return Effect.succeed(
        url.pathname.startsWith(webhooksApiBasePath)
          ? methodNotAllowedResponse()
          : notFoundResponse(),
      );
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

        return Effect.succeed(
          createJsonResponse(
            {
              error: "Webhook verification is not configured for this backend.",
            },
            500,
          ),
        );
      case webhooksApiPath.replayPolarWebhook:
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
      default:
        return Effect.succeed(notFoundResponse());
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
