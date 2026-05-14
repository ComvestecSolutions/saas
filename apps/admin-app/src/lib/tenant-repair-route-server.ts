import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  cancelBillingRepairGapFromSessionId,
  replayBillingRepairGapFromWorkflowExecutionContext,
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

type LoadAdminTenantRepairRouteData =
  typeof loadAdminTenantRepairRouteDataFromRequest;

const TenantRepairWorkflowActionInputSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  workflowToken: Schema.NonEmptyString,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

const TenantRepairRouteLoaderInputSchema = Schema.Struct({
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

type TenantRepairWorkflowActionInput = Schema.Schema.Type<
  typeof TenantRepairWorkflowActionInputSchema
>;

type TenantRepairRouteLoaderInputValue = Schema.Schema.Type<
  typeof TenantRepairRouteLoaderInputSchema
>;

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
  readonly data: unknown;
  readonly execute: (requestInput: {
    readonly sessionId: string;
    readonly convexAuthToken: string;
    readonly jobId: string;
    readonly inspectionReason?: string;
  }) => Promise<Result>;
}) => {
  const requestData = await Effect.runPromise(
    Schema.decodeUnknown(TenantRepairWorkflowActionInputSchema)(input.data),
  );
  const { extractRequiredSubscriberJourneySessionId } =
    await import("@comvestec/platform");
  const sessionId = await Effect.runPromise(
    extractRequiredSubscriberJourneySessionId(input.request),
  );

  return input.execute({
    sessionId,
    convexAuthToken: requestData.workflowToken,
    jobId: requestData.jobId,
    ...(requestData.inspectionReason === undefined
      ? {}
      : { inspectionReason: requestData.inspectionReason }),
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
    .inputValidator((input: TenantRepairRouteLoaderInputValue | undefined) =>
      normalizeTenantRepairRouteLoaderInput(input),
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
) =>
  tenantRepairServerFn
    .createServerFn({ method: "POST" })
    .middleware([createAdminRequestMiddleware(tenantRepairServerFn)])
    .inputValidator((input: TenantRepairWorkflowActionInput) => input)
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: unknown;
      }) =>
        runTenantRepairWorkflowAction({
          request: context.request,
          data,
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
) =>
  tenantRepairServerFn
    .createServerFn({ method: "POST" })
    .middleware([createAdminRequestMiddleware(tenantRepairServerFn)])
    .inputValidator((input: TenantRepairWorkflowActionInput) => input)
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: unknown;
      }) =>
        runTenantRepairWorkflowAction({
          request: context.request,
          data,
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
  .inputValidator((input: TenantRepairRouteLoaderInputValue | undefined) =>
    normalizeTenantRepairRouteLoaderInput(input),
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
  .inputValidator((input: TenantRepairWorkflowActionInput) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }) =>
      runTenantRepairWorkflowAction({
        request: context.request,
        data,
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
  .inputValidator((input: TenantRepairWorkflowActionInput) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }) =>
      runTenantRepairWorkflowAction({
        request: context.request,
        data,
        execute: async (requestInput) => {
          const { cancelBillingRepairGapFromSessionId } =
            await import("@comvestec/platform");

          return Effect.runPromise(
            cancelBillingRepairGapFromSessionId(process.env, requestInput),
          );
        },
      }),
  );
