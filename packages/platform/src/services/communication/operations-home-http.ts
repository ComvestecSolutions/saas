/**
 * Operations Home aggregate v2 HTTP transport (admin-app
 * implementation plan §9 item 3). Mirrors the
 * `admin-saved-views-http.ts` pattern: local path table that
 * advertises only owned endpoints, trusted request-context
 * resolution via Valkey-backed identity-session, query
 * decode at the framework boundary, and a typed
 * tagged-error → status mapping table.
 *
 * Owns exactly one endpoint:
 *   - `GET /api/operations-home/snapshot?windowMinutes=...`
 *
 * Error mapping:
 *   - `ParseError` / query-decode failures → 400
 *   - `OperationsHomeMissingActorIdentity` /
 *     `SubscriberJourneySessionIdMissingError` → 401
 *   - `OperationsHomeUnavailable` → 503
 *   - Postgres / Valkey adapter errors → 502
 *   - Anything else → 500
 */
import { Effect, Schema } from "effect";
import {
  RequestContextSchema,
  type RequestContext,
} from "@comvestec/contracts";
import {
  resolveTrustedRequestContextFromRequest,
  type ResolveTrustedRequestContextError,
} from "../access/trusted-request-context";
import {
  runOperationsHomeFromEnvironment,
  type OperationsHomeRuntimeError,
  type OperationsHomeServiceImpl,
} from "../domains/operations-home-service";
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

export const operationsHomeApiBasePath = "/api/operations-home";

export const operationsHomeApiPath = {
  snapshot: `${operationsHomeApiBasePath}/snapshot`,
} as const;

type OperationsHomeRouteMatch = { readonly kind: "snapshot" };

const matchOperationsHomeRoute = (
  pathname: string,
): OperationsHomeRouteMatch | undefined => {
  if (pathname === operationsHomeApiPath.snapshot) {
    return { kind: "snapshot" };
  }
  return undefined;
};

const methodForRoute = (match: OperationsHomeRouteMatch): readonly string[] => {
  switch (match.kind) {
    case "snapshot":
      return ["GET"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------
//
// Delegates to the shared `resolveTrustedRequestContextFromRequest` helper in
// `services/access/trusted-request-context.ts`. The local type alias is kept
// so the handler factory's resolver type signature does not leak the helper
// import path into downstream consumers.

type ResolveTrustedRequestContextErrorAlias = ResolveTrustedRequestContextError;

// ---------------------------------------------------------------------------
// Per-route query schema
// ---------------------------------------------------------------------------

const SnapshotQuerySchema = Schema.Struct({
  windowMinutes: Schema.optional(
    Schema.NumberFromString.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  ),
  recentAuditLimit: Schema.optional(
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
      case "OperationsHomeMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Operator session was not found or has expired." },
          401,
        );
      case "OperationsHomeUnavailable":
        return createJsonResponse(
          {
            error:
              "Operations Home snapshot is unavailable; every source failed.",
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
  return createJsonResponse({ error: "Operations Home request failed." }, 500);
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type OperationsHomeServiceRunner = <A, E>(
  use: (service: OperationsHomeServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | OperationsHomeRuntimeError>;

type OperationsHomeRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextErrorAlias>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createOperationsHomeHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: OperationsHomeRequestContextResolver;
  readonly runWithService: OperationsHomeServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchOperationsHomeRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Operations Home route not found."),
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
            ...(query.windowMinutes === undefined
              ? {}
              : { windowMinutes: query.windowMinutes }),
            ...(query.recentAuditLimit === undefined
              ? {}
              : { recentAuditLimit: query.recentAuditLimit }),
          }),
        );
      }),
      onFailure: buildErrorResponse,
      onSuccess: (snapshot) => createJsonResponse({ snapshot }, 200),
    });
  };
};

export const createOperationsHomeHttpHandler = (
  environment: unknown,
  runWithService: OperationsHomeServiceRunner,
) =>
  createOperationsHomeHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleOperationsHomeHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createOperationsHomeHttpHandler(environment, (use) =>
    runOperationsHomeFromEnvironment(environment, use),
  )(request);
