import { Effect, ParseResult, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  cancelBillingRepairGapFromSessionId,
  replayBillingRepairGapFromWorkflowExecutionContext,
} from "@comvestec/platform";
import type {
  KeycloakAdapterError,
  KeycloakImpersonationActorMismatchError,
  KeycloakImpersonationCleanupUnavailableError,
  KeycloakImpersonationCompensationError,
  KeycloakImpersonationIdTokenMissingError,
  ResolveTrustedRequestContextError,
} from "@comvestec/platform";
import type {
  loadAdminTenantRepairRouteDataFromRequest,
  AdminTenantRepairRouteData,
  AdminTenantRepairRouteLoaderInput,
} from "./tenant-repair-route-data";
import {
  adminRequestServerMiddleware,
  createAdminRequestMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import {
  tanstackStartServerRuntime,
  type TanstackStartServerRuntime,
} from "./tanstack-start-server-runtime";
import { decodeSyncBoundary } from "./effect-boundary";

type LoadAdminTenantRepairRouteData =
  typeof loadAdminTenantRepairRouteDataFromRequest;

const TenantRepairWorkflowActionInputSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

const TenantRepairRouteLoaderInputSchema = Schema.Struct({
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

const TenantRepairRouteLoaderInputBoundarySchema = Schema.Union(
  Schema.Undefined,
  TenantRepairRouteLoaderInputSchema,
);

type TenantRepairWorkflowActionInput = Schema.Schema.Type<
  typeof TenantRepairWorkflowActionInputSchema
>;

type TenantRepairRouteLoaderInputValue = Schema.Schema.Type<
  typeof TenantRepairRouteLoaderInputBoundarySchema
>;

const decodeTenantRepairRouteLoaderInput = decodeSyncBoundary(
  TenantRepairRouteLoaderInputBoundarySchema,
);

type ReplayTenantRepairGap = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly convexAuthToken: string;
    readonly jobId: string;
    readonly inspectionReason?: string;
  },
) => ReturnType<typeof replayBillingRepairGapFromWorkflowExecutionContext>;

type CancelTenantRepairGap = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly convexAuthToken: string;
    readonly jobId: string;
    readonly inspectionReason?: string;
  },
) => ReturnType<typeof cancelBillingRepairGapFromSessionId>;

type TenantRepairWorkflowExecutionEnvironment = Schema.Schema.Type<
  typeof TenantRepairWorkflowExecutionEnvironmentSchema
>;

type ResolveTenantRepairWorkflowExecutionContext = (
  environment: unknown,
  input: {
    readonly sessionId: string;
  },
) => Effect.Effect<
  {
    readonly convexAuthToken: string;
  },
  ResolveTenantRepairWorkflowExecutionContextError
>;

type TenantRepairWorkflowExecutionActorIdMissingError = {
  readonly _tag: "TenantRepairWorkflowExecutionActorIdMissingError";
  readonly reason: string;
};

type ResolveTenantRepairWorkflowExecutionContextError =
  | ParseResult.ParseError
  | ResolveTrustedRequestContextError
  | KeycloakAdapterError
  | KeycloakImpersonationIdTokenMissingError
  | KeycloakImpersonationActorMismatchError
  | KeycloakImpersonationCleanupUnavailableError
  | KeycloakImpersonationCompensationError
  | TenantRepairWorkflowExecutionActorIdMissingError
  | Error;

let tenantRepairPlatformModulePromise:
  | Promise<typeof import("@comvestec/platform")>
  | undefined;

const loadTenantRepairPlatformModule = () =>
  (tenantRepairPlatformModulePromise ??= import("@comvestec/platform"));

const TenantRepairWorkflowExecutionEnvironmentSchema = Schema.Struct({
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
});

const decodeTenantRepairWorkflowExecutionEnvironment = Schema.decodeUnknown(
  TenantRepairWorkflowExecutionEnvironmentSchema,
);

const resolveTenantRepairWorkflowExecutionContextFromSessionId: ResolveTenantRepairWorkflowExecutionContext =
  (environment, input) =>
    Effect.tryPromise({
      try: loadTenantRepairPlatformModule,
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    }).pipe(
      Effect.flatMap(
        ({ makeKeycloakAdapter, resolveTrustedRequestContextFromSessionId }) =>
          Effect.gen(function* () {
            const requestContext =
              yield* resolveTrustedRequestContextFromSessionId(
                environment,
                input.sessionId,
              );

            if (requestContext.actorId === undefined) {
              return yield* Effect.fail({
                _tag: "TenantRepairWorkflowExecutionActorIdMissingError",
                reason:
                  "Authenticated repair workflow execution requires the current operator session to have a stable actor id.",
              } satisfies TenantRepairWorkflowExecutionActorIdMissingError);
            }

            const resolvedEnvironment: TenantRepairWorkflowExecutionEnvironment =
              yield* decodeTenantRepairWorkflowExecutionEnvironment(
                environment,
              );
            const keycloak = yield* makeKeycloakAdapter({
              baseUrl: resolvedEnvironment.KEYCLOAK_BASE_URL,
              realm: resolvedEnvironment.KEYCLOAK_REALM,
              clientId: resolvedEnvironment.KEYCLOAK_CLIENT_ID,
              clientSecret: resolvedEnvironment.KEYCLOAK_CLIENT_SECRET,
            });
            const impersonationSession =
              yield* keycloak.issueImpersonationSession({
                impersonatedActorId: requestContext.actorId,
              });

            return {
              convexAuthToken: impersonationSession.idToken,
            };
          }),
      ),
    );

const loadAdminTenantRepairData = async (
  request: Request,
  environment: unknown,
  input: AdminTenantRepairRouteLoaderInput = {},
) => {
  const { loadAdminTenantRepairRouteDataFromRequest } =
    await import("./tenant-repair-route-data");

  return Effect.runPromise(
    loadAdminTenantRepairRouteDataFromRequest(
      request,
      environment,
      undefined,
      undefined,
      input,
    ),
  );
};

const normalizeTenantRepairRouteLoaderInput = (
  input: TenantRepairRouteLoaderInputValue | undefined,
): AdminTenantRepairRouteLoaderInput =>
  input?.inspectionReason === undefined
    ? {}
    : { inspectionReason: input.inspectionReason };

const runTenantRepairWorkflowAction = async <Result>(input: {
  readonly request: Request;
  readonly environment: unknown;
  readonly data: TenantRepairWorkflowActionInput;
  readonly resolveWorkflowExecutionContext: ResolveTenantRepairWorkflowExecutionContext;
  readonly execute: (requestInput: {
    readonly sessionId: string;
    readonly convexAuthToken: string;
    readonly jobId: string;
    readonly inspectionReason?: string;
  }) => Promise<Result>;
}) => {
  const { extractRequiredSubscriberJourneySessionId } =
    await import("@comvestec/platform");
  const sessionId = await Effect.runPromise(
    extractRequiredSubscriberJourneySessionId(input.request),
  );
  const workflowExecutionContext = await Effect.runPromise(
    input.resolveWorkflowExecutionContext(input.environment, {
      sessionId,
    }),
  );

  return input.execute({
    sessionId,
    convexAuthToken: workflowExecutionContext.convexAuthToken,
    jobId: input.data.jobId,
    ...(input.data.inspectionReason === undefined
      ? {}
      : { inspectionReason: input.data.inspectionReason }),
  });
};

export const createGetAdminTenantRepairData = (
  loadRouteData: LoadAdminTenantRepairRouteData | undefined = undefined,
  environment: unknown = process.env,
  tenantRepairServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  tenantRepairServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(tenantRepairServerFn)])
    .inputValidator((input: unknown) =>
      normalizeTenantRepairRouteLoaderInput(
        decodeTenantRepairRouteLoaderInput(input),
      ),
    )
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: AdminTenantRepairRouteLoaderInput;
      }) =>
        loadRouteData === undefined
          ? loadAdminTenantRepairData(context.request, environment, data)
          : Effect.runPromise(
              loadRouteData(
                context.request,
                environment,
                undefined,
                undefined,
                data,
              ),
            ),
    );

export const createReplayAdminTenantRepairGap = (
  replayTenantRepairGap: ReplayTenantRepairGap | undefined = undefined,
  environment: unknown = process.env,
  tenantRepairServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
  resolveWorkflowExecutionContext: ResolveTenantRepairWorkflowExecutionContext = resolveTenantRepairWorkflowExecutionContextFromSessionId,
) =>
  tenantRepairServerFn
    .createServerFn({ method: "POST" })
    .middleware([createAdminRequestMiddleware(tenantRepairServerFn)])
    .inputValidator(decodeSyncBoundary(TenantRepairWorkflowActionInputSchema))
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: TenantRepairWorkflowActionInput;
      }) =>
        runTenantRepairWorkflowAction({
          request: context.request,
          environment,
          data,
          resolveWorkflowExecutionContext,
          execute: async (requestInput) => {
            if (replayTenantRepairGap !== undefined) {
              return Effect.runPromise(
                replayTenantRepairGap(environment, requestInput),
              );
            }

            const { replayBillingRepairGapFromWorkflowExecutionContext } =
              await import("@comvestec/platform");

            return Effect.runPromise(
              replayBillingRepairGapFromWorkflowExecutionContext(
                environment,
                requestInput,
              ),
            );
          },
        }),
    );

export const createCancelAdminTenantRepairGap = (
  cancelTenantRepairGap: CancelTenantRepairGap | undefined = undefined,
  environment: unknown = process.env,
  tenantRepairServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
  resolveWorkflowExecutionContext: ResolveTenantRepairWorkflowExecutionContext = resolveTenantRepairWorkflowExecutionContextFromSessionId,
) =>
  tenantRepairServerFn
    .createServerFn({ method: "POST" })
    .middleware([createAdminRequestMiddleware(tenantRepairServerFn)])
    .inputValidator(decodeSyncBoundary(TenantRepairWorkflowActionInputSchema))
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: TenantRepairWorkflowActionInput;
      }) =>
        runTenantRepairWorkflowAction({
          request: context.request,
          environment,
          data,
          resolveWorkflowExecutionContext,
          execute: async (requestInput) => {
            if (cancelTenantRepairGap !== undefined) {
              return Effect.runPromise(
                cancelTenantRepairGap(environment, requestInput),
              );
            }

            const { cancelBillingRepairGapFromSessionId } =
              await import("@comvestec/platform");

            return Effect.runPromise(
              cancelBillingRepairGapFromSessionId(environment, requestInput),
            );
          },
        }),
    );

export const getAdminTenantRepairData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeTenantRepairRouteLoaderInput(
      decodeTenantRepairRouteLoaderInput(input),
    ),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminTenantRepairRouteLoaderInput;
    }) => loadAdminTenantRepairData(context.request, process.env, data),
  );

export const replayAdminTenantRepairGap = createServerFn({ method: "POST" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(TenantRepairWorkflowActionInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: TenantRepairWorkflowActionInput;
    }) =>
      runTenantRepairWorkflowAction({
        request: context.request,
        environment: process.env,
        data,
        resolveWorkflowExecutionContext:
          resolveTenantRepairWorkflowExecutionContextFromSessionId,
        execute: async (requestInput) => {
          const { replayBillingRepairGapFromWorkflowExecutionContext } =
            await import("@comvestec/platform");

          return Effect.runPromise(
            replayBillingRepairGapFromWorkflowExecutionContext(
              process.env,
              requestInput,
            ),
          );
        },
      }),
  );

export const cancelAdminTenantRepairGap = createServerFn({ method: "POST" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(TenantRepairWorkflowActionInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: TenantRepairWorkflowActionInput;
    }) =>
      runTenantRepairWorkflowAction({
        request: context.request,
        environment: process.env,
        data,
        resolveWorkflowExecutionContext:
          resolveTenantRepairWorkflowExecutionContextFromSessionId,
        execute: async (requestInput) => {
          const { cancelBillingRepairGapFromSessionId } =
            await import("@comvestec/platform");

          return Effect.runPromise(
            cancelBillingRepairGapFromSessionId(process.env, requestInput),
          );
        },
      }),
  );
