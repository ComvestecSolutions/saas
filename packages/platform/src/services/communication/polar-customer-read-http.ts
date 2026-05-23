import { Effect, Option, ParseResult, Schema } from "effect";
import {
  PlatformScopeSchema,
  PolarCustomerGetByIdInputSchema,
  PolarCustomerListByEmailInputSchema,
  PolarCustomerListByExternalIdInputSchema,
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
  type PolarCustomerReadRuntimeError,
  type PolarCustomerReadServiceImpl,
  runPolarCustomerReadFromEnvironment,
} from "../domains/polar-customer-read-service";
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

export const polarCustomerReadApiBasePath = "/api/polar-customer-read";

export const polarCustomerReadApiPath = {
  byId: `${polarCustomerReadApiBasePath}/by-id`,
  byEmail: `${polarCustomerReadApiBasePath}/by-email`,
  byExternalId: `${polarCustomerReadApiBasePath}/by-external-id`,
} as const;

type PolarCustomerReadRouteMatch =
  | { readonly kind: "byId" }
  | { readonly kind: "byEmail" }
  | { readonly kind: "byExternalId" };

const matchPolarCustomerReadRoute = (
  pathname: string,
): PolarCustomerReadRouteMatch | undefined => {
  if (pathname === polarCustomerReadApiPath.byId) {
    return { kind: "byId" };
  }
  if (pathname === polarCustomerReadApiPath.byEmail) {
    return { kind: "byEmail" };
  }
  if (pathname === polarCustomerReadApiPath.byExternalId) {
    return { kind: "byExternalId" };
  }
  return undefined;
};

const methodForRoute = (
  match: PolarCustomerReadRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "byId":
    case "byEmail":
    case "byExternalId":
      return ["GET"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const PolarCustomerReadHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodePolarCustomerReadHttpEnvironment = Schema.decodeUnknown(
  PolarCustomerReadHttpEnvironmentSchema,
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
      yield* decodePolarCustomerReadHttpEnvironment(environment);
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
  customerId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

const ByEmailQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const ByExternalIdQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  externalId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const decodeByIdQuery = Schema.decodeUnknown(ByIdQuerySchema);
const decodeByEmailQuery = Schema.decodeUnknown(ByEmailQuerySchema);
const decodeByExternalIdQuery = Schema.decodeUnknown(ByExternalIdQuerySchema);

const decodeServiceByIdInput = Schema.decodeUnknown(
  PolarCustomerGetByIdInputSchema,
);
const decodeServiceByEmailInput = Schema.decodeUnknown(
  PolarCustomerListByEmailInputSchema,
);
const decodeServiceByExternalIdInput = Schema.decodeUnknown(
  PolarCustomerListByExternalIdInputSchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
      case "PolarCustomerReadReasonNotInCatalog":
      case "PolarCustomerReadReasonActionMismatch":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "PolarCustomerReadUnauthorized":
      case "PolarCustomerReadMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "PolarCustomerReadAdapterClientError":
      case "PolarAdapterRequestError":
        return createJsonResponse(
          { error: "Polar customer read upstream call failed." },
          502,
        );
    }
  }
  return createJsonResponse(
    { error: "Polar customer read request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type PolarCustomerReadServiceRunner = <A, E>(
  use: (service: PolarCustomerReadServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | PolarCustomerReadRuntimeError>;

type PolarCustomerReadRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createPolarCustomerReadHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: PolarCustomerReadRequestContextResolver;
  readonly runWithService: PolarCustomerReadServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchPolarCustomerReadRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Polar customer read route not found."),
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
                  customerId: parsed.customerId,
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
            createJsonResponse({ customer: Option.getOrNull(view) }, 200),
        });
      case "byEmail":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByEmailQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByEmailInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  email: parsed.email,
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
                service.listByEmail({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse(view, 200),
        });
      case "byExternalId":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByExternalIdQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByExternalIdInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  externalId: parsed.externalId,
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
                service.listByExternalId({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse(view, 200),
        });
    }
  };
};

export const createPolarCustomerReadHttpHandler = (
  environment: unknown,
  runWithService: PolarCustomerReadServiceRunner,
) =>
  createPolarCustomerReadHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handlePolarCustomerReadHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createPolarCustomerReadHttpHandler(environment, (use) =>
    runPolarCustomerReadFromEnvironment(environment, use),
  )(request);
