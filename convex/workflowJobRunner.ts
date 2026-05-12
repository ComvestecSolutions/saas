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
import { type BillingConvergenceScheduler } from "./billingConvergenceScheduling";
import {
  requireWorkflowActorIdentity,
  toWorkflowActorIdentityBoundaryError,
  type WorkflowIdentity,
} from "./keycloakWorkflowIdentity";
import { buildSchedulerBackedConvexAdapter } from "./schedulerBackedConvexAdapter";

type SubscriberJourneyService =
  import("../packages/platform/src/services/domains/subscriber-journey").SubscriberJourneyService;

type PlatformWorkflowRuntime = {
  readonly makeAuthenticatedConvexWorkflowClient: typeof import("../packages/platform/src/adapters/storage/convex").makeAuthenticatedConvexWorkflowClient;
  readonly resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment: typeof import("../packages/platform/src/services/domains/subscriber-journey").resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment;
  readonly runSubscriberJourneyFromConvexEnvironment: typeof import("../packages/platform/src/services/domains/subscriber-journey").runSubscriberJourneyFromConvexEnvironment;
  readonly runImportExportFromEnvironment: typeof import("../packages/platform/src/services/domains/import-export").runImportExportFromEnvironment;
  readonly runSearchFromConvexEnvironment: typeof import("../packages/platform/src/services/domains/search").runSearchFromConvexEnvironment;
  readonly runNotificationCenterEmailDigestWorkflowJobFromEnvironment: typeof import("../packages/platform/src/services/communication/notification-center").runNotificationCenterEmailDigestWorkflowJobFromEnvironment;
  readonly runWebhookOutboundDeliveryWorkflowJobFromEnvironment: typeof import("../packages/platform/src/services/communication/webhooks-api-access").runWebhookOutboundDeliveryWorkflowJobFromEnvironment;
  readonly runAdminTenantInvitationReminderWorkflowJobFromEnvironment: typeof import("../packages/platform/src/services/domains/admin-tenant-management").runAdminTenantInvitationReminderWorkflowJobFromEnvironment;
  readonly runAdminTenantInvitationExpiryNotificationWorkflowJobFromEnvironment: typeof import("../packages/platform/src/services/domains/admin-tenant-management").runAdminTenantInvitationExpiryNotificationWorkflowJobFromEnvironment;
};

const loadPlatformWorkflowRuntime = (() => {
  let runtimePromise: Promise<PlatformWorkflowRuntime> | undefined;

  return () => {
    runtimePromise ??= Promise.all([
      import("../packages/platform/src/adapters/storage/convex"),
      import("../packages/platform/src/services/domains/subscriber-journey"),
      import("../packages/platform/src/services/domains/import-export"),
      import("../packages/platform/src/services/domains/search"),
      import("../packages/platform/src/services/communication/notification-center"),
      import("../packages/platform/src/services/communication/webhooks-api-access"),
      import("../packages/platform/src/services/domains/admin-tenant-management"),
    ]).then(
      ([
        convex,
        subscriberJourney,
        importExport,
        search,
        notificationCenter,
        webhooksApiAccess,
        adminTenantManagement,
      ]) =>
        ({
          makeAuthenticatedConvexWorkflowClient:
            convex.makeAuthenticatedConvexWorkflowClient,
          resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment:
            subscriberJourney.resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment,
          runSubscriberJourneyFromConvexEnvironment:
            subscriberJourney.runSubscriberJourneyFromConvexEnvironment,
          runImportExportFromEnvironment:
            importExport.runImportExportFromEnvironment,
          runSearchFromConvexEnvironment: search.runSearchFromConvexEnvironment,
          runNotificationCenterEmailDigestWorkflowJobFromEnvironment:
            notificationCenter.runNotificationCenterEmailDigestWorkflowJobFromEnvironment,
          runWebhookOutboundDeliveryWorkflowJobFromEnvironment:
            webhooksApiAccess.runWebhookOutboundDeliveryWorkflowJobFromEnvironment,
          runAdminTenantInvitationReminderWorkflowJobFromEnvironment:
            adminTenantManagement.runAdminTenantInvitationReminderWorkflowJobFromEnvironment,
          runAdminTenantInvitationExpiryNotificationWorkflowJobFromEnvironment:
            adminTenantManagement.runAdminTenantInvitationExpiryNotificationWorkflowJobFromEnvironment,
        }) satisfies PlatformWorkflowRuntime,
    );

    return runtimePromise;
  };
})();

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

const runSearchTenantIndexEnsureWorkflowJobAction = makeFunctionReference<
  "action",
  {
    readonly jobId: string;
  },
  null
>("workflowJobRunner:runSearchTenantIndexEnsureWorkflowJob");

const runImportExportManagedFileSummaryWorkflowJobAction =
  makeFunctionReference<
    "action",
    {
      readonly jobId: string;
    },
    null
  >("workflowJobRunner:runImportExportManagedFileSummaryWorkflowJob");

const runImportExportSupportCaseSummaryWorkflowJobAction =
  makeFunctionReference<
    "action",
    {
      readonly jobId: string;
    },
    null
  >("workflowJobRunner:runImportExportSupportCaseSummaryWorkflowJob");

const runNotificationCenterEmailDigestWorkflowJobAction = makeFunctionReference<
  "action",
  {
    readonly jobId: string;
  },
  null
>("workflowJobRunner:runNotificationCenterEmailDigestWorkflowJob");

const runSearchTenantIndexEnsureWorkflowJobInternalAction =
  makeFunctionReference<
    "action",
    {
      readonly jobId: string;
    },
    null
  >("workflowJobRunner:runSearchTenantIndexEnsureWorkflowJobInternal");

const runImportExportManagedFileSummaryWorkflowJobInternalAction =
  makeFunctionReference<
    "action",
    {
      readonly jobId: string;
    },
    null
  >("workflowJobRunner:runImportExportManagedFileSummaryWorkflowJobInternal");

const runImportExportSupportCaseSummaryWorkflowJobInternalAction =
  makeFunctionReference<
    "action",
    {
      readonly jobId: string;
    },
    null
  >("workflowJobRunner:runImportExportSupportCaseSummaryWorkflowJobInternal");

const runNotificationCenterEmailDigestWorkflowJobInternalAction =
  makeFunctionReference<
    "action",
    {
      readonly jobId: string;
    },
    null
  >("workflowJobRunner:runNotificationCenterEmailDigestWorkflowJobInternal");

const runWebhookOutboundDeliveryWorkflowJobInternalAction =
  makeFunctionReference<
    "action",
    {
      readonly jobId: string;
    },
    null
  >("workflowJobRunner:runWebhookOutboundDeliveryWorkflowJobInternal");

const runTenantInvitationReminderWorkflowJobAction = makeFunctionReference<
  "action",
  {
    readonly jobId: string;
  },
  null
>("workflowJobRunner:runTenantInvitationReminderWorkflowJob");

const runTenantInvitationReminderWorkflowJobInternalAction =
  makeFunctionReference<
    "action",
    {
      readonly jobId: string;
    },
    null
  >("workflowJobRunner:runTenantInvitationReminderWorkflowJobInternal");

const runTenantInvitationExpiryNotificationWorkflowJobAction =
  makeFunctionReference<
    "action",
    {
      readonly jobId: string;
    },
    null
  >("workflowJobRunner:runTenantInvitationExpiryNotificationWorkflowJob");

const runTenantInvitationExpiryNotificationWorkflowJobInternalAction =
  makeFunctionReference<
    "action",
    {
      readonly jobId: string;
    },
    null
  >(
    "workflowJobRunner:runTenantInvitationExpiryNotificationWorkflowJobInternal",
  );

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
      console.log("convex.workflow.identity", {
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
  Effect.tryPromise(loadPlatformWorkflowRuntime).pipe(
    Effect.flatMap(({ runSubscriberJourneyFromConvexEnvironment }) =>
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
      ),
    ),
  );

const buildAuthenticatedWorkflowClient = () =>
  Effect.tryPromise(loadPlatformWorkflowRuntime).pipe(
    Effect.flatMap(
      ({
        makeAuthenticatedConvexWorkflowClient,
        resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment,
      }) =>
        Effect.all({
          runtimeEnvironment: decodeConvexRuntimeSystemEnvironment(process.env),
          subscriberJourneyEnvironment:
            resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment(
              process.env,
            ),
        }).pipe(
          Effect.flatMap(
            ({ runtimeEnvironment, subscriberJourneyEnvironment }) =>
              makeAuthenticatedConvexWorkflowClient({
                deploymentUrl: runtimeEnvironment.CONVEX_CLOUD_URL,
                siteUrl: runtimeEnvironment.CONVEX_SITE_URL,
                keycloakBaseUrl: subscriberJourneyEnvironment.keycloakBaseUrl,
                keycloakRealm: subscriberJourneyEnvironment.keycloakRealm,
                keycloakClientId: subscriberJourneyEnvironment.keycloakClientId,
                keycloakClientSecret:
                  subscriberJourneyEnvironment.keycloakClientSecret,
                keycloakConvexServiceActorUsername:
                  subscriberJourneyEnvironment.keycloakConvexServiceActorUsername,
                keycloakConvexServiceActorPassword:
                  subscriberJourneyEnvironment.keycloakConvexServiceActorPassword,
              }),
          ),
        ),
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

export const runSearchTenantIndexEnsureWorkflowJob = actionGeneric({
  args: {
    jobId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { runSearchFromConvexEnvironment } =
      await loadPlatformWorkflowRuntime();

    await Effect.runPromise(
      logAuthenticatedIdentity(ctx, "runSearchTenantIndexEnsureWorkflowJob", {
        jobId: args.jobId,
      }),
    );

    await Effect.runPromise(
      runSearchFromConvexEnvironment(process.env, (service) =>
        service
          .runSearchTenantIndexEnsureWorkflowJob({
            jobId: args.jobId,
          })
          .pipe(Effect.as(null)),
      ),
    );

    return null;
  },
});

export const runImportExportManagedFileSummaryWorkflowJob = actionGeneric({
  args: {
    jobId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { runImportExportFromEnvironment } =
      await loadPlatformWorkflowRuntime();

    await Effect.runPromise(
      logAuthenticatedIdentity(
        ctx,
        "runImportExportManagedFileSummaryWorkflowJob",
        {
          jobId: args.jobId,
        },
      ),
    );

    await Effect.runPromise(
      runImportExportFromEnvironment(process.env, (service) =>
        service
          .runImportExportManagedFileSummaryWorkflowJob({
            jobId: args.jobId,
          })
          .pipe(Effect.as(null)),
      ),
    );

    return null;
  },
});

export const runImportExportSupportCaseSummaryWorkflowJob = actionGeneric({
  args: {
    jobId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { runImportExportFromEnvironment } =
      await loadPlatformWorkflowRuntime();

    await Effect.runPromise(
      logAuthenticatedIdentity(
        ctx,
        "runImportExportSupportCaseSummaryWorkflowJob",
        {
          jobId: args.jobId,
        },
      ),
    );

    await Effect.runPromise(
      runImportExportFromEnvironment(process.env, (service) =>
        service
          .runImportExportSupportCaseSummaryWorkflowJob({
            jobId: args.jobId,
          })
          .pipe(Effect.as(null)),
      ),
    );

    return null;
  },
});

export const runNotificationCenterEmailDigestWorkflowJob = actionGeneric({
  args: {
    jobId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { runNotificationCenterEmailDigestWorkflowJobFromEnvironment } =
      await loadPlatformWorkflowRuntime();

    await Effect.runPromise(
      logAuthenticatedIdentity(
        ctx,
        "runNotificationCenterEmailDigestWorkflowJob",
        {
          jobId: args.jobId,
        },
      ),
    );

    await Effect.runPromise(
      runNotificationCenterEmailDigestWorkflowJobFromEnvironment(process.env, {
        jobId: args.jobId,
      }).pipe(Effect.as(null)),
    );

    return null;
  },
});

export const runWebhookOutboundDeliveryWorkflowJob = actionGeneric({
  args: {
    jobId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { runWebhookOutboundDeliveryWorkflowJobFromEnvironment } =
      await loadPlatformWorkflowRuntime();

    await Effect.runPromise(
      logAuthenticatedIdentity(ctx, "runWebhookOutboundDeliveryWorkflowJob", {
        jobId: args.jobId,
      }),
    );

    await Effect.runPromise(
      runWebhookOutboundDeliveryWorkflowJobFromEnvironment(process.env, {
        jobId: args.jobId,
      }).pipe(Effect.as(null)),
    );

    return null;
  },
});

const buildTenantInvitationWorkflowJobHandler =
  (
    operation:
      | "runTenantInvitationReminderWorkflowJob"
      | "runTenantInvitationExpiryNotificationWorkflowJob",
    runFromEnvironment: (
      environment: unknown,
      input: { readonly jobId: string },
    ) => Effect.Effect<unknown, unknown>,
  ) =>
  async (
    ctx: {
      readonly auth: {
        readonly getUserIdentity: () => Promise<WorkflowIdentity | null>;
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
      runFromEnvironment(process.env, {
        jobId: args.jobId,
      }).pipe(Effect.as(null)),
    );

    return null;
  };

export const runTenantInvitationReminderWorkflowJob = actionGeneric({
  args: {
    jobId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { runAdminTenantInvitationReminderWorkflowJobFromEnvironment } =
      await loadPlatformWorkflowRuntime();

    return buildTenantInvitationWorkflowJobHandler(
      "runTenantInvitationReminderWorkflowJob",
      runAdminTenantInvitationReminderWorkflowJobFromEnvironment,
    )(ctx, args);
  },
});

export const runTenantInvitationExpiryNotificationWorkflowJob = actionGeneric({
  args: {
    jobId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const {
      runAdminTenantInvitationExpiryNotificationWorkflowJobFromEnvironment,
    } = await loadPlatformWorkflowRuntime();

    return buildTenantInvitationWorkflowJobHandler(
      "runTenantInvitationExpiryNotificationWorkflowJob",
      runAdminTenantInvitationExpiryNotificationWorkflowJobFromEnvironment,
    )(ctx, args);
  },
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

export const runSearchTenantIndexEnsureWorkflowJobInternal =
  internalActionGeneric({
    args: {
      jobId: v.string(),
    },
    returns: v.null(),
    handler: async (_ctx, args) => {
      const workflowClient = await Effect.runPromise(
        buildAuthenticatedWorkflowClient(),
      );

      await Effect.runPromise(
        workflowClient.runSearchTenantIndexEnsureWorkflowJob({
          jobId: args.jobId,
        }),
      );

      return null;
    },
  });

export const runImportExportManagedFileSummaryWorkflowJobInternal =
  internalActionGeneric({
    args: {
      jobId: v.string(),
    },
    returns: v.null(),
    handler: async (_ctx, args) => {
      const workflowClient = await Effect.runPromise(
        buildAuthenticatedWorkflowClient(),
      );

      await Effect.runPromise(
        workflowClient.runImportExportManagedFileSummaryWorkflowJob({
          jobId: args.jobId,
        }),
      );

      return null;
    },
  });

export const runImportExportSupportCaseSummaryWorkflowJobInternal =
  internalActionGeneric({
    args: {
      jobId: v.string(),
    },
    returns: v.null(),
    handler: async (_ctx, args) => {
      const workflowClient = await Effect.runPromise(
        buildAuthenticatedWorkflowClient(),
      );

      await Effect.runPromise(
        workflowClient.runImportExportSupportCaseSummaryWorkflowJob({
          jobId: args.jobId,
        }),
      );

      return null;
    },
  });

export const runNotificationCenterEmailDigestWorkflowJobInternal =
  internalActionGeneric({
    args: {
      jobId: v.string(),
    },
    returns: v.null(),
    handler: async (_ctx, args) => {
      const workflowClient = await Effect.runPromise(
        buildAuthenticatedWorkflowClient(),
      );

      await Effect.runPromise(
        Effect.fromNullable(
          workflowClient.runNotificationCenterEmailDigestWorkflowJob,
        ).pipe(
          Effect.orElseFail(
            () =>
              new Error(
                "Authenticated Convex workflow client does not support notification-center digest execution.",
              ),
          ),
          Effect.flatMap((runWorkflowJob) =>
            runWorkflowJob({
              jobId: args.jobId,
            }),
          ),
        ),
      );

      return null;
    },
  });

export const runWebhookOutboundDeliveryWorkflowJobInternal =
  internalActionGeneric({
    args: {
      jobId: v.string(),
    },
    returns: v.null(),
    handler: async (_ctx, args) => {
      const workflowClient = await Effect.runPromise(
        buildAuthenticatedWorkflowClient(),
      );

      await Effect.runPromise(
        workflowClient.runWebhookOutboundDeliveryWorkflowJob({
          jobId: args.jobId,
        }),
      );

      return null;
    },
  });

export const runTenantInvitationReminderWorkflowJobInternal =
  internalActionGeneric({
    args: {
      jobId: v.string(),
    },
    returns: v.null(),
    handler: async (_ctx, args) => {
      const workflowClient = await Effect.runPromise(
        buildAuthenticatedWorkflowClient(),
      );

      await Effect.runPromise(
        workflowClient.runTenantInvitationReminderWorkflowJob({
          jobId: args.jobId,
        }),
      );

      return null;
    },
  });

export const runTenantInvitationExpiryNotificationWorkflowJobInternal =
  internalActionGeneric({
    args: {
      jobId: v.string(),
    },
    returns: v.null(),
    handler: async (_ctx, args) => {
      const workflowClient = await Effect.runPromise(
        buildAuthenticatedWorkflowClient(),
      );

      await Effect.runPromise(
        workflowClient.runTenantInvitationExpiryNotificationWorkflowJob({
          jobId: args.jobId,
        }),
      );

      return null;
    },
  });
