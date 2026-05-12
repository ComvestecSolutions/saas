import { Effect, Either, Schema } from "effect";
import { IsoTimestampSchema } from "@comvestec/contracts";
import {
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
  workflowJobsScheduledRecoveryAttemptCount,
} from "@comvestec/config";

export {
  workflowJobsRetryMaxAttempts,
  workflowJobsRunningClaimTimeoutSeconds,
  workflowJobsScheduledRecoveryAttemptCount,
};

export type WorkflowJobScheduler<TFunctionReference> = {
  readonly runAt: (
    scheduledTime: Date,
    functionReference: TFunctionReference,
    args: {
      readonly jobId: string;
    },
  ) => Promise<string>;
};

export type WorkflowJobDispatchPlan = {
  readonly scheduledFunctionId: string;
  readonly scheduledFunctionIds: string[];
  readonly primaryScheduled: boolean;
  readonly scheduledRecoveryAttemptCount: number;
  readonly expectedRecoveryAttemptCount: number;
};

export type WorkflowJobScheduledAtInvalidError = {
  readonly _tag: "WorkflowJobScheduledAtInvalidError";
  readonly scheduledAt: string;
  readonly reason: string;
};

export type WorkflowJobDispatchUnavailableError = {
  readonly _tag: "WorkflowJobDispatchUnavailableError";
  readonly cause: unknown;
};

export type WorkflowJobSchedulingError =
  | WorkflowJobScheduledAtInvalidError
  | WorkflowJobDispatchUnavailableError;

const parseWorkflowJobScheduledAt = (
  scheduledAt: string,
): Effect.Effect<Date, WorkflowJobScheduledAtInvalidError> => {
  return Schema.decodeUnknown(IsoTimestampSchema)(scheduledAt).pipe(
    Effect.map((value) => new Date(value)),
    Effect.mapError(
      () =>
        ({
          _tag: "WorkflowJobScheduledAtInvalidError",
          scheduledAt,
          reason:
            "scheduledAt must be a valid ISO-8601 timestamp with a real calendar date.",
        }) satisfies WorkflowJobScheduledAtInvalidError,
    ),
  );
};

export const toWorkflowJobSchedulingBoundaryError = (
  error: WorkflowJobSchedulingError,
) =>
  error._tag === "WorkflowJobScheduledAtInvalidError"
    ? new Error(error.reason)
    : error.cause instanceof Error
      ? error.cause
      : new Error("Failed to schedule a workflow job dispatch plan.");

export const scheduleWorkflowJob = <TFunctionReference>(input: {
  readonly scheduler: WorkflowJobScheduler<TFunctionReference>;
  readonly functionReference: TFunctionReference;
  readonly jobId: string;
  readonly scheduledAt: string;
}) =>
  parseWorkflowJobScheduledAt(input.scheduledAt).pipe(
    Effect.flatMap((scheduledFor) =>
      Effect.tryPromise({
        try: () =>
          input.scheduler.runAt(scheduledFor, input.functionReference, {
            jobId: input.jobId,
          }),
        catch: (cause) =>
          ({
            _tag: "WorkflowJobDispatchUnavailableError",
            cause,
          }) satisfies WorkflowJobDispatchUnavailableError,
      }),
    ),
  );

export const scheduleWorkflowJobDispatchPlan = <
  TPrimaryFunctionReference,
  TRecoveryFunctionReference,
>(input: {
  readonly scheduler: WorkflowJobScheduler<
    TPrimaryFunctionReference | TRecoveryFunctionReference
  >;
  readonly primaryFunctionReference: TPrimaryFunctionReference;
  readonly recoveryFunctionReference: TRecoveryFunctionReference;
  readonly jobId: string;
  readonly scheduledAt: string;
}): Effect.Effect<WorkflowJobDispatchPlan, WorkflowJobSchedulingError> =>
  parseWorkflowJobScheduledAt(input.scheduledAt).pipe(
    Effect.flatMap((scheduledFor) =>
      Effect.gen(function* () {
        const scheduledFunctionIds: string[] = [];
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
          scheduledFunctionIds.push(primaryScheduleAttempt.right);
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
            scheduledFunctionIds.push(recoveryScheduleAttempt.right);
            scheduledRecoveryAttemptCount += 1;
          } else {
            lastScheduleError = recoveryScheduleAttempt.left;
          }
        }

        const [scheduledFunctionId] = scheduledFunctionIds;

        if (scheduledFunctionId === undefined) {
          return yield* Effect.fail({
            _tag: "WorkflowJobDispatchUnavailableError",
            cause: lastScheduleError,
          } satisfies WorkflowJobDispatchUnavailableError);
        }

        return {
          scheduledFunctionId,
          scheduledFunctionIds,
          primaryScheduled,
          scheduledRecoveryAttemptCount,
          expectedRecoveryAttemptCount:
            workflowJobsScheduledRecoveryAttemptCount,
        } satisfies WorkflowJobDispatchPlan;
      }),
    ),
  );
