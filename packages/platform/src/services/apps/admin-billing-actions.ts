import { Effect } from "effect";
import type {
  BillingPlanCreateRequest,
  BillingReconciliationManualRunRequest,
} from "@comvestec/contracts";

const loadAdminBillingRuntime = () =>
  Effect.tryPromise({
    try: () => import("../domains/admin-billing"),
    catch: (cause) => cause,
  }).pipe(Effect.orDie);

export const createManagedBillingPlanFromEnvironment = (
  environment: unknown,
  input: BillingPlanCreateRequest,
) =>
  loadAdminBillingRuntime().pipe(
    Effect.flatMap(({ runAdminBillingFromEnvironment }) =>
      runAdminBillingFromEnvironment(environment, (service) =>
        service.createManagedBillingPlan(input),
      ),
    ),
  );

export const runManualBillingReconciliationFromEnvironment = (
  environment: unknown,
  input: BillingReconciliationManualRunRequest,
) =>
  loadAdminBillingRuntime().pipe(
    Effect.flatMap(({ runAdminBillingFromEnvironment }) =>
      runAdminBillingFromEnvironment(environment, (service) =>
        service.runManualBillingReconciliation(input),
      ),
    ),
  );
