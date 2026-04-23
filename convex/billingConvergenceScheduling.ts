import { Effect, Either, Schema } from "effect";
import { IsoTimestampSchema } from "@comvestec/contracts";
import {
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
  workflowJobsScheduledRecoveryAttemptCount,
} from "@comvestec/config";

// Reserve one follow-up to observe exhausted recovery budget and one spare
// follow-up so a single missed dispatch does not remove that terminal block
// observation when the global recovery cron is absent.
export {
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
  workflowJobsScheduledRecoveryAttemptCount,
};

export type BillingConvergenceScheduler<TFunctionReference> = {
  readonly runAt: (
    scheduledTime: Date,
    functionReference: TFunctionReference,
    args: {
      readonly jobId: string;
    },
  ) => Promise<string>;
};

export type BillingConvergenceDispatchPlan = {
  readonly scheduledFunctionId: string;
  readonly primaryScheduled: boolean;
  readonly scheduledRecoveryAttemptCount: number;
  readonly expectedRecoveryAttemptCount: number;
};

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

const parseBillingConvergenceScheduledAt = (
  scheduledAt: string,
): Effect.Effect<Date, BillingConvergenceScheduledAtInvalidError> => {
  return Schema.decodeUnknown(IsoTimestampSchema)(scheduledAt).pipe(
    Effect.map((value) => new Date(value)),
    Effect.mapError(
      () =>
        ({
          _tag: "BillingConvergenceScheduledAtInvalidError",
          scheduledAt,
          reason:
            "scheduledAt must be a valid ISO-8601 timestamp with a real calendar date.",
        }) satisfies BillingConvergenceScheduledAtInvalidError,
    ),
  );
};

export const toBillingConvergenceSchedulingBoundaryError = (
  error: BillingConvergenceSchedulingError,
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
  parseBillingConvergenceScheduledAt(input.scheduledAt).pipe(
    Effect.flatMap((scheduledFor) =>
      Effect.tryPromise({
        try: () =>
          input.scheduler.runAt(scheduledFor, input.functionReference, {
            jobId: input.jobId,
          }),
        catch: (cause) =>
          ({
            _tag: "BillingConvergenceDispatchUnavailableError",
            cause,
          }) satisfies BillingConvergenceDispatchUnavailableError,
      }),
    ),
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
  parseBillingConvergenceScheduledAt(input.scheduledAt).pipe(
    Effect.flatMap((scheduledFor) =>
      Effect.gen(function* () {
        let firstScheduledFunctionId: string | undefined;
        let lastScheduleError: unknown;
        let primaryScheduled = false;
        let scheduledRecoveryAttemptCount = 0;

        const primaryScheduleAttempt = yield* Effect.either(
          Effect.tryPromise({
            try: () =>
              input.scheduler.runAt(
                scheduledFor,
                input.primaryFunctionReference,
                {
                  jobId: input.jobId,
                },
              ),
            catch: (cause) => cause,
          }),
        );

        if (Either.isRight(primaryScheduleAttempt)) {
          firstScheduledFunctionId = primaryScheduleAttempt.right;
          primaryScheduled = true;
        } else {
          lastScheduleError = primaryScheduleAttempt.left;
        }

        for (
          let attemptIndex = 1;
          attemptIndex <= workflowJobsScheduledRecoveryAttemptCount;
          attemptIndex += 1
        ) {
          const recoveryScheduledFor = new Date(
            scheduledFor.getTime() +
              workflowJobsRunningClaimTimeoutSeconds * 1_000 * attemptIndex,
          );

          const recoveryScheduleAttempt = yield* Effect.either(
            Effect.tryPromise({
              try: () =>
                input.scheduler.runAt(
                  recoveryScheduledFor,
                  input.recoveryFunctionReference,
                  {
                    jobId: input.jobId,
                  },
                ),
              catch: (cause) => cause,
            }),
          );

          if (Either.isRight(recoveryScheduleAttempt)) {
            const scheduledFunctionId = recoveryScheduleAttempt.right;
            firstScheduledFunctionId ??= scheduledFunctionId;
            scheduledRecoveryAttemptCount += 1;
          } else {
            lastScheduleError = recoveryScheduleAttempt.left;
          }
        }

        if (firstScheduledFunctionId === undefined) {
          return yield* Effect.fail({
            _tag: "BillingConvergenceDispatchUnavailableError",
            cause: lastScheduleError,
          } satisfies BillingConvergenceDispatchUnavailableError);
        }

        return {
          scheduledFunctionId: firstScheduledFunctionId,
          primaryScheduled,
          scheduledRecoveryAttemptCount,
          expectedRecoveryAttemptCount:
            workflowJobsScheduledRecoveryAttemptCount,
        } satisfies BillingConvergenceDispatchPlan;
      }),
    ),
  );
