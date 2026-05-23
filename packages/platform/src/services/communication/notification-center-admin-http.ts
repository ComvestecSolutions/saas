import { Effect, ParseResult, Schema } from "effect";
import {
  NotificationCenterAdminListFiltersSchema,
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
  runNotificationCenterAdminFromEnvironment,
  type NotificationCenterAdminRuntimeError,
  type NotificationCenterAdminServiceImpl,
} from "../domains/notification-center-admin-service";
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

export const notificationCenterAdminApiBasePath =
  "/api/notification-center-admin";

export const notificationCenterAdminApiPath = {
  list: `${notificationCenterAdminApiBasePath}/list`,
  detail: `${notificationCenterAdminApiBasePath}/detail`,
  resend: `${notificationCenterAdminApiBasePath}/resend`,
} as const;

type NotificationCenterAdminRouteMatch =
  | { readonly kind: "list" }
  | { readonly kind: "detail" }
  | { readonly kind: "resend" };

const matchNotificationCenterAdminRoute = (
  pathname: string,
): NotificationCenterAdminRouteMatch | undefined => {
  if (pathname === notificationCenterAdminApiPath.list) return { kind: "list" };
  if (pathname === notificationCenterAdminApiPath.detail)
    return { kind: "detail" };
  if (pathname === notificationCenterAdminApiPath.resend)
    return { kind: "resend" };
  return undefined;
};

const methodForRoute = (
  match: NotificationCenterAdminRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "list":
    case "detail":
      return ["GET"];
    case "resend":
      return ["POST"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution (Valkey VALKEY_URL local decode)
// ---------------------------------------------------------------------------

const NotificationCenterAdminHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeNotificationCenterAdminHttpEnvironment = Schema.decodeUnknown(
  NotificationCenterAdminHttpEnvironmentSchema,
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
      yield* decodeNotificationCenterAdminHttpEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

// ---------------------------------------------------------------------------
// Per-route body / query schemas
// ---------------------------------------------------------------------------

const PageSizeQuerySchema = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.positive(),
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);
const decodeListFilters = Schema.decodeUnknown(
  NotificationCenterAdminListFiltersSchema,
);
const decodePageSize = Schema.decodeUnknown(PageSizeQuerySchema);

const NotificationResendBodySchema = Schema.Struct({
  notificationId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  reasonAttachmentText: Schema.NonEmptyString,
});
const decodeResendBody = Schema.decodeUnknown(NotificationResendBodySchema);

const readJsonBody = (request: Request) =>
  Effect.tryPromise({
    try: () => request.json() as Promise<unknown>,
    catch: (cause): { readonly _tag: "JsonInvalid"; readonly cause: unknown } =>
      ({ _tag: "JsonInvalid", cause }) as const,
  });

const buildFiltersFromQuery = (
  url: URL,
): Effect.Effect<
  {
    readonly filters: import("@comvestec/contracts").NotificationCenterAdminListFilters;
    readonly pageSize: number;
    readonly pageToken: string | undefined;
  },
  ParseResult.ParseError
> =>
  Effect.gen(function* () {
    const rawFilters: Record<string, unknown> = {};
    const channel = url.searchParams.get("channel");
    if (channel !== null) rawFilters.channel = channel;
    const status = url.searchParams.get("status");
    if (status !== null) rawFilters.status = status;
    const recipientHash = url.searchParams.get("recipientHash");
    if (recipientHash !== null) rawFilters.recipientHash = recipientHash;
    const since = url.searchParams.get("since");
    if (since !== null) rawFilters.since = since;
    const until = url.searchParams.get("until");
    if (until !== null) rawFilters.until = until;
    const filters = yield* decodeListFilters(rawFilters);
    const pageSizeRaw = url.searchParams.get("pageSize") ?? "25";
    const pageSize = yield* decodePageSize(pageSizeRaw);
    const pageTokenRaw = url.searchParams.get("pageToken");
    return {
      filters,
      pageSize,
      pageToken:
        pageTokenRaw !== null && pageTokenRaw.length > 0
          ? pageTokenRaw
          : undefined,
    };
  });

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ParseError":
      case "NotificationCenterAdminReasonNotInCatalog":
      case "NotificationCenterAdminReasonActionMismatch":
      case "NotificationCenterAdminReasonAttachmentRequired":
      case "NotificationCenterAdminPageSizeTooLarge":
      case "JsonInvalid":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "NotificationCenterAdminUnauthorized":
      case "NotificationCenterAdminMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "NotificationCenterAdminNotificationNotFound":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
    }
  }
  return createJsonResponse(
    { error: "Notification-center admin request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type NotificationCenterAdminServiceRunner = <A, E>(
  use: (service: NotificationCenterAdminServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | NotificationCenterAdminRuntimeError>;

type NotificationCenterAdminRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createNotificationCenterAdminHttpHandlerWithDependencies =
  (input: {
    readonly resolveRequestContext: NotificationCenterAdminRequestContextResolver;
    readonly runWithService: NotificationCenterAdminServiceRunner;
  }) => {
    const { resolveRequestContext, runWithService } = input;
    const buildRequestContext = (request: Request) =>
      resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

    return (request: Request) => {
      const url = new URL(request.url);
      const match = matchNotificationCenterAdminRoute(url.pathname);
      if (match === undefined) {
        return Effect.succeed(
          createNotFoundResponse("Notification-center admin route not found."),
        );
      }
      const allowedMethods = methodForRoute(match);
      if (!allowedMethods.includes(request.method)) {
        return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
      }

      switch (match.kind) {
        case "list":
          return matchHttpEffect({
            effect: Effect.all({
              requestContext: buildRequestContext(request),
              query: buildFiltersFromQuery(url),
            }).pipe(
              Effect.flatMap(({ requestContext, query }) =>
                runWithService((service) =>
                  service.listNotifications({
                    requestContext,
                    filters: query.filters,
                    pageSize: query.pageSize,
                    ...(query.pageToken === undefined
                      ? {}
                      : { pageToken: query.pageToken }),
                  }),
                ),
              ),
            ),
            onFailure: buildErrorResponse,
            onSuccess: (view) =>
              createJsonResponse(
                { result: view.result, fromCache: view.fromCache },
                200,
              ),
          });
        case "detail":
          return matchHttpEffect({
            effect: Effect.gen(function* () {
              const notificationId = url.searchParams.get("notificationId");
              if (notificationId === null || notificationId.length === 0) {
                return yield* Effect.fail({ _tag: "ParseError" } as const);
              }
              const requestContext = yield* buildRequestContext(request);
              return yield* runWithService((service) =>
                service.getNotificationDetail({
                  requestContext,
                  notificationId,
                }),
              );
            }),
            onFailure: buildErrorResponse,
            onSuccess: (view) =>
              createJsonResponse(
                {
                  detail:
                    view.detail._tag === "Some" ? view.detail.value : null,
                },
                200,
              ),
          });
        case "resend":
          return matchHttpEffect({
            effect: Effect.all({
              requestContext: buildRequestContext(request),
              body: readJsonBody(request).pipe(
                Effect.flatMap((raw) => decodeResendBody(raw)),
              ),
            }).pipe(
              Effect.flatMap(({ requestContext, body }) =>
                runWithService((service) =>
                  service.resendNotification({
                    requestContext,
                    notificationId: body.notificationId,
                    reason: body.reason,
                    reasonAttachmentText: body.reasonAttachmentText,
                  }),
                ),
              ),
            ),
            onFailure: buildErrorResponse,
            onSuccess: (result) => createJsonResponse({ ...result }, 202),
          });
      }
    };
  };

export const createNotificationCenterAdminHttpHandler = (
  environment: unknown,
  runWithService: NotificationCenterAdminServiceRunner,
) =>
  createNotificationCenterAdminHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleNotificationCenterAdminHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createNotificationCenterAdminHttpHandler(environment, (use) =>
    runNotificationCenterAdminFromEnvironment(environment, use),
  )(request);
