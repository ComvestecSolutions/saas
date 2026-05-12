import { Effect } from "effect";
import type {
  BillingPlanCreateRequest,
  BillingRepairGapCancelRequest,
  BillingRepairGapListRequest,
  BillingRepairGapReplayRequest,
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

type CreateManagedBillingPlan = (
  input: BillingPlanCreateRequest,
) => ReturnType<typeof createManagedBillingPlanFromEnvironment>;

export const createManagedBillingPlanFromSessionId = (
  environment: unknown,
  input: BillingPlanCreateRequest,
  createManagedBillingPlan: CreateManagedBillingPlan = (requestInput) =>
    createManagedBillingPlanFromEnvironment(environment, requestInput),
) => createManagedBillingPlan(input);

export const listBillingRepairGapsFromEnvironment = (
  environment: unknown,
  input: BillingRepairGapListRequest,
) =>
  loadAdminBillingRuntime().pipe(
    Effect.flatMap(({ runAdminBillingFromEnvironment }) =>
      runAdminBillingFromEnvironment(environment, (service) =>
        service.listBillingRepairGaps(input),
      ),
    ),
  );

export const replayBillingRepairGapFromEnvironment = (
  environment: unknown,
  input: BillingRepairGapReplayRequest,
) =>
  loadAdminBillingRuntime().pipe(
    Effect.flatMap(({ runAdminBillingFromEnvironment }) =>
      runAdminBillingFromEnvironment(environment, (service) =>
        service.replayBillingRepairGap(input),
      ),
    ),
  );

export const cancelBillingRepairGapFromEnvironment = (
  environment: unknown,
  input: BillingRepairGapCancelRequest,
) =>
  loadAdminBillingRuntime().pipe(
    Effect.flatMap(({ runAdminBillingFromEnvironment }) =>
      runAdminBillingFromEnvironment(environment, (service) =>
        service.cancelBillingRepairGap(input),
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

type ListBillingRepairGaps = (
  input: BillingRepairGapListRequest,
) => ReturnType<typeof listBillingRepairGapsFromEnvironment>;

type ReplayBillingRepairGap = (
  input: BillingRepairGapReplayRequest,
) => ReturnType<typeof replayBillingRepairGapFromEnvironment>;

type CancelBillingRepairGap = (
  input: BillingRepairGapCancelRequest,
) => ReturnType<typeof cancelBillingRepairGapFromEnvironment>;

type RunManualBillingReconciliation = (
  input: BillingReconciliationManualRunRequest,
) => ReturnType<typeof runManualBillingReconciliationFromEnvironment>;

export const listBillingRepairGapsFromSessionId = (
  environment: unknown,
  input: BillingRepairGapListRequest,
  listBillingRepairGaps: ListBillingRepairGaps = (input) =>
    listBillingRepairGapsFromEnvironment(environment, input),
) => listBillingRepairGaps(input);

export const replayBillingRepairGapFromWorkflowExecutionContext = (
  environment: unknown,
  input: BillingRepairGapReplayRequest,
  replayBillingRepairGap: ReplayBillingRepairGap = (requestInput) =>
    replayBillingRepairGapFromEnvironment(environment, requestInput),
) => replayBillingRepairGap(input);

export const cancelBillingRepairGapFromSessionId = (
  environment: unknown,
  input: BillingRepairGapCancelRequest,
  cancelBillingRepairGap: CancelBillingRepairGap = (requestInput) =>
    cancelBillingRepairGapFromEnvironment(environment, requestInput),
) => cancelBillingRepairGap(input);

export const runManualBillingReconciliationFromWorkflowExecutionContext = (
  environment: unknown,
  input: BillingReconciliationManualRunRequest,
  runManualBillingReconciliation: RunManualBillingReconciliation = (
    requestInput,
  ) => runManualBillingReconciliationFromEnvironment(environment, requestInput),
) => runManualBillingReconciliation(input);
