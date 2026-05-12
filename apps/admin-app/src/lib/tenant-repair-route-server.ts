import { Effect, Schema } from "effect";
import {
  cancelBillingRepairGapFromSessionId,
  extractRequiredSubscriberJourneySessionId,
  replayBillingRepairGapFromWorkflowExecutionContext,
} from "@comvestec/platform";
import {
  tanstackStartServerRuntime,
  type TanstackStartServerRuntime,
} from "./tanstack-start-server-runtime";
import {
  loadAdminTenantRepairRouteDataFromRequest,
  type AdminTenantRepairRouteLoaderInput,
} from "./tenant-repair-route-data";

type AdminRequestContext = {
  readonly request: Request;
};

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

const createAdminRequestMiddleware = (
  serverRuntime: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  serverRuntime
    .createMiddleware()
    .server(async ({ next, request }) => next({ context: { request } }));

export const adminRequestMiddleware = createAdminRequestMiddleware();

const normalizeTenantRepairRouteLoaderInput = (
  input: TenantRepairRouteLoaderInputValue | undefined,
): AdminTenantRepairRouteLoaderInput =>
  input?.inspectionReason === undefined
    ? {}
    : { inspectionReason: input.inspectionReason };

export const createGetAdminTenantRepairData = (
  loadRouteData: LoadAdminTenantRepairRouteData = loadAdminTenantRepairRouteDataFromRequest,
  environment: unknown = process.env,
  serverRuntime: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  serverRuntime
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(serverRuntime)])
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
        Effect.runPromise(
          loadRouteData(context.request, environment, undefined, data),
        ),
    );

const runTenantRepairWorkflowAction = <Result>(input: {
  readonly request: Request;
  readonly data: unknown;
  readonly execute: (requestInput: {
    readonly sessionId: string;
    readonly convexAuthToken: string;
    readonly jobId: string;
    readonly inspectionReason?: string;
  }) => Effect.Effect<Result, unknown, never>;
}) =>
  Schema.decodeUnknown(TenantRepairWorkflowActionInputSchema)(input.data).pipe(
    Effect.flatMap((requestData: TenantRepairWorkflowActionInput) =>
      extractRequiredSubscriberJourneySessionId(input.request).pipe(
        Effect.flatMap((sessionId) =>
          input.execute({
            sessionId,
            convexAuthToken: requestData.workflowToken,
            jobId: requestData.jobId,
            ...(requestData.inspectionReason === undefined
              ? {}
              : { inspectionReason: requestData.inspectionReason }),
          }),
        ),
      ),
    ),
  );

export const createReplayAdminTenantRepairGap = (
  replayTenantRepairGap: ReplayTenantRepairGap = (currentEnvironment, input) =>
    replayBillingRepairGapFromWorkflowExecutionContext(
      currentEnvironment,
      input,
    ),
  environment: unknown = process.env,
  serverRuntime: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  serverRuntime
    .createServerFn({ method: "POST" })
    .middleware([createAdminRequestMiddleware(serverRuntime)])
    .inputValidator((input: TenantRepairWorkflowActionInput) => input)
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: unknown;
      }) =>
        Effect.runPromise(
          runTenantRepairWorkflowAction({
            request: context.request,
            data,
            execute: (requestInput) =>
              replayTenantRepairGap(environment, requestInput),
          }),
        ),
    );

export const createCancelAdminTenantRepairGap = (
  cancelTenantRepairGap: CancelTenantRepairGap = (currentEnvironment, input) =>
    cancelBillingRepairGapFromSessionId(currentEnvironment, input),
  environment: unknown = process.env,
  serverRuntime: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  serverRuntime
    .createServerFn({ method: "POST" })
    .middleware([createAdminRequestMiddleware(serverRuntime)])
    .inputValidator((input: TenantRepairWorkflowActionInput) => input)
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: unknown;
      }) =>
        Effect.runPromise(
          runTenantRepairWorkflowAction({
            request: context.request,
            data,
            execute: (requestInput) =>
              cancelTenantRepairGap(environment, requestInput),
          }),
        ),
    );

export const getAdminTenantRepairData = createGetAdminTenantRepairData();
export const replayAdminTenantRepairGap = createReplayAdminTenantRepairGap();
export const cancelAdminTenantRepairGap = createCancelAdminTenantRepairGap();
