/**
 * Tenant workspace aggregate v2 HTTP transport (admin-app
 * implementation plan §9 item 4). Mirrors the
 * `operations-home-http.ts` pattern: local path table that
 * advertises only owned endpoints, trusted request-context
 * resolution via Valkey-backed identity-session, query decode
 * at the framework boundary, and a typed tagged-error → status
 * mapping table.
 *
 * Owns exactly one endpoint:
 *   - `GET /api/tenant-workspace/snapshot?tenantScope=&tenantScopeId=&windowMinutes=&membersLimit=&recentActivityLimit=`
 *
 * Error mapping (adds 403 for the cross-tenant guard vs
 * operations-home-http):
 *   - `ParseError` / query-decode failures → 400
 *   - `SubscriberJourneySessionIdMissingError` /
 *     `TenantWorkspaceMissingActorIdentity` → 401
 *   - `TenantWorkspaceCrossTenantAccessDenied` → 403
 *   - `IdentitySessionRequestContextNotFoundError` → 401
 *   - `TenantWorkspaceUnavailable` → 503
 *   - Postgres / Valkey adapter errors → 502
 *   - Anything else → 500
 */
import { Effect, ParseResult, Schema } from "effect";
import {
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
  runTenantWorkspaceFromEnvironment,
  type TenantWorkspaceRuntimeError,
  type TenantWorkspaceServiceImpl,
} from "../domains/tenant-workspace-service";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestQuery,
} from "./http-transport";

// ---------------------------------------------------------------------------
// Path table (local — registry advertises only owned endpoints)
// ---------------------------------------------------------------------------

export const tenantWorkspaceApiBasePath = "/api/tenant-workspace";

export const tenantWorkspaceApiPath = {
  snapshot: `${tenantWorkspaceApiBasePath}/snapshot`,
} as const;

type TenantWorkspaceRouteMatch = { readonly kind: "snapshot" };

const matchTenantWorkspaceRoute = (
  pathname: string,
): TenantWorkspaceRouteMatch | undefined => {
  if (pathname === tenantWorkspaceApiPath.snapshot) {
    return { kind: "snapshot" };
  }
  return undefined;
};

const methodForRoute = (
  match: TenantWorkspaceRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "snapshot":
      return ["GET"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const TenantWorkspaceHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeTenantWorkspaceHttpEnvironment = Schema.decodeUnknown(
  TenantWorkspaceHttpEnvironmentSchema,
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
      yield* decodeTenantWorkspaceHttpEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

// ---------------------------------------------------------------------------
// Per-route query schema
// ---------------------------------------------------------------------------

const SnapshotQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  windowMinutes: Schema.optional(
    Schema.NumberFromString.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  ),
  membersLimit: Schema.optional(
    Schema.NumberFromString.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  ),
  recentActivityLimit: Schema.optional(
    Schema.NumberFromString.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  ),
});

const decodeSnapshotQuery = Schema.decodeUnknown(SnapshotQuerySchema);
const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "TenantWorkspaceMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Operator session was not found or has expired." },
          401,
        );
      case "TenantWorkspaceCrossTenantAccessDenied":
        return createJsonResponse(
          {
            error:
              "Caller is not authorized to inspect the requested tenant workspace.",
          },
          403,
        );
      case "TenantWorkspaceUnavailable":
        return createJsonResponse(
          {
            error:
              "Tenant workspace snapshot is unavailable; every source failed.",
          },
          503,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuditLogParseError":
      case "PostgresAdapterConnectionError":
      case "ValkeyAdapterOperationError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }
  return createJsonResponse({ error: "Tenant workspace request failed." }, 500);
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type TenantWorkspaceServiceRunner = <A, E>(
  use: (service: TenantWorkspaceServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | TenantWorkspaceRuntimeError>;

type TenantWorkspaceRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createTenantWorkspaceHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: TenantWorkspaceRequestContextResolver;
  readonly runWithService: TenantWorkspaceServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchTenantWorkspaceRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Tenant workspace route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    return matchHttpEffect({
      effect: Effect.gen(function* () {
        const requestContext = yield* buildRequestContext(request);
        const query = yield* readRequestQuery({
          url,
          decode: decodeSnapshotQuery,
        });
        return yield* runWithService((service) =>
          service.getSnapshot({
            requestContext,
            tenant: {
              scope: query.tenantScope,
              scopeId: query.tenantScopeId,
            },
            ...(query.windowMinutes === undefined
              ? {}
              : { windowMinutes: query.windowMinutes }),
            ...(query.membersLimit === undefined
              ? {}
              : { membersLimit: query.membersLimit }),
            ...(query.recentActivityLimit === undefined
              ? {}
              : { recentActivityLimit: query.recentActivityLimit }),
          }),
        );
      }),
      onFailure: buildErrorResponse,
      onSuccess: (snapshot) => createJsonResponse({ snapshot }, 200),
    });
  };
};

export const createTenantWorkspaceHttpHandler = (
  environment: unknown,
  runWithService: TenantWorkspaceServiceRunner,
) =>
  createTenantWorkspaceHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleTenantWorkspaceHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createTenantWorkspaceHttpHandler(environment, (use) =>
    runTenantWorkspaceFromEnvironment(environment, use),
  )(request);
