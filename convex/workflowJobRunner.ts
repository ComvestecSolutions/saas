"use node";

// Convex actions only support the default Convex runtime or Node.js today.

import { Effect, Schema } from "effect";
import {
  actionGeneric,
  internalActionGeneric,
  makeFunctionReference,
} from "convex/server";
import { v } from "convex/values";
import { type WorkflowJobSummary } from "@comvestec/contracts";
import {
  makeAuthenticatedConvexWorkflowClient,
  resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment,
  runSubscriberJourneyFromConvexEnvironment,
  type SubscriberJourneyService,
} from "@comvestec/platform";
import { type BillingConvergenceScheduler } from "./billingConvergenceScheduling";
import {
  requireWorkflowActorIdentity,
  toWorkflowActorIdentityBoundaryError,
  type WorkflowIdentity,
} from "./keycloakWorkflowIdentity";
import { buildSchedulerBackedConvexAdapter } from "./schedulerBackedConvexAdapter";

const ConvexRuntimeSystemEnvironmentSchema = Schema.Struct({
  CONVEX_CLOUD_URL: Schema.NonEmptyString,
  CONVEX_SITE_URL: Schema.NonEmptyString,
});

const decodeConvexRuntimeSystemEnvironment = Schema.decodeUnknown(
  ConvexRuntimeSystemEnvironmentSchema,
);

const runBillingConvergenceJobAction = makeFunctionReference<
  "action",
  {
    readonly jobId: string;
  },
  null
>("workflowJobRunner:runBillingConvergenceJob");

const recoverBillingConvergenceJobAction = makeFunctionReference<
  "action",
  {
    readonly jobId: string;
  },
  null
>("workflowJobRunner:recoverBillingConvergenceJob");

const runBillingConvergenceJobInternalAction = makeFunctionReference<
  "action",
  {
    readonly jobId: string;
  },
  null
>("workflowJobRunner:runBillingConvergenceJobInternal");

const recoverBillingConvergenceJobInternalAction = makeFunctionReference<
  "action",
  {
    readonly jobId: string;
  },
  null
>("workflowJobRunner:recoverBillingConvergenceJobInternal");

const workflowJobSummaryValidator = v.object({
  jobId: v.string(),
  sourceModuleId: v.string(),
  kind: v.string(),
  trigger: v.string(),
  status: v.string(),
  tenantScope: v.string(),
  tenantScopeId: v.string(),
  attempts: v.float64(),
  scheduledAt: v.string(),
  completedAt: v.optional(v.string()),
  gapReason: v.optional(v.string()),
});

const toConvexWorkflowJobSummary = (job: WorkflowJobSummary) => ({
  jobId: job.jobId,
  sourceModuleId: job.sourceModuleId,
  kind: job.kind,
  trigger: job.trigger,
  status: job.status,
  tenantScope: job.tenantScope,
  tenantScopeId: job.tenantScopeId,
  attempts: job.attempts,
  scheduledAt: job.scheduledAt,
  ...(job.completedAt !== undefined ? { completedAt: job.completedAt } : {}),
  ...(job.gapReason !== undefined ? { gapReason: job.gapReason } : {}),
});

const logAuthenticatedIdentity = (
  ctx: {
    readonly auth: {
      readonly getUserIdentity: () => Promise<WorkflowIdentity | null>;
    };
  },
  operation: string,
  metadata: Record<string, unknown>,
) =>
  Effect.promise(() => ctx.auth.getUserIdentity()).pipe(
    Effect.flatMap((identity) =>
      requireWorkflowActorIdentity(identity, operation),
    ),
    Effect.mapError(toWorkflowActorIdentityBoundaryError),
    Effect.map(({ identity, actorType }) => {
      console.log("convex.billing.workflow.identity", {
        operation,
        actorType,
        preferredUsername: identity.preferredUsername,
        subject: identity.subject,
        issuer: identity.issuer,
        tokenIdentifier: identity.tokenIdentifier,
        ...metadata,
      });

      return identity;
    }),
  );

const buildSchedulerBackedRuntimeAdapter = (input: {
  readonly scheduler: BillingConvergenceScheduler<
    | typeof runBillingConvergenceJobInternalAction
    | typeof recoverBillingConvergenceJobInternalAction
  >;
  readonly runtimeEnvironment: Schema.Schema.Type<
    typeof ConvexRuntimeSystemEnvironmentSchema
  >;
}) =>
  buildSchedulerBackedConvexAdapter({
    scheduler: input.scheduler,
    primaryFunctionReference: runBillingConvergenceJobInternalAction,
    recoveryFunctionReference: recoverBillingConvergenceJobInternalAction,
    deploymentUrl: input.runtimeEnvironment.CONVEX_CLOUD_URL,
    siteUrl: input.runtimeEnvironment.CONVEX_SITE_URL,
  });

type BillingConvergenceJobOperation =
  | "runBillingConvergenceJob"
  | "recoverBillingConvergenceJob";

const runAuthenticatedSubscriberJourney = <A, E>(input: {
  readonly scheduler: BillingConvergenceScheduler<
    | typeof runBillingConvergenceJobInternalAction
    | typeof recoverBillingConvergenceJobInternalAction
  >;
  readonly use: (service: SubscriberJourneyService) => Effect.Effect<A, E>;
}) =>
  decodeConvexRuntimeSystemEnvironment(process.env).pipe(
    Effect.flatMap((runtimeEnvironment) =>
      runSubscriberJourneyFromConvexEnvironment(
        process.env,
        buildSchedulerBackedRuntimeAdapter({
          scheduler: input.scheduler,
          runtimeEnvironment,
        }),
        input.use,
      ),
    ),
  );

const buildAuthenticatedWorkflowClient = () =>
  Effect.all({
    runtimeEnvironment: decodeConvexRuntimeSystemEnvironment(process.env),
    subscriberJourneyEnvironment:
      resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment(process.env),
  }).pipe(
    Effect.flatMap(({ runtimeEnvironment, subscriberJourneyEnvironment }) =>
      makeAuthenticatedConvexWorkflowClient({
        deploymentUrl: runtimeEnvironment.CONVEX_CLOUD_URL,
        siteUrl: runtimeEnvironment.CONVEX_SITE_URL,
        keycloakBaseUrl: subscriberJourneyEnvironment.keycloakBaseUrl,
        keycloakRealm: subscriberJourneyEnvironment.keycloakRealm,
        keycloakClientId: subscriberJourneyEnvironment.keycloakClientId,
        keycloakClientSecret: subscriberJourneyEnvironment.keycloakClientSecret,
        keycloakConvexServiceActorUsername:
          subscriberJourneyEnvironment.keycloakConvexServiceActorUsername,
        keycloakConvexServiceActorPassword:
          subscriberJourneyEnvironment.keycloakConvexServiceActorPassword,
      }),
    ),
  );

const buildBillingConvergenceJobHandler =
  (operation: BillingConvergenceJobOperation) =>
  async (
    ctx: {
      readonly scheduler: BillingConvergenceScheduler<
        | typeof runBillingConvergenceJobInternalAction
        | typeof recoverBillingConvergenceJobInternalAction
      >;
      readonly auth: {
        readonly getUserIdentity: () => Promise<null | {
          readonly subject?: string;
          readonly issuer?: string;
          readonly tokenIdentifier?: string;
        }>;
      };
    },
    args: {
      readonly jobId: string;
    },
  ): Promise<null> => {
    await Effect.runPromise(
      logAuthenticatedIdentity(ctx, operation, {
        jobId: args.jobId,
      }),
    );

    await Effect.runPromise(
      runAuthenticatedSubscriberJourney({
        scheduler: ctx.scheduler as BillingConvergenceScheduler<
          | typeof runBillingConvergenceJobInternalAction
          | typeof recoverBillingConvergenceJobInternalAction
        >,
        use: (service) =>
          service
            .runBillingConvergenceJob({
              jobId: args.jobId,
            })
            .pipe(Effect.as(null)),
      }),
    );

    return null;
  };

export const runBillingConvergenceJob = actionGeneric({
  args: {
    jobId: v.string(),
  },
  returns: v.null(),
  handler: buildBillingConvergenceJobHandler("runBillingConvergenceJob"),
});

export const recoverBillingConvergenceJob = actionGeneric({
  args: {
    jobId: v.string(),
  },
  returns: v.null(),
  handler: buildBillingConvergenceJobHandler("recoverBillingConvergenceJob"),
});

export const runDueBillingConvergenceJobs = actionGeneric({
  args: {
    now: v.optional(v.string()),
  },
  returns: v.array(workflowJobSummaryValidator),
  handler: async (ctx, args) => {
    await Effect.runPromise(
      logAuthenticatedIdentity(ctx, "runDueBillingConvergenceJobs", {
        ...(args.now !== undefined ? { now: args.now } : {}),
      }),
    );

    const jobs = await Effect.runPromise(
      runAuthenticatedSubscriberJourney({
        scheduler: ctx.scheduler as BillingConvergenceScheduler<
          | typeof runBillingConvergenceJobInternalAction
          | typeof recoverBillingConvergenceJobInternalAction
        >,
        use: (service) =>
          service.runDueBillingConvergenceJobs(
            args.now === undefined ? undefined : { now: args.now },
          ),
      }),
    );

    return Array.from(jobs, toConvexWorkflowJobSummary);
  },
});

const runBillingConvergenceJobHandler = async (
  _ctx: unknown,
  args: {
    readonly jobId: string;
  },
): Promise<null> => {
  const workflowClient = await Effect.runPromise(
    buildAuthenticatedWorkflowClient(),
  );

  await Effect.runPromise(
    workflowClient.runBillingConvergenceJob({
      jobId: args.jobId,
    }),
  );

  return null;
};

export const runBillingConvergenceJobInternal = internalActionGeneric({
  args: {
    jobId: v.string(),
  },
  returns: v.null(),
  handler: runBillingConvergenceJobHandler,
});

export const recoverBillingConvergenceJobInternal = internalActionGeneric({
  args: {
    jobId: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const workflowClient = await Effect.runPromise(
      buildAuthenticatedWorkflowClient(),
    );

    await Effect.runPromise(
      workflowClient.recoverBillingConvergenceJob({
        jobId: args.jobId,
      }),
    );

    return null;
  },
});

export const runDueBillingConvergenceJobsInternal = internalActionGeneric({
  args: {
    now: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const workflowClient = await Effect.runPromise(
      buildAuthenticatedWorkflowClient(),
    );

    await Effect.runPromise(
      workflowClient
        .runDueBillingConvergenceJobs(
          args.now === undefined ? undefined : { now: args.now },
        )
        .pipe(Effect.as(null)),
    );

    return null;
  },
});
