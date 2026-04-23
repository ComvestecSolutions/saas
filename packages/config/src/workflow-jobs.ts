import { platformModuleId, workflowJobsConfigKey } from "@comvestec/contracts";
import { findModuleManifest } from "./manifests";

const resolveWorkflowJobsDefaultNumber = (input: {
  readonly key: string;
  readonly fallback: number;
}) => {
  const defaultValue = findModuleManifest(
    platformModuleId.workflowJobs,
  )?.configKeys.find((configKey) => configKey.key === input.key)?.defaultValue;

  return typeof defaultValue === "number" ? defaultValue : input.fallback;
};

const resolveWorkflowJobsDefaultWholeNumber = (input: {
  readonly key: string;
  readonly fallback: number;
}) => Math.max(0, Math.floor(resolveWorkflowJobsDefaultNumber(input)));

export const workflowJobsRetryMaxAttempts =
  resolveWorkflowJobsDefaultWholeNumber({
    key: workflowJobsConfigKey.retryMaxAttempts,
    fallback: 3,
  });

export const workflowJobsReconciliationDeadlineSeconds =
  resolveWorkflowJobsDefaultNumber({
    key: workflowJobsConfigKey.reconciliationDeadlineSeconds,
    fallback: 300,
  });

export const workflowJobsReconciliationSweepIntervalMinutes =
  resolveWorkflowJobsDefaultNumber({
    key: workflowJobsConfigKey.reconciliationSweepIntervalMinutes,
    fallback: 15,
  });

export const workflowJobsRunningClaimTimeoutSeconds =
  workflowJobsReconciliationSweepIntervalMinutes * 60;

export const workflowJobsScheduledRecoveryAttemptCount = Math.max(
  1,
  workflowJobsRetryMaxAttempts + 2,
);
