import { Effect, Option, ParseResult, Schema } from "effect";
import {
  OpenMeterMeterGetBySlugInputSchema,
  OpenMeterMeterListAllInputSchema,
  OpenMeterMeterListByEventTypeInputSchema,
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
  type OpenMeterMeterReadRuntimeError,
  type OpenMeterMeterReadServiceImpl,
  runOpenMeterMeterReadFromEnvironment,
} from "../domains/open-meter-meter-read-service";
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

export const openMeterMeterReadApiBasePath = "/api/open-meter-meter-read";

export const openMeterMeterReadApiPath = {
  bySlug: `${openMeterMeterReadApiBasePath}/by-slug`,
  all: `${openMeterMeterReadApiBasePath}/all`,
  byEventType: `${openMeterMeterReadApiBasePath}/by-event-type`,
} as const;

type OpenMeterMeterReadRouteMatch =
  | { readonly kind: "bySlug" }
  | { readonly kind: "all" }
  | { readonly kind: "byEventType" };

const matchOpenMeterMeterReadRoute = (
  pathname: string,
): OpenMeterMeterReadRouteMatch | undefined => {
  if (pathname === openMeterMeterReadApiPath.bySlug) {
    return { kind: "bySlug" };
  }
  if (pathname === openMeterMeterReadApiPath.all) {
    return { kind: "all" };
  }
  if (pathname === openMeterMeterReadApiPath.byEventType) {
    return { kind: "byEventType" };
  }
  return undefined;
};

const methodForRoute = (
  match: OpenMeterMeterReadRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "bySlug":
    case "all":
    case "byEventType":
      return ["GET"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const OpenMeterMeterReadHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeOpenMeterMeterReadHttpEnvironment = Schema.decodeUnknown(
  OpenMeterMeterReadHttpEnvironmentSchema,
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
      yield* decodeOpenMeterMeterReadHttpEnvironment(environment);
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

const BySlugQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  meterSlug: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

const AllQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const ByEventTypeQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  eventType: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const decodeBySlugQuery = Schema.decodeUnknown(BySlugQuerySchema);
const decodeAllQuery = Schema.decodeUnknown(AllQuerySchema);
const decodeByEventTypeQuery = Schema.decodeUnknown(ByEventTypeQuerySchema);

const decodeServiceBySlugInput = Schema.decodeUnknown(
  OpenMeterMeterGetBySlugInputSchema,
);
const decodeServiceAllInput = Schema.decodeUnknown(
  OpenMeterMeterListAllInputSchema,
);
const decodeServiceByEventTypeInput = Schema.decodeUnknown(
  OpenMeterMeterListByEventTypeInputSchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
      case "OpenMeterMeterReadReasonNotInCatalog":
      case "OpenMeterMeterReadReasonActionMismatch":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "OpenMeterMeterReadUnauthorized":
      case "OpenMeterMeterReadMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "OpenMeterMeterReadAdapterClientError":
      case "OpenmeterAdapterRequestError":
      case "OpenmeterAdapterTransportError":
        return createJsonResponse(
          { error: "OpenMeter meter read upstream call failed." },
          502,
        );
    }
  }
  return createJsonResponse(
    { error: "OpenMeter meter read request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type OpenMeterMeterReadServiceRunner = <A, E>(
  use: (service: OpenMeterMeterReadServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | OpenMeterMeterReadRuntimeError>;

type OpenMeterMeterReadRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createOpenMeterMeterReadHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: OpenMeterMeterReadRequestContextResolver;
  readonly runWithService: OpenMeterMeterReadServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchOpenMeterMeterReadRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("OpenMeter meter read route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    const rawQuery = Object.fromEntries(url.searchParams.entries());

    switch (match.kind) {
      case "bySlug":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeBySlugQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceBySlugInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  meterSlug: parsed.meterSlug,
                  reasonCatalogId: parsed.reasonCatalogId,
                }),
              ),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.getBySlug({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) =>
            createJsonResponse({ meter: Option.getOrNull(view) }, 200),
        });
      case "all":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeAllQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceAllInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
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
                service.listAll({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse(view, 200),
        });
      case "byEventType":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByEventTypeQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByEventTypeInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  eventType: parsed.eventType,
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
                service.listByEventType({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse(view, 200),
        });
    }
  };
};

export const createOpenMeterMeterReadHttpHandler = (
  environment: unknown,
  runWithService: OpenMeterMeterReadServiceRunner,
) =>
  createOpenMeterMeterReadHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleOpenMeterMeterReadHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createOpenMeterMeterReadHttpHandler(environment, (use) =>
    runOpenMeterMeterReadFromEnvironment(environment, use),
  )(request);
