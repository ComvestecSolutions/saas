import { Effect, ParseResult, Schema } from "effect";
import {
  AbsoluteRedirectUriSchema,
  BillingCheckoutSessionInputSchema,
  PlatformModuleIdSchema,
  RequestContextSchema,
  TenantContextSchema,
} from "@comvestec/contracts";
import { KeycloakSessionInputSchema } from "../../adapters";
import {
  decodeProductAppAuthCallbackStateFromEnvironment,
  validateProductAppAuthCallbackRedirectUriFromEnvironment,
} from "../access/first-party-auth";
import { webhooksApiPath } from "../communication/webhooks-api-access-http";
import {
  runSubscriberJourneyFromEnvironment,
  type SubscriberJourneyService,
} from "./subscriber-journey";

export const StartAuthenticationRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  tenantHint: Schema.optional(Schema.NonEmptyString),
  displayNameHint: Schema.optional(Schema.NonEmptyString),
  redirectUri: AbsoluteRedirectUriSchema,
  state: Schema.optional(Schema.NonEmptyString),
});

export const CompleteAuthenticationRequestSchema = Schema.Struct({
  session: KeycloakSessionInputSchema,
  state: Schema.NonEmptyString,
  host: Schema.optional(Schema.NonEmptyString),
});

export const ResolveRequestContextRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export const ProductBootstrapRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

type SubscriberJourneyServiceRunner = <A, E>(
  use: (service: SubscriberJourneyService) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | ParseResult.ParseError>;

type SubscriberJourneyHttpHandlerOptions = {
  readonly validateStartAuthentication?: (
    input: Schema.Schema.Type<typeof StartAuthenticationRequestSchema>,
  ) => Effect.Effect<void, unknown>;
  readonly hydrateCompleteAuthentication?: (
    input: Schema.Schema.Type<typeof CompleteAuthenticationRequestSchema>,
  ) => Effect.Effect<
    {
      readonly session: Schema.Schema.Type<typeof KeycloakSessionInputSchema>;
      readonly correlationId: string;
      readonly host?: string;
      readonly tenant: Schema.Schema.Type<typeof TenantContextSchema>;
      readonly enabledModules: readonly Schema.Schema.Type<
        typeof PlatformModuleIdSchema
      >[];
    },
    unknown
  >;
};

type JsonRequestErrorTag =
  | "SubscriberJourneyJsonInvalidError"
  | "SubscriberJourneyJsonRequestParseError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

export const subscriberJourneyApiBasePath = "/api/subscriber-journey";

export const subscriberJourneyApiPath = {
  listPublicPlans: `${subscriberJourneyApiBasePath}/billing/plans`,
  startAuthentication: `${subscriberJourneyApiBasePath}/auth/start`,
  completeAuthentication: `${subscriberJourneyApiBasePath}/auth/complete`,
  resolveRequestContext: `${subscriberJourneyApiBasePath}/identity/request-context`,
  createCheckoutSession: `${subscriberJourneyApiBasePath}/billing/checkouts`,
  processBillingWebhook: webhooksApiPath.processPolarWebhook,
  replayBillingWebhook: webhooksApiPath.replayPolarWebhook,
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
      case "ProductAppAuthCallbackRedirectNotAllowedError":
      case "ProductAppAuthCallbackStateInvalidError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "PolarWebhookSignatureError":
      case "KeycloakSessionInactiveError":
      case "ProductAppAuthCallbackStateExpiredError":
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
      case "TenantOwnerProvisioningActorMissingError":
        return createJsonResponse(
          {
            error:
              "Provider payload could not be mapped to the platform contract.",
          },
          422,
        );
      case "KeycloakAdapterRequestError":
      case "KeycloakPasswordGrantIdTokenMissingError":
      case "AuthorizationDelegatedCheckError":
      case "OryKetoAdapterRequestError":
      case "PolarAdapterRequestError":
      case "ConvexAdapterRequestError":
      case "SubscriberJourneyRepairQueryError":
      case "TenantOnboardingPostgresRepositoryPersistenceError":
      case "TenantProvisioningPostgresRepositoryPersistenceError":
      case "ValkeyAdapterOperationError":
      case "WorkflowJobsPostgresRepositoryQueryError":
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
              options?.validateStartAuthentication === undefined
                ? Effect.succeed(input)
                : options
                    .validateStartAuthentication(input)
                    .pipe(Effect.map(() => input)),
            ),
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
              options?.hydrateCompleteAuthentication === undefined
                ? Effect.fail({
                    _tag: "SubscriberJourneyJsonRequestParseError",
                  } as const)
                : options.hydrateCompleteAuthentication(input),
            ),
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
      validateStartAuthentication: (input) =>
        validateProductAppAuthCallbackRedirectUriFromEnvironment(
          environment,
          input.redirectUri,
        ).pipe(Effect.map(() => undefined)),
      hydrateCompleteAuthentication: (input) =>
        decodeProductAppAuthCallbackStateFromEnvironment(
          environment,
          input.state,
        ).pipe(
          Effect.map((statePayload) => ({
            session: input.session,
            correlationId: statePayload.correlationId,
            ...(input.host !== undefined ? { host: input.host } : {}),
            tenant: statePayload.tenant,
            enabledModules: statePayload.enabledModules,
          })),
        ),
    },
  )(request);
