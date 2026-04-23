import { Effect } from "effect";
import { makeFunctionReference, mutationGeneric } from "convex/server";
import { v } from "convex/values";
import {
  scheduleBillingConvergenceDispatchPlan,
  toBillingConvergenceSchedulingBoundaryError,
} from "./billingConvergenceScheduling";
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

export const scheduleBillingReconciliationWorkflowJob = mutationGeneric({
  args: {
    jobId: v.string(),
    scheduledAt: v.string(),
  },
  returns: v.object({
    scheduledFunctionId: v.string(),
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
