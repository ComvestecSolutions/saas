import { Effect, ParseResult, Schema } from "effect";
import {
  type PostalAdapterRequestError,
  type PostalWebhookValidationError,
  type PostgresAdapterConnectionError,
  validateAndNormalizePostalWebhookRequest,
} from "../../adapters";
import { readPreparedBackendApiPostalWebhookRequest } from "../../http/request-middleware";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
} from "./http-transport";
import {
  runEmailDeliveryFromEnvironment,
  type EmailDeliveryService,
} from "./email-delivery";

type EmailDeliveryProviderEventsService = Pick<
  EmailDeliveryService,
  "recordProviderDeliveryEvent"
>;

const EmailDeliveryProviderEventsEnvironmentSchema = Schema.Struct({
  POSTAL_API_URL: Schema.NonEmptyString,
  POSTAL_SIGNING_KEY_BASE64: Schema.optional(Schema.NonEmptyString),
});

type EmailDeliveryProviderEventsServiceRunner = <A, E>(
  use: (service: EmailDeliveryProviderEventsService) => Effect.Effect<A, E>,
) => Effect.Effect<
  A,
  | E
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | PostalAdapterRequestError
>;

type EmailDeliveryProviderEventsEnvironmentError = {
  readonly _tag: "EmailDeliveryProviderEventsEnvironmentError";
};

type EmailDeliveryProviderEventParserError =
  | ParseResult.ParseError
  | EmailDeliveryProviderEventsEnvironmentError
  | PostalWebhookValidationError;

type VerifiedPostalWebhookRequest =
  | Parameters<
      EmailDeliveryProviderEventsService["recordProviderDeliveryEvent"]
    >[0]
  | null;

type EmailDeliveryHttpHandlerOptions = {
  readonly parsePostalWebhookRequest?: (
    request: Request,
  ) => Effect.Effect<
    VerifiedPostalWebhookRequest,
    EmailDeliveryProviderEventParserError
  >;
};

const readVerifiedPostalWebhookRequest = (input: {
  readonly request: Request;
  readonly parsePostalWebhookRequest?: (
    request: Request,
  ) => Effect.Effect<
    VerifiedPostalWebhookRequest,
    EmailDeliveryProviderEventParserError
  >;
}): Effect.Effect<
  VerifiedPostalWebhookRequest,
  EmailDeliveryProviderEventParserError
> =>
  Effect.flatMap(
    readPreparedBackendApiPostalWebhookRequest(input.request),
    (
      preparedRequest,
    ): Effect.Effect<
      VerifiedPostalWebhookRequest,
      EmailDeliveryProviderEventParserError
    > => {
      if (preparedRequest !== undefined) {
        return Effect.succeed(preparedRequest);
      }

      if (input.parsePostalWebhookRequest !== undefined) {
        return input.parsePostalWebhookRequest(input.request);
      }

      return Effect.fail({
        _tag: "EmailDeliveryProviderEventsEnvironmentError",
      } satisfies EmailDeliveryProviderEventsEnvironmentError);
    },
  );

export const emailDeliveryApiBasePath = "/api/communication/email-delivery";

export const emailDeliveryApiPath = {
  processPostalProviderEvent: `${emailDeliveryApiBasePath}/provider-events/postal`,
} as const;

const emailDeliveryAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [emailDeliveryApiPath.processPostalProviderEvent]: ["POST"],
};

const buildErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "EmailDeliveryProviderEventsEnvironmentError":
        return createJsonResponse(
          {
            error:
              "Provider webhook verification is not configured for this backend.",
          },
          500,
        );
      case "PostalWebhookSignatureError":
        return createJsonResponse(
          { error: "Authentication or signature validation failed." },
          401,
        );
      case "PostalWebhookPayloadMappingError":
        return createJsonResponse(
          {
            error:
              "Provider payload could not be mapped to the platform contract.",
          },
          422,
        );
      case "EmailDeliveryTrackingRecordMissingError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "PostalAdapterRequestError":
      case "EmailDeliveryPostgresRepositoryQueryError":
      case "PostgresAdapterConnectionError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
      case "ParseError":
        return createJsonResponse(
          { error: "Email delivery provider-event request failed." },
          500,
        );
    }
  }

  return createJsonResponse(
    { error: "Email delivery provider-event request failed." },
    500,
  );
};

export const createEmailDeliveryHttpHandler = (
  runWithService: EmailDeliveryProviderEventsServiceRunner,
  options?: EmailDeliveryHttpHandlerOptions,
) => {
  return (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods = emailDeliveryAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Email delivery route not found."),
      );
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (url.pathname) {
      case emailDeliveryApiPath.processPostalProviderEvent:
        return readVerifiedPostalWebhookRequest({
          request,
          ...(options?.parsePostalWebhookRequest !== undefined
            ? { parsePostalWebhookRequest: options.parsePostalWebhookRequest }
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
                service.recordProviderDeliveryEvent(input),
              ),
              onFailure: buildErrorResponse,
              onSuccess: () =>
                createJsonResponse({ acknowledged: true, ignored: false }, 202),
            });
          }),
          Effect.catchAll((error) => Effect.succeed(buildErrorResponse(error))),
        );
      default:
        return Effect.succeed(
          createNotFoundResponse("Email delivery route not found."),
        );
    }
  };
};

export const handleEmailDeliveryHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createEmailDeliveryHttpHandler(
    (use) =>
      runEmailDeliveryFromEnvironment(environment, use) as Effect.Effect<
        ReturnType<typeof use> extends Effect.Effect<infer Success, infer _E>
          ? Success
          : never,
        | ParseResult.ParseError
        | PostgresAdapterConnectionError
        | PostalAdapterRequestError
      >,
    {
      parsePostalWebhookRequest: (webhookRequest) =>
        Schema.decodeUnknown(EmailDeliveryProviderEventsEnvironmentSchema)(
          environment,
        ).pipe(
          Effect.mapError(
            () =>
              ({
                _tag: "EmailDeliveryProviderEventsEnvironmentError",
              }) satisfies EmailDeliveryProviderEventsEnvironmentError,
          ),
          Effect.flatMap((resolvedEnvironment) =>
            validateAndNormalizePostalWebhookRequest({
              request: webhookRequest,
              apiUrl: resolvedEnvironment.POSTAL_API_URL,
              ...(resolvedEnvironment.POSTAL_SIGNING_KEY_BASE64 !== undefined
                ? {
                    signingKeyBase64:
                      resolvedEnvironment.POSTAL_SIGNING_KEY_BASE64,
                  }
                : {}),
            }),
          ),
        ),
    },
  )(request);
