import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  IsoTimestampSchema,
  type WorkflowJobSummaryList,
  WorkflowJobSummaryListSchema,
} from "@comvestec/contracts";
import {
  type KeycloakAdapterRequestError,
  type KeycloakPasswordGrantIdTokenMissingError,
  makeKeycloakAdapter,
} from "../identity/keycloak";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const ConvexAdapterOptionsSchema = Schema.Struct({
  deploymentUrl: Schema.NonEmptyString,
  siteUrl: Schema.NonEmptyString,
  adminKey: Schema.optional(Schema.NonEmptyString),
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  keycloakConvexServiceActorUsername: Schema.NonEmptyString,
  keycloakConvexServiceActorPassword: Schema.NonEmptyString,
});

export type ConvexAdapterOptions = Schema.Schema.Type<
  typeof ConvexAdapterOptionsSchema
>;

const ConvexHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.convex,
);

const ConvexScheduledWorkflowDispatchSchema = Schema.Struct({
  scheduledFunctionId: Schema.NonEmptyString,
  primaryScheduled: Schema.Boolean,
  scheduledRecoveryAttemptCount: Schema.Number,
  expectedRecoveryAttemptCount: Schema.Number,
});

const BillingReconciliationWorkflowDispatchInputSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  scheduledAt: IsoTimestampSchema,
});

const BillingConvergenceWorkflowJobExecutionInputSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
});

const BillingConvergenceWorkflowJobRunInputSchema = Schema.Struct({
  now: Schema.optional(IsoTimestampSchema),
});

const ConvexAuthenticatedRequestOptionsSchema = Schema.Struct({
  authToken: Schema.optional(Schema.NonEmptyString),
});

export type ConvexHealthcheck = Schema.Schema.Type<
  typeof ConvexHealthcheckSchema
>;

export type ConvexScheduledWorkflowDispatch = Schema.Schema.Type<
  typeof ConvexScheduledWorkflowDispatchSchema
>;

export type BillingReconciliationWorkflowDispatchInput = Schema.Schema.Type<
  typeof BillingReconciliationWorkflowDispatchInputSchema
>;

export type BillingConvergenceWorkflowJobExecutionInput = Schema.Schema.Type<
  typeof BillingConvergenceWorkflowJobExecutionInputSchema
>;

export type BillingConvergenceWorkflowJobRunInput = Schema.Schema.Type<
  typeof BillingConvergenceWorkflowJobRunInputSchema
>;

export type ConvexAuthenticatedRequestOptions = Schema.Schema.Type<
  typeof ConvexAuthenticatedRequestOptionsSchema
>;

export type ConvexAdapterRequestError = {
  readonly _tag: "ConvexAdapterRequestError";
  readonly operation:
    | "scheduleBillingReconciliationWorkflowJob"
    | "runBillingConvergenceJob"
    | "recoverBillingConvergenceJob"
    | "runDueBillingConvergenceJobs";
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

export type ConvexWorkflowExecutionError =
  | ParseResult.ParseError
  | KeycloakAdapterRequestError
  | KeycloakPasswordGrantIdTokenMissingError
  | ConvexAdapterRequestError;

export type ConvexAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.convex;
  readonly deploymentUrl: string;
  readonly siteUrl: string;
  readonly healthcheck: Effect.Effect<ConvexHealthcheck>;
  readonly scheduleBillingReconciliationWorkflowJob: (
    input: BillingReconciliationWorkflowDispatchInput,
  ) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
};

export type AuthenticatedConvexWorkflowClient = {
  readonly scheduleBillingReconciliationWorkflowJob: (
    input: BillingReconciliationWorkflowDispatchInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
  readonly runBillingConvergenceJob: (
    input: BillingConvergenceWorkflowJobExecutionInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<null, ConvexWorkflowExecutionError>;
  readonly recoverBillingConvergenceJob: (
    input: BillingConvergenceWorkflowJobExecutionInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<null, ConvexWorkflowExecutionError>;
  readonly runDueBillingConvergenceJobs: (
    input?: BillingConvergenceWorkflowJobRunInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<WorkflowJobSummaryList, ConvexWorkflowExecutionError>;
};

export class ConvexAdapter extends Context.Tag("ConvexAdapter")<
  ConvexAdapter,
  ConvexAdapterService
>() {}

type ConvexAuthenticatedHttpClient = ConvexHttpClient & {
  readonly setAdminAuth: (token: string) => void;
  readonly setAuth: (token: string) => void;
  readonly setDebug: (enabled: boolean) => void;
};

const scheduleBillingReconciliationWorkflowJobMutation = makeFunctionReference<
  "mutation",
  BillingReconciliationWorkflowDispatchInput,
  ConvexScheduledWorkflowDispatch
>("workflowJobs:scheduleBillingReconciliationWorkflowJob");

const runBillingConvergenceJobAction = makeFunctionReference<
  "action",
  BillingConvergenceWorkflowJobExecutionInput,
  null
>("workflowJobRunner:runBillingConvergenceJob");

const recoverBillingConvergenceJobAction = makeFunctionReference<
  "action",
  BillingConvergenceWorkflowJobExecutionInput,
  null
>("workflowJobRunner:recoverBillingConvergenceJob");

const runDueBillingConvergenceJobsAction = makeFunctionReference<
  "action",
  BillingConvergenceWorkflowJobRunInput,
  WorkflowJobSummaryList
>("workflowJobRunner:runDueBillingConvergenceJobs");

const decodeAuthenticatedRequestOptions = Schema.decodeUnknown(
  ConvexAuthenticatedRequestOptionsSchema,
);

const decodeRunBillingConvergenceJobInput = Schema.decodeUnknown(
  BillingConvergenceWorkflowJobExecutionInputSchema,
);

const decodeRunDueBillingConvergenceJobsInput = Schema.decodeUnknown(
  BillingConvergenceWorkflowJobRunInputSchema,
);

const decodeWorkflowJobSummaryList = Schema.decodeUnknown(
  WorkflowJobSummaryListSchema,
);

const buildConvexAdapterRequestError = (
  operation: ConvexAdapterRequestError["operation"],
  cause: unknown,
): ConvexAdapterRequestError =>
  ({
    _tag: "ConvexAdapterRequestError",
    operation,
    cause,
    ...(typeof cause === "object" &&
    cause !== null &&
    "status" in cause &&
    typeof cause.status === "number"
      ? { status: cause.status }
      : {}),
    ...(typeof cause === "object" &&
    cause !== null &&
    "body" in cause &&
    typeof cause.body === "string"
      ? { body: cause.body }
      : {}),
  }) satisfies ConvexAdapterRequestError;

const createConvexHttpClient = (deploymentUrl: string) => {
  const convex = new ConvexHttpClient(deploymentUrl, {
    logger: false,
    skipConvexDeploymentUrlCheck: true,
  }) as ConvexAuthenticatedHttpClient;

  convex.setDebug(false);

  return convex;
};

export const makeAuthenticatedConvexWorkflowClient = (
  input: ConvexAdapterOptions,
) =>
  Schema.decodeUnknown(ConvexAdapterOptionsSchema)(input).pipe(
    Effect.flatMap((options) =>
      makeKeycloakAdapter({
        baseUrl: options.keycloakBaseUrl,
        realm: options.keycloakRealm,
        clientId: options.keycloakClientId,
        clientSecret: options.keycloakClientSecret,
      }).pipe(
        Effect.map((keycloak): AuthenticatedConvexWorkflowClient => {
          const resolveAuthToken = (
            requestOptions?: ConvexAuthenticatedRequestOptions,
          ) =>
            decodeAuthenticatedRequestOptions(requestOptions ?? {}).pipe(
              Effect.flatMap((decodedOptions) =>
                decodedOptions.authToken !== undefined
                  ? Effect.succeed(decodedOptions.authToken)
                  : keycloak.issueIdTokenWithPasswordGrant({
                      username: options.keycloakConvexServiceActorUsername,
                      password: options.keycloakConvexServiceActorPassword,
                    }),
              ),
            );

          const invokeAuthenticatedRequest = <A>(request: {
            readonly operation: ConvexAdapterRequestError["operation"];
            readonly authOptions?: ConvexAuthenticatedRequestOptions;
            readonly invoke: (
              client: ConvexAuthenticatedHttpClient,
            ) => Promise<A>;
          }) =>
            resolveAuthToken(request.authOptions).pipe(
              Effect.flatMap((authToken) =>
                Effect.tryPromise({
                  try: async () => {
                    const convex = createConvexHttpClient(
                      options.deploymentUrl,
                    );

                    convex.setAuth(authToken);

                    return await request.invoke(convex);
                  },
                  catch: (cause) =>
                    buildConvexAdapterRequestError(request.operation, cause),
                }),
              ),
            );

          return {
            scheduleBillingReconciliationWorkflowJob: (input, requestOptions) =>
              Schema.decodeUnknown(
                BillingReconciliationWorkflowDispatchInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "scheduleBillingReconciliationWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.mutation(
                        scheduleBillingReconciliationWorkflowJobMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  Schema.decodeUnknown(ConvexScheduledWorkflowDispatchSchema)(
                    payload,
                  ),
                ),
              ),
            runBillingConvergenceJob: (input, requestOptions) =>
              decodeRunBillingConvergenceJobInput(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "runBillingConvergenceJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        runBillingConvergenceJobAction,
                        request,
                      ),
                  }),
                ),
              ),
            recoverBillingConvergenceJob: (input, requestOptions) =>
              decodeRunBillingConvergenceJobInput(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "recoverBillingConvergenceJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        recoverBillingConvergenceJobAction,
                        request,
                      ),
                  }),
                ),
              ),
            runDueBillingConvergenceJobs: (input, requestOptions) =>
              decodeRunDueBillingConvergenceJobsInput(input ?? {}).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "runDueBillingConvergenceJobs",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        runDueBillingConvergenceJobsAction,
                        request,
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  decodeWorkflowJobSummaryList(payload),
                ),
              ),
          };
        }),
      ),
    ),
  );

export const makeConvexAdapter = (input: ConvexAdapterOptions) =>
  makeAuthenticatedConvexWorkflowClient(input).pipe(
    Effect.map(
      (workflowClient): ConvexAdapterService => ({
        serviceName: platformAdapterServiceName.convex,
        deploymentUrl: input.deploymentUrl,
        siteUrl: input.siteUrl,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.convex,
        }),
        scheduleBillingReconciliationWorkflowJob: (request) =>
          workflowClient.scheduleBillingReconciliationWorkflowJob(request),
      }),
    ),
  );

export const makeConvexAdapterLayer = (options: ConvexAdapterOptions) =>
  Layer.effect(ConvexAdapter, makeConvexAdapter(options));
