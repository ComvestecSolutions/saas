import { Effect, ParseResult, Schema } from "effect";
import {
  RequestContextSchema,
  WorkflowRunsListFiltersSchema,
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
  runWorkflowRunsAdminFromEnvironment,
  type WorkflowRunsAdminRuntimeError,
  type WorkflowRunsAdminServiceImpl,
} from "../domains/workflow-runs-admin-service";
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

export const workflowRunsAdminApiBasePath = "/api/workflow-runs-admin";

export const workflowRunsAdminApiPath = {
  list: `${workflowRunsAdminApiBasePath}/list`,
  detail: `${workflowRunsAdminApiBasePath}/detail`,
  replay: `${workflowRunsAdminApiBasePath}/replay`,
  cancel: `${workflowRunsAdminApiBasePath}/cancel`,
} as const;

type WorkflowRunsAdminRouteMatch =
  | { readonly kind: "list" }
  | { readonly kind: "detail" }
  | { readonly kind: "replay" }
  | { readonly kind: "cancel" };

const matchWorkflowRunsAdminRoute = (
  pathname: string,
): WorkflowRunsAdminRouteMatch | undefined => {
  if (pathname === workflowRunsAdminApiPath.list) return { kind: "list" };
  if (pathname === workflowRunsAdminApiPath.detail) return { kind: "detail" };
  if (pathname === workflowRunsAdminApiPath.replay) return { kind: "replay" };
  if (pathname === workflowRunsAdminApiPath.cancel) return { kind: "cancel" };
  return undefined;
};

const methodForRoute = (
  match: WorkflowRunsAdminRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "list":
    case "detail":
      return ["GET"];
    case "replay":
    case "cancel":
      return ["POST"];
  }
};

// ---------------------------------------------------------------------------
// Trusted request-context resolution (Valkey VALKEY_URL local decode)
// ---------------------------------------------------------------------------

const WorkflowRunsAdminHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeWorkflowRunsAdminHttpEnvironment = Schema.decodeUnknown(
  WorkflowRunsAdminHttpEnvironmentSchema,
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
      yield* decodeWorkflowRunsAdminHttpEnvironment(environment);
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
const decodeListFilters = Schema.decodeUnknown(WorkflowRunsListFiltersSchema);
const decodePageSize = Schema.decodeUnknown(PageSizeQuerySchema);

const WorkflowRunReplayBodySchema = Schema.Struct({
  runId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  reasonAttachmentText: Schema.NonEmptyString,
});
const decodeReplayBody = Schema.decodeUnknown(WorkflowRunReplayBodySchema);

const WorkflowRunCancelBodySchema = Schema.Struct({
  runId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  reasonAttachmentText: Schema.NonEmptyString,
});
const decodeCancelBody = Schema.decodeUnknown(WorkflowRunCancelBodySchema);

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
    readonly filters: import("@comvestec/contracts").WorkflowRunsListFilters;
    readonly pageSize: number;
    readonly pageToken: string | undefined;
  },
  ParseResult.ParseError
> =>
  Effect.gen(function* () {
    const rawFilters: Record<string, unknown> = {};
    const moduleId = url.searchParams.get("moduleId");
    if (moduleId !== null) rawFilters.moduleId = moduleId;
    const status = url.searchParams.get("status");
    if (status !== null) rawFilters.status = status;
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
      case "WorkflowRunsAdminReasonNotInCatalog":
      case "WorkflowRunsAdminReasonActionMismatch":
      case "WorkflowRunsAdminReasonAttachmentRequired":
      case "WorkflowRunsAdminPageSizeTooLarge":
      case "JsonInvalid":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "WorkflowRunsAdminUnauthorized":
      case "WorkflowRunsAdminMissingActorIdentity":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "WorkflowRunsAdminRunNotFound":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
    }
  }
  return createJsonResponse(
    { error: "Workflow-runs admin request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type WorkflowRunsAdminServiceRunner = <A, E>(
  use: (service: WorkflowRunsAdminServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | WorkflowRunsAdminRuntimeError>;

type WorkflowRunsAdminRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam)
// ---------------------------------------------------------------------------

export const createWorkflowRunsAdminHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: WorkflowRunsAdminRequestContextResolver;
  readonly runWithService: WorkflowRunsAdminServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchWorkflowRunsAdminRoute(url.pathname);
    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Workflow-runs admin route not found."),
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
                service.listRuns({
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
            const runId = url.searchParams.get("runId");
            if (runId === null || runId.length === 0) {
              return yield* Effect.fail({ _tag: "ParseError" } as const);
            }
            const requestContext = yield* buildRequestContext(request);
            return yield* runWithService((service) =>
              service.getRunDetail({ requestContext, runId }),
            );
          }),
          onFailure: buildErrorResponse,
          onSuccess: (view) =>
            createJsonResponse(
              {
                detail: view.detail._tag === "Some" ? view.detail.value : null,
              },
              200,
            ),
        });
      case "replay":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            body: readJsonBody(request).pipe(
              Effect.flatMap((raw) => decodeReplayBody(raw)),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, body }) =>
              runWithService((service) =>
                service.replayRun({
                  requestContext,
                  runId: body.runId,
                  reason: body.reason,
                  reasonAttachmentText: body.reasonAttachmentText,
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse({ ...result }, 202),
        });
      case "cancel":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            body: readJsonBody(request).pipe(
              Effect.flatMap((raw) => decodeCancelBody(raw)),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, body }) =>
              runWithService((service) =>
                service.cancelRun({
                  requestContext,
                  runId: body.runId,
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

export const createWorkflowRunsAdminHttpHandler = (
  environment: unknown,
  runWithService: WorkflowRunsAdminServiceRunner,
) =>
  createWorkflowRunsAdminHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleWorkflowRunsAdminHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createWorkflowRunsAdminHttpHandler(environment, (use) =>
    runWorkflowRunsAdminFromEnvironment(environment, use),
  )(request);
