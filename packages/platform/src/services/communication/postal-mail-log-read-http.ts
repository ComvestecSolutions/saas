import { Effect, Option, ParseResult, Schema } from "effect";
import {
  PlatformScopeSchema,
  PostalMailLogGetByIdInputSchema,
  PostalMailLogListByRecipientInputSchema,
  PostalMailLogListByStatusInputSchema,
  PostalMailLogStatusSchema,
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
  runPostalMailLogReadFromEnvironment,
  type PostalMailLogReadRuntimeError,
  type PostalMailLogReadServiceImpl,
} from "../domains/postal-mail-log-read-service";
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

export const postalMailLogReadApiBasePath = "/api/postal-mail-log-read";

export const postalMailLogReadApiPath = {
  byId: `${postalMailLogReadApiBasePath}/by-id`,
  byRecipient: `${postalMailLogReadApiBasePath}/by-recipient`,
  byStatus: `${postalMailLogReadApiBasePath}/by-status`,
} as const;

type PostalMailLogReadRouteMatch =
  | { readonly kind: "byId" }
  | { readonly kind: "byRecipient" }
  | { readonly kind: "byStatus" };

const matchPostalMailLogReadRoute = (
  pathname: string,
): PostalMailLogReadRouteMatch | undefined => {
  if (pathname === postalMailLogReadApiPath.byId) {
    return { kind: "byId" };
  }
  if (pathname === postalMailLogReadApiPath.byRecipient) {
    return { kind: "byRecipient" };
  }
  if (pathname === postalMailLogReadApiPath.byStatus) {
    return { kind: "byStatus" };
  }
  return undefined;
};

const methodForRoute = (
  match: PostalMailLogReadRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "byId":
    case "byRecipient":
    case "byStatus":
      return ["GET"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const PostalMailLogReadHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodePostalMailLogReadHttpEnvironment = Schema.decodeUnknown(
  PostalMailLogReadHttpEnvironmentSchema,
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
      yield* decodePostalMailLogReadHttpEnvironment(environment);
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
  messageId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

const ByRecipientQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  emailAddress: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const ByStatusQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  status: PostalMailLogStatusSchema,
  reasonCatalogId: Schema.NonEmptyString,
  limit: Schema.optional(Schema.NumberFromString),
});

const decodeByIdQuery = Schema.decodeUnknown(ByIdQuerySchema);
const decodeByRecipientQuery = Schema.decodeUnknown(ByRecipientQuerySchema);
const decodeByStatusQuery = Schema.decodeUnknown(ByStatusQuerySchema);

const decodeServiceByIdInput = Schema.decodeUnknown(
  PostalMailLogGetByIdInputSchema,
);
const decodeServiceByRecipientInput = Schema.decodeUnknown(
  PostalMailLogListByRecipientInputSchema,
);
const decodeServiceByStatusInput = Schema.decodeUnknown(
  PostalMailLogListByStatusInputSchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
      case "PostalMailLogReadReasonNotInCatalog":
      case "PostalMailLogReadReasonActionMismatch":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "PostalMailLogReadUnauthorized":
      case "PostalMailLogReadMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "PostalMailLogReadAdapterClientError":
      case "PostalAdapterRequestError":
      case "PostalAdapterTransportError":
        return createJsonResponse(
          { error: "Postal mail log read upstream call failed." },
          502,
        );
    }
  }
  return createJsonResponse(
    { error: "Postal mail log read request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type PostalMailLogReadServiceRunner = <A, E>(
  use: (service: PostalMailLogReadServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | PostalMailLogReadRuntimeError>;

type PostalMailLogReadRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createPostalMailLogReadHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: PostalMailLogReadRequestContextResolver;
  readonly runWithService: PostalMailLogReadServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchPostalMailLogReadRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Postal mail log read route not found."),
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
                  messageId: parsed.messageId,
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
            createJsonResponse({ entry: Option.getOrNull(view) }, 200),
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
                  emailAddress: parsed.emailAddress,
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
      case "byStatus":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeByStatusQuery(rawQuery).pipe(
              Effect.flatMap((parsed) =>
                decodeServiceByStatusInput({
                  tenant: {
                    scope: parsed.tenantScope,
                    scopeId: parsed.tenantScopeId,
                  },
                  status: parsed.status,
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
                service.listByStatus({ requestContext, query }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) => createJsonResponse(view, 200),
        });
    }
  };
};

export const createPostalMailLogReadHttpHandler = (
  environment: unknown,
  runWithService: PostalMailLogReadServiceRunner,
) =>
  createPostalMailLogReadHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handlePostalMailLogReadHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createPostalMailLogReadHttpHandler(environment, (use) =>
    runPostalMailLogReadFromEnvironment(environment, use),
  )(request);
