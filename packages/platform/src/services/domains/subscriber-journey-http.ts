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
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestJson,
} from "../communication/http-transport";
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
  buildProductBootstrap: `${subscriberJourneyApiBasePath}/product/bootstrap`,
} as const;

const subscriberJourneyAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [subscriberJourneyApiPath.listPublicPlans]: ["GET"],
  [subscriberJourneyApiPath.startAuthentication]: ["POST"],
  [subscriberJourneyApiPath.completeAuthentication]: ["POST"],
  [subscriberJourneyApiPath.resolveRequestContext]: ["POST"],
  [subscriberJourneyApiPath.createCheckoutSession]: ["POST"],
  [subscriberJourneyApiPath.buildProductBootstrap]: ["POST"],
};

const buildErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
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

export const createSubscriberJourneyHttpHandler =
  (
    runWithService: SubscriberJourneyServiceRunner,
    options?: SubscriberJourneyHttpHandlerOptions,
  ) =>
  (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods = subscriberJourneyAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Subscriber journey route not found."),
      );
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    if (url.pathname === subscriberJourneyApiPath.listPublicPlans) {
      return matchHttpEffect({
        effect: runWithService((service) => service.listPublicPlans),
        onFailure: buildErrorResponse,
        onSuccess: (plans) => createJsonResponse({ plans }),
      });
    }

    switch (url.pathname) {
      case subscriberJourneyApiPath.startAuthentication:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SubscriberJourneyJsonInvalidError",
            decode: Schema.decodeUnknown(StartAuthenticationRequestSchema),
          }).pipe(
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
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 202),
        });
      case subscriberJourneyApiPath.completeAuthentication:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SubscriberJourneyJsonInvalidError",
            decode: Schema.decodeUnknown(CompleteAuthenticationRequestSchema),
          }).pipe(
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
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 202),
        });
      case subscriberJourneyApiPath.resolveRequestContext:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SubscriberJourneyJsonInvalidError",
            decode: Schema.decodeUnknown(ResolveRequestContextRequestSchema),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) => service.resolveRequestContext(input)),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (requestContext) => createJsonResponse({ requestContext }),
        });
      case subscriberJourneyApiPath.createCheckoutSession:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SubscriberJourneyJsonInvalidError",
            decode: Schema.decodeUnknown(BillingCheckoutSessionInputSchema),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) => service.createCheckoutSession(input)),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (checkoutSession) =>
            createJsonResponse(checkoutSession, 202),
        });
      case subscriberJourneyApiPath.buildProductBootstrap:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SubscriberJourneyJsonInvalidError",
            decode: Schema.decodeUnknown(ProductBootstrapRequestSchema),
          }).pipe(
            Effect.flatMap((input) =>
              runWithService((service) => service.buildProductBootstrap(input)),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Subscriber journey route not found."),
        );
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
