import { Effect, Option, ParseResult, Schema } from "effect";
import {
  NovuDeliveryChannelSchema,
  NovuDeliveryGetByIdInputSchema,
  NovuDeliveryListByChannelInputSchema,
  NovuDeliveryListByRecipientInputSchema,
  PlatformScopeSchema,
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
  type NovuDeliveriesReadRuntimeError,
  type NovuDeliveriesReadServiceImpl,
  runNovuDeliveriesReadFromEnvironment,
} from "../domains/novu-deliveries-read-service";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
} from "./http-transport";

// ---------------------------------------------------------------------------
// Path table (local — registry advertises only owned endpoints)
// ---------------------------------------------------------------------------

export const novuDeliveriesReadApiBasePath = "/api/novu-deliveries-read";

export const novuDeliveriesReadApiPath = {
  byId: `${novuDeliveriesReadApiBasePath}/by-id`,
  byRecipient: `${novuDeliveriesReadApiBasePath}/by-recipient`,
  byChannel: `${novuDeliveriesReadApiBasePath}/by-channel`,
} as const;

type NovuDeliveriesReadRouteMatch =
  | { readonly kind: "byId" }
  | { readonly kind: "byRecipient" }
  | { readonly kind: "byChannel" };

const matchNovuDeliveriesReadRoute = (
  pathname: string,
): NovuDeliveriesReadRouteMatch | undefined => {
  if (pathname === novuDeliveriesReadApiPath.byId) {
    return { kind: "byId" };
  }
  if (pathname === novuDeliveriesReadApiPath.byRecipient) {
    return { kind: "byRecipient" };
  }
  if (pathname === novuDeliveriesReadApiPath.byChannel) {
    return { kind: "byChannel" };
  }
  return undefined;
};

const methodForRoute = (
  match: NovuDeliveriesReadRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "byId":
    case "byRecipient":
    case "byChannel":
      return ["GET"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const NovuDeliveriesReadHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeNovuDeliveriesReadHttpEnvironment = Schema.decodeUnknown(
  NovuDeliveriesReadHttpEnvironmentSchema,
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
      yield* decodeNovuDeliveriesReadHttpEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

// ---------------------------------------------------------------------------
// Per-route query-string schemas (raw query string → service input wire)
// ---------------------------------------------------------------------------

const ByIdQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  deliveryId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

const ByRecipientQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  subscriberId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const ByChannelQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  channel: NovuDeliveryChannelSchema,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const decodeByIdQuery = Schema.decodeUnknown(ByIdQuerySchema);
const decodeByRecipientQuery = Schema.decodeUnknown(ByRecipientQuerySchema);
const decodeByChannelQuery = Schema.decodeUnknown(ByChannelQuerySchema);

const decodeServiceByIdInput = Schema.decodeUnknown(
  NovuDeliveryGetByIdInputSchema,
);
const decodeServiceByRecipientInput = Schema.decodeUnknown(
  NovuDeliveryListByRecipientInputSchema,
);
const decodeServiceByChannelInput = Schema.decodeUnknown(
  NovuDeliveryListByChannelInputSchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
      case "NovuDeliveriesReadReasonNotInCatalog":
      case "NovuDeliveriesReadReasonActionMismatch":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "NovuDeliveriesReadUnauthorized":
      case "NovuDeliveriesReadMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "NovuDeliveriesReadAdapterClientError":
      case "NovuAdapterRequestError":
      case "NovuAdapterTransportError":
        return createJsonResponse(
          { error: "Novu deliveries read upstream call failed." },
          502,
        );
    }
  }
  return createJsonResponse(
    { error: "Novu deliveries read request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type NovuDeliveriesReadServiceRunner = <A, E>(
  use: (service: NovuDeliveriesReadServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | NovuDeliveriesReadRuntimeError>;

type NovuDeliveriesReadRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createNovuDeliveriesReadHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: NovuDeliveriesReadRequestContextResolver;
  readonly runWithService: NovuDeliveriesReadServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchNovuDeliveriesReadRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Novu deliveries read route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    const rawQuery = Object.fromEntries(url.searchParams.entries());

    switch (match.kind) {
      case "byId":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByIdQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByIdInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  deliveryId: parsed.deliveryId,
                  reasonCatalogId: parsed.reasonCatalogId,
                }),
              ),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.getById({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) =>
            createJsonResponse({ delivery: Option.getOrNull(view) }, 200),
        });
      case "byRecipient":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByRecipientQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByRecipientInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  subscriberId: parsed.subscriberId,
                  reasonCatalogId: parsed.reasonCatalogId,
                  ...(parsed.limit === undefined
                    ? {}
                    : { limit: parsed.limit }),
                }),
              ),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.listByRecipient({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse(view, 200),
        });
      case "byChannel":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByChannelQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByChannelInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  channel: parsed.channel,
                  reasonCatalogId: parsed.reasonCatalogId,
                  ...(parsed.limit === undefined
                    ? {}
                    : { limit: parsed.limit }),
                }),
              ),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.listByChannel({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse(view, 200),
        });
    }
  };
};

export const createNovuDeliveriesReadHttpHandler = (
  environment: unknown,
  runWithService: NovuDeliveriesReadServiceRunner,
) =>
  createNovuDeliveriesReadHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleNovuDeliveriesReadHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createNovuDeliveriesReadHttpHandler(environment, (use) =>
    runNovuDeliveriesReadFromEnvironment(environment, use),
  )(request);
