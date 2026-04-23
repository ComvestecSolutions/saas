"use node";

import { Effect } from "effect";
import {
  platformAdapterServiceName,
  type ConvexAdapterRequestError,
  type ConvexAdapterService,
} from "@comvestec/platform";
import {
  scheduleBillingConvergenceDispatchPlan,
  type BillingConvergenceSchedulingError,
  type BillingConvergenceScheduler,
} from "./billingConvergenceScheduling";

export const buildSchedulerBackedConvexAdapter = <
  TPrimaryFunctionReference,
  TRecoveryFunctionReference,
>(input: {
  readonly scheduler: BillingConvergenceScheduler<
    TPrimaryFunctionReference | TRecoveryFunctionReference
  >;
  readonly primaryFunctionReference: TPrimaryFunctionReference;
  readonly recoveryFunctionReference: TRecoveryFunctionReference;
  readonly deploymentUrl: string;
  readonly siteUrl: string;
}): ConvexAdapterService => ({
  serviceName: platformAdapterServiceName.convex,
  deploymentUrl: input.deploymentUrl,
  siteUrl: input.siteUrl,
  healthcheck: Effect.succeed({
    healthy: true,
    service: platformAdapterServiceName.convex,
  }),
  scheduleBillingReconciliationWorkflowJob: (request) =>
    scheduleBillingConvergenceDispatchPlan({
      scheduler: input.scheduler,
      primaryFunctionReference: input.primaryFunctionReference,
      recoveryFunctionReference: input.recoveryFunctionReference,
      jobId: request.jobId,
      scheduledAt: request.scheduledAt,
    }).pipe(
      Effect.mapError(
        (cause: BillingConvergenceSchedulingError) =>
          ({
            _tag: "ConvexAdapterRequestError",
            operation: "scheduleBillingReconciliationWorkflowJob",
            cause,
          }) satisfies ConvexAdapterRequestError,
      ),
    ),
});
