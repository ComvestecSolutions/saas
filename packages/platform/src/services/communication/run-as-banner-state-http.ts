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
  runRunAsBannerStateFromEnvironment,
  type RunAsBannerStateRuntimeError,
  type RunAsBannerStateServiceImpl,
} from "../access/run-as-banner-state-service";
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

export const runAsBannerStateApiBasePath = "/api/run-as-banner-state";

export const runAsBannerStateApiPath = {
  banner: `${runAsBannerStateApiBasePath}/banner`,
  release: `${runAsBannerStateApiBasePath}/release`,
} as const;

type RunAsBannerStateRouteMatch =
  | { readonly kind: "banner" }
  | { readonly kind: "release" };

const matchRunAsBannerStateRoute = (
  pathname: string,
): RunAsBannerStateRouteMatch | undefined => {
  if (pathname === runAsBannerStateApiPath.banner) {
    return { kind: "banner" };
  }
  if (pathname === runAsBannerStateApiPath.release) {
    return { kind: "release" };
  }
  return undefined;
};

const methodForRoute = (
  match: RunAsBannerStateRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "banner":
      return ["GET"];
    case "release":
      return ["POST"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution (Valkey VALKEY_URL local decode)
// ---------------------------------------------------------------------------

const RunAsBannerStateHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeRunAsBannerStateHttpEnvironment = Schema.decodeUnknown(
  RunAsBannerStateHttpEnvironmentSchema,
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
      yield* decodeRunAsBannerStateHttpEnvironment(environment);
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

const RunAsBannerStateReleaseBodySchema = Schema.Struct({
  grantId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  reasonAttachmentText: Schema.NonEmptyString,
});

const decodeReleaseBody = Schema.decodeUnknown(
  RunAsBannerStateReleaseBodySchema,
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
      case "RunAsBannerStateReasonNotInCatalog":
      case "RunAsBannerStateReasonActionMismatch":
      case "RunAsBannerStateReasonAttachmentRequired":
      case "JsonInvalid":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "RunAsBannerStateUnauthorized":
      case "RunAsBannerStateMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "RunAsBannerStateGrantNotFound":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
    }
  }
  return createJsonResponse(
    { error: "Run-as banner state request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type RunAsBannerStateServiceRunner = <A, E>(
  use: (service: RunAsBannerStateServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | RunAsBannerStateRuntimeError>;

type RunAsBannerStateRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createRunAsBannerStateHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: RunAsBannerStateRequestContextResolver;
  readonly runWithService: RunAsBannerStateServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchRunAsBannerStateRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Run-as banner state route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (match.kind) {
      case "banner":
        return matchHttpEffect({
          effect: buildRequestContext(request).pipe(
            Effect.flatMap((requestContext) =>
              runWithService((service) =>
                service.queryBanner({ requestContext }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (view) =>
            createJsonResponse(
              { banner: view.banner, fromCache: view.fromCache },
              200,
            ),
        });
      case "release":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            body: readJsonBody(request).pipe(
              Effect.flatMap((raw) => decodeReleaseBody(raw)),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, body }) =>
              runWithService((service) =>
                service.releaseGrant({
                  requestContext,
                  grantId: body.grantId,
                  reason: body.reason,
                  reasonAttachmentText: body.reasonAttachmentText,
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) =>
            createJsonResponse(
              { accepted: true, grantId: result.grantId },
              202,
            ),
        });
    }
  };
};

export const createRunAsBannerStateHttpHandler = (
  environment: unknown,
  runWithService: RunAsBannerStateServiceRunner,
) =>
  createRunAsBannerStateHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleRunAsBannerStateHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createRunAsBannerStateHttpHandler(environment, (use) =>
    runRunAsBannerStateFromEnvironment(environment, use),
  )(request);
