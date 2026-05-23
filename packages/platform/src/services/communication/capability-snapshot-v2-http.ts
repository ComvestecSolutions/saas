import { Effect, ParseResult, Schema } from "effect";
import {
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
  runCapabilitySnapshotV2PlatformFromEnvironment,
  type CapabilitySnapshotV2RuntimeError,
  type CapabilitySnapshotV2ServiceImpl,
} from "../access/capability-snapshot-v2-service";
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

export const capabilitySnapshotV2ApiBasePath = "/api/capability-snapshot-v2";

export const capabilitySnapshotV2ApiPath = {
  snapshot: `${capabilitySnapshotV2ApiBasePath}/snapshot`,
  invalidate: `${capabilitySnapshotV2ApiBasePath}/invalidate`,
} as const;

type CapabilitySnapshotV2RouteMatch =
  | { readonly kind: "snapshot" }
  | { readonly kind: "invalidate" };

const matchCapabilitySnapshotV2Route = (
  pathname: string,
): CapabilitySnapshotV2RouteMatch | undefined => {
  if (pathname === capabilitySnapshotV2ApiPath.snapshot) {
    return { kind: "snapshot" };
  }
  if (pathname === capabilitySnapshotV2ApiPath.invalidate) {
    return { kind: "invalidate" };
  }
  return undefined;
};

const methodForRoute = (
  match: CapabilitySnapshotV2RouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "snapshot":
      return ["GET"];
    case "invalidate":
      return ["POST"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution (Valkey VALKEY_URL local decode)
// ---------------------------------------------------------------------------

const CapabilitySnapshotV2HttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeCapabilitySnapshotV2HttpEnvironment = Schema.decodeUnknown(
  CapabilitySnapshotV2HttpEnvironmentSchema,
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
      yield* decodeCapabilitySnapshotV2HttpEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

// ---------------------------------------------------------------------------
// Per-route body schemas
// ---------------------------------------------------------------------------

const CapabilitySnapshotV2InvalidateBodySchema = Schema.Struct({
  actorId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  reasonAttachmentText: Schema.optional(Schema.NonEmptyString),
});

const decodeInvalidateBody = Schema.decodeUnknown(
  CapabilitySnapshotV2InvalidateBodySchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

const readJsonBody = (request: Request) =>
  Effect.tryPromise({
    try: () => request.json() as Promise<unknown>,
    catch: (cause): { readonly _tag: "JsonInvalid"; readonly cause: unknown } =>
      ({ _tag: "JsonInvalid", cause }) as const,
  });

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
      case "CapabilitySnapshotV2ReasonNotInCatalog":
      case "CapabilitySnapshotV2ReasonActionMismatch":
      case "JsonInvalid":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "CapabilitySnapshotV2Unauthorized":
      case "CapabilitySnapshotV2MissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
    }
  }
  return createJsonResponse(
    { error: "Capability snapshot v2 request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type CapabilitySnapshotV2ServiceRunner = <A, E>(
  use: (service: CapabilitySnapshotV2ServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | CapabilitySnapshotV2RuntimeError>;

type CapabilitySnapshotV2RequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createCapabilitySnapshotV2HttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: CapabilitySnapshotV2RequestContextResolver;
  readonly runWithService: CapabilitySnapshotV2ServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchCapabilitySnapshotV2Route(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Capability snapshot v2 route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (match.kind) {
      case "snapshot":
        return matchHttpEffect({
          effect: buildRequestContext(request).pipe(
            Effect.flatMap((requestContext) =>
              runWithService((service) =>
                service.deriveSnapshot({ requestContext }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) =>
            createJsonResponse(
              { snapshot: view.snapshot, fromCache: view.fromCache },
              200,
            ),
        });
      case "invalidate":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            body: readJsonBody(request).pipe(
              Effect.flatMap((raw) => decodeInvalidateBody(raw)),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, body }) =>
              runWithService((service) =>
                service.invalidateCache({
                  requestContext: { ...requestContext, reason: body.reason },
                  actorId: body.actorId,
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: () => createJsonResponse({ accepted: true }, 202),
        });
    }
  };
};

export const createCapabilitySnapshotV2HttpHandler = (
  environment: unknown,
  runWithService: CapabilitySnapshotV2ServiceRunner,
) =>
  createCapabilitySnapshotV2HttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleCapabilitySnapshotV2HttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createCapabilitySnapshotV2HttpHandler(environment, (use) =>
    runCapabilitySnapshotV2PlatformFromEnvironment(environment, use),
  )(request);
