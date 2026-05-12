import { Effect } from "effect";
import {
  scheduleWorkflowJob,
  scheduleWorkflowJobDispatchPlan,
  type WorkflowJobDispatchPlan,
  type WorkflowJobScheduler,
  type WorkflowJobSchedulingError,
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
  workflowJobsScheduledRecoveryAttemptCount,
} from "./workflowScheduling";

// Reserve one follow-up to observe exhausted recovery budget and one spare
// follow-up so a single missed dispatch does not remove that terminal block
// observation when the global recovery cron is absent.
export {
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
  workflowJobsScheduledRecoveryAttemptCount,
};

export type BillingConvergenceScheduler<TFunctionReference> =
  WorkflowJobScheduler<TFunctionReference>;

export type BillingConvergenceDispatchPlan = WorkflowJobDispatchPlan;

export type BillingConvergenceScheduledAtInvalidError = {
  readonly _tag: "BillingConvergenceScheduledAtInvalidError";
  readonly scheduledAt: string;
  readonly reason: string;
};

export type BillingConvergenceDispatchUnavailableError = {
  readonly _tag: "BillingConvergenceDispatchUnavailableError";
  readonly cause: unknown;
};

export type BillingConvergenceSchedulingError =
  | BillingConvergenceScheduledAtInvalidError
  | BillingConvergenceDispatchUnavailableError;

const toBillingConvergenceSchedulingError = (
  error: WorkflowJobSchedulingError,
):
  | BillingConvergenceScheduledAtInvalidError
  | BillingConvergenceDispatchUnavailableError =>
  error._tag === "WorkflowJobScheduledAtInvalidError"
    ? {
        _tag: "BillingConvergenceScheduledAtInvalidError",
        scheduledAt: error.scheduledAt,
        reason: error.reason,
      }
    : {
        _tag: "BillingConvergenceDispatchUnavailableError",
        cause: error.cause,
      };

export const toBillingConvergenceSchedulingBoundaryError = (
  error:
    | BillingConvergenceScheduledAtInvalidError
    | BillingConvergenceDispatchUnavailableError,
) =>
  error._tag === "BillingConvergenceScheduledAtInvalidError"
    ? new Error(error.reason)
    : error.cause instanceof Error
      ? error.cause
      : new Error("Failed to schedule a billing convergence dispatch plan.");

export const scheduleBillingConvergenceJob = <TFunctionReference>(input: {
  readonly scheduler: BillingConvergenceScheduler<TFunctionReference>;
  readonly functionReference: TFunctionReference;
  readonly jobId: string;
  readonly scheduledAt: string;
}) =>
  scheduleWorkflowJob(input).pipe(
    Effect.mapError(toBillingConvergenceSchedulingError),
  );

export const scheduleBillingConvergenceDispatchPlan = <
  TPrimaryFunctionReference,
  TRecoveryFunctionReference,
>(input: {
  readonly scheduler: BillingConvergenceScheduler<
    TPrimaryFunctionReference | TRecoveryFunctionReference
  >;
  readonly primaryFunctionReference: TPrimaryFunctionReference;
  readonly recoveryFunctionReference: TRecoveryFunctionReference;
  readonly jobId: string;
  readonly scheduledAt: string;
}): Effect.Effect<
  BillingConvergenceDispatchPlan,
  BillingConvergenceSchedulingError
> =>
  scheduleWorkflowJobDispatchPlan(input).pipe(
    Effect.mapError(toBillingConvergenceSchedulingError),
  );
