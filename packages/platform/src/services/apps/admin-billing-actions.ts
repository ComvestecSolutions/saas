import { Effect } from "effect";
import type {
  BillingPlanCreateRequest,
  BillingReconciliationManualRunRequest,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

const loadAdminBillingRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../domains/admin-billing"));

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
