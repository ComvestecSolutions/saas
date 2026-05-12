import { Effect } from "effect";
import { actorType } from "@comvestec/contracts";
import { makeFunctionReference, mutationGeneric } from "convex/server";
import { v } from "convex/values";
import {
  scheduleBillingConvergenceDispatchPlan,
  toBillingConvergenceSchedulingBoundaryError,
} from "./billingConvergenceScheduling";
import {
  scheduleWorkflowJobDispatchPlan,
  toWorkflowJobSchedulingBoundaryError,
} from "./workflowScheduling";
import {
  requireWorkflowActorIdentity,
  toWorkflowActorIdentityBoundaryError,
} from "./keycloakWorkflowIdentity";

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

const runTenantInvitationReminderWorkflowJobInternalAction =
  makeFunctionReference<
    "action",
    {
      readonly jobId: string;
    },
    null
  >("workflowJobRunner:runTenantInvitationReminderWorkflowJobInternal");

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

export const scheduleBillingReconciliationWorkflowJob = mutationGeneric({
  args: {
    jobId: v.string(),
    scheduledAt: v.string(),
  },
  returns: v.object({
    scheduledFunctionId: v.string(),
    scheduledFunctionIds: v.array(v.string()),
    primaryScheduled: v.boolean(),
    scheduledRecoveryAttemptCount: v.float64(),
    expectedRecoveryAttemptCount: v.float64(),
  }),
  handler: async (ctx, args) => {
    const { identity, actorType } = await Effect.runPromise(
      Effect.promise(() => ctx.auth.getUserIdentity()).pipe(
        Effect.flatMap((identity) =>
          requireWorkflowActorIdentity(
            identity,
            "Billing reconciliation workflow scheduling",
          ),
        ),
        Effect.mapError(toWorkflowActorIdentityBoundaryError),
      ),
    );

    console.log("convex.billing.schedule.identity", {
      jobId: args.jobId,
      actorType,
      preferredUsername: identity.preferredUsername,
      subject: identity.subject,
      issuer: identity.issuer,
      tokenIdentifier: identity.tokenIdentifier,
    });

    const dispatchPlan = await Effect.runPromise(
      scheduleBillingConvergenceDispatchPlan({
        scheduler: ctx.scheduler,
        primaryFunctionReference: runBillingConvergenceJobInternalAction,
        recoveryFunctionReference: recoverBillingConvergenceJobInternalAction,
        jobId: args.jobId,
        scheduledAt: args.scheduledAt,
      }).pipe(Effect.mapError(toBillingConvergenceSchedulingBoundaryError)),
    );

    return dispatchPlan;
  },
});

export const scheduleSearchTenantIndexEnsureWorkflowJob = mutationGeneric({
  args: {
    jobId: v.string(),
    scheduledAt: v.string(),
  },
  returns: v.object({
    scheduledFunctionId: v.string(),
    scheduledFunctionIds: v.array(v.string()),
    primaryScheduled: v.boolean(),
    scheduledRecoveryAttemptCount: v.float64(),
    expectedRecoveryAttemptCount: v.float64(),
  }),
  handler: async (ctx, args) => {
    const { identity, actorType } = await Effect.runPromise(
      Effect.promise(() => ctx.auth.getUserIdentity()).pipe(
        Effect.flatMap((identity) =>
          requireWorkflowActorIdentity(
            identity,
            "Search tenant index ensure workflow scheduling",
          ),
        ),
        Effect.mapError(toWorkflowActorIdentityBoundaryError),
      ),
    );

    console.log("convex.search.schedule.identity", {
      jobId: args.jobId,
      actorType,
      preferredUsername: identity.preferredUsername,
      subject: identity.subject,
      issuer: identity.issuer,
      tokenIdentifier: identity.tokenIdentifier,
    });

    return await Effect.runPromise(
      scheduleWorkflowJobDispatchPlan({
        scheduler: ctx.scheduler,
        primaryFunctionReference:
          runSearchTenantIndexEnsureWorkflowJobInternalAction,
        recoveryFunctionReference:
          runSearchTenantIndexEnsureWorkflowJobInternalAction,
        jobId: args.jobId,
        scheduledAt: args.scheduledAt,
      }).pipe(Effect.mapError(toWorkflowJobSchedulingBoundaryError)),
    );
  },
});

export const scheduleImportExportManagedFileSummaryWorkflowJob =
  mutationGeneric({
    args: {
      jobId: v.string(),
      scheduledAt: v.string(),
    },
    returns: v.object({
      scheduledFunctionId: v.string(),
      scheduledFunctionIds: v.array(v.string()),
      primaryScheduled: v.boolean(),
      scheduledRecoveryAttemptCount: v.float64(),
      expectedRecoveryAttemptCount: v.float64(),
    }),
    handler: async (ctx, args) => {
      const { identity, actorType } = await Effect.runPromise(
        Effect.promise(() => ctx.auth.getUserIdentity()).pipe(
          Effect.flatMap((identity) =>
            requireWorkflowActorIdentity(
              identity,
              "Import-export managed-file summary workflow scheduling",
            ),
          ),
          Effect.mapError(toWorkflowActorIdentityBoundaryError),
        ),
      );

      console.log("convex.importExport.schedule.identity", {
        jobId: args.jobId,
        actorType,
        preferredUsername: identity.preferredUsername,
        subject: identity.subject,
        issuer: identity.issuer,
        tokenIdentifier: identity.tokenIdentifier,
      });

      return await Effect.runPromise(
        scheduleWorkflowJobDispatchPlan({
          scheduler: ctx.scheduler,
          primaryFunctionReference:
            runImportExportManagedFileSummaryWorkflowJobInternalAction,
          recoveryFunctionReference:
            runImportExportManagedFileSummaryWorkflowJobInternalAction,
          jobId: args.jobId,
          scheduledAt: args.scheduledAt,
        }).pipe(Effect.mapError(toWorkflowJobSchedulingBoundaryError)),
      );
    },
  });

export const scheduleImportExportSupportCaseSummaryWorkflowJob =
  mutationGeneric({
    args: {
      jobId: v.string(),
      scheduledAt: v.string(),
    },
    returns: v.object({
      scheduledFunctionId: v.string(),
      scheduledFunctionIds: v.array(v.string()),
      primaryScheduled: v.boolean(),
      scheduledRecoveryAttemptCount: v.float64(),
      expectedRecoveryAttemptCount: v.float64(),
    }),
    handler: async (ctx, args) => {
      const { identity, actorType } = await Effect.runPromise(
        Effect.promise(() => ctx.auth.getUserIdentity()).pipe(
          Effect.flatMap((identity) =>
            requireWorkflowActorIdentity(
              identity,
              "Import-export support-case summary workflow scheduling",
            ),
          ),
          Effect.mapError(toWorkflowActorIdentityBoundaryError),
        ),
      );

      console.log("convex.importExport.schedule.identity", {
        jobId: args.jobId,
        actorType,
        preferredUsername: identity.preferredUsername,
        subject: identity.subject,
        issuer: identity.issuer,
        tokenIdentifier: identity.tokenIdentifier,
      });

      return await Effect.runPromise(
        scheduleWorkflowJobDispatchPlan({
          scheduler: ctx.scheduler,
          primaryFunctionReference:
            runImportExportSupportCaseSummaryWorkflowJobInternalAction,
          recoveryFunctionReference:
            runImportExportSupportCaseSummaryWorkflowJobInternalAction,
          jobId: args.jobId,
          scheduledAt: args.scheduledAt,
        }).pipe(Effect.mapError(toWorkflowJobSchedulingBoundaryError)),
      );
    },
  });

export const scheduleNotificationCenterEmailDigestWorkflowJob = mutationGeneric(
  {
    args: {
      jobId: v.string(),
      scheduledAt: v.string(),
    },
    returns: v.object({
      scheduledFunctionId: v.string(),
      scheduledFunctionIds: v.array(v.string()),
      primaryScheduled: v.boolean(),
      scheduledRecoveryAttemptCount: v.float64(),
      expectedRecoveryAttemptCount: v.float64(),
    }),
    handler: async (ctx, args) => {
      const { identity, actorType } = await Effect.runPromise(
        Effect.promise(() => ctx.auth.getUserIdentity()).pipe(
          Effect.flatMap((identity) =>
            requireWorkflowActorIdentity(
              identity,
              "Notification-center email digest workflow scheduling",
            ),
          ),
          Effect.mapError(toWorkflowActorIdentityBoundaryError),
        ),
      );

      console.log("convex.notificationCenter.digest.schedule.identity", {
        jobId: args.jobId,
        actorType,
        preferredUsername: identity.preferredUsername,
        subject: identity.subject,
        issuer: identity.issuer,
        tokenIdentifier: identity.tokenIdentifier,
      });

      return await Effect.runPromise(
        scheduleWorkflowJobDispatchPlan({
          scheduler: ctx.scheduler,
          primaryFunctionReference:
            runNotificationCenterEmailDigestWorkflowJobInternalAction,
          recoveryFunctionReference:
            runNotificationCenterEmailDigestWorkflowJobInternalAction,
          jobId: args.jobId,
          scheduledAt: args.scheduledAt,
        }).pipe(Effect.mapError(toWorkflowJobSchedulingBoundaryError)),
      );
    },
  },
);

export const scheduleWebhookOutboundDeliveryWorkflowJob = mutationGeneric({
  args: {
    jobId: v.string(),
    scheduledAt: v.string(),
  },
  returns: v.object({
    scheduledFunctionId: v.string(),
    scheduledFunctionIds: v.array(v.string()),
    primaryScheduled: v.boolean(),
    scheduledRecoveryAttemptCount: v.float64(),
    expectedRecoveryAttemptCount: v.float64(),
  }),
  handler: async (ctx, args) => {
    const { identity, actorType } = await Effect.runPromise(
      Effect.promise(() => ctx.auth.getUserIdentity()).pipe(
        Effect.flatMap((identity) =>
          requireWorkflowActorIdentity(
            identity,
            "Webhook outbound delivery workflow scheduling",
          ),
        ),
        Effect.mapError(toWorkflowActorIdentityBoundaryError),
      ),
    );

    console.log("convex.webhooks.delivery.schedule.identity", {
      jobId: args.jobId,
      actorType,
      preferredUsername: identity.preferredUsername,
      subject: identity.subject,
      issuer: identity.issuer,
      tokenIdentifier: identity.tokenIdentifier,
    });

    return await Effect.runPromise(
      scheduleWorkflowJobDispatchPlan({
        scheduler: ctx.scheduler,
        primaryFunctionReference:
          runWebhookOutboundDeliveryWorkflowJobInternalAction,
        recoveryFunctionReference:
          runWebhookOutboundDeliveryWorkflowJobInternalAction,
        jobId: args.jobId,
        scheduledAt: args.scheduledAt,
      }).pipe(Effect.mapError(toWorkflowJobSchedulingBoundaryError)),
    );
  },
});

export const scheduleTenantInvitationReminderWorkflowJob = mutationGeneric({
  args: {
    jobId: v.string(),
    scheduledAt: v.string(),
  },
  returns: v.object({
    scheduledFunctionId: v.string(),
    scheduledFunctionIds: v.array(v.string()),
    primaryScheduled: v.boolean(),
    scheduledRecoveryAttemptCount: v.float64(),
    expectedRecoveryAttemptCount: v.float64(),
  }),
  handler: async (ctx, args) => {
    const { identity, actorType } = await Effect.runPromise(
      Effect.promise(() => ctx.auth.getUserIdentity()).pipe(
        Effect.flatMap((identity) =>
          requireWorkflowActorIdentity(
            identity,
            "Tenant invitation reminder workflow scheduling",
          ),
        ),
        Effect.mapError(toWorkflowActorIdentityBoundaryError),
      ),
    );

    console.log("convex.tenantInvitation.reminder.schedule.identity", {
      jobId: args.jobId,
      actorType,
      preferredUsername: identity.preferredUsername,
      subject: identity.subject,
      issuer: identity.issuer,
      tokenIdentifier: identity.tokenIdentifier,
    });

    return await Effect.runPromise(
      scheduleWorkflowJobDispatchPlan({
        scheduler: ctx.scheduler,
        primaryFunctionReference:
          runTenantInvitationReminderWorkflowJobInternalAction,
        recoveryFunctionReference:
          runTenantInvitationReminderWorkflowJobInternalAction,
        jobId: args.jobId,
        scheduledAt: args.scheduledAt,
      }).pipe(Effect.mapError(toWorkflowJobSchedulingBoundaryError)),
    );
  },
});

export const scheduleTenantInvitationExpiryNotificationWorkflowJob =
  mutationGeneric({
    args: {
      jobId: v.string(),
      scheduledAt: v.string(),
    },
    returns: v.object({
      scheduledFunctionId: v.string(),
      scheduledFunctionIds: v.array(v.string()),
      primaryScheduled: v.boolean(),
      scheduledRecoveryAttemptCount: v.float64(),
      expectedRecoveryAttemptCount: v.float64(),
    }),
    handler: async (ctx, args) => {
      const { identity, actorType } = await Effect.runPromise(
        Effect.promise(() => ctx.auth.getUserIdentity()).pipe(
          Effect.flatMap((identity) =>
            requireWorkflowActorIdentity(
              identity,
              "Tenant invitation expiry-notification workflow scheduling",
            ),
          ),
          Effect.mapError(toWorkflowActorIdentityBoundaryError),
        ),
      );

      console.log("convex.tenantInvitation.expiry.schedule.identity", {
        jobId: args.jobId,
        actorType,
        preferredUsername: identity.preferredUsername,
        subject: identity.subject,
        issuer: identity.issuer,
        tokenIdentifier: identity.tokenIdentifier,
      });

      return await Effect.runPromise(
        scheduleWorkflowJobDispatchPlan({
          scheduler: ctx.scheduler,
          primaryFunctionReference:
            runTenantInvitationExpiryNotificationWorkflowJobInternalAction,
          recoveryFunctionReference:
            runTenantInvitationExpiryNotificationWorkflowJobInternalAction,
          jobId: args.jobId,
          scheduledAt: args.scheduledAt,
        }).pipe(Effect.mapError(toWorkflowJobSchedulingBoundaryError)),
      );
    },
  });

export const cancelScheduledWorkflowJob = mutationGeneric({
  args: {
    scheduledFunctionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { actorType: workflowActorType } = await Effect.runPromise(
      Effect.promise(() => ctx.auth.getUserIdentity()).pipe(
        Effect.flatMap((identity) =>
          requireWorkflowActorIdentity(
            identity,
            "Billing reconciliation workflow cancellation",
          ),
        ),
        Effect.flatMap((identity) =>
          identity.actorType === actorType.platformOperator
            ? Effect.succeed(identity)
            : Effect.fail({
                _tag: "WorkflowActorIdentityError",
                operation: "Billing reconciliation workflow cancellation",
                reason:
                  "Billing reconciliation workflow cancellation requires a platform-operator Keycloak identity.",
              } as const),
        ),
        Effect.mapError(toWorkflowActorIdentityBoundaryError),
      ),
    );

    console.log("convex.billing.cancel.identity", {
      scheduledFunctionId: args.scheduledFunctionId,
      actorType: workflowActorType,
    });

    await ctx.scheduler.cancel(
      args.scheduledFunctionId as Parameters<typeof ctx.scheduler.cancel>[0],
    );

    return null;
  },
});
