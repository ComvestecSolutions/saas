import {
  defineModuleConfigKeys,
  defineModuleFeatureFlags,
} from "./key-factories";
import { platformModuleId } from "./modules";

export const fileStorageConfigKey = defineModuleConfigKeys(
  platformModuleId.fileStorage,
  {
    maxUploadSizeMb: "maxUploadSizeMb",
  },
);

export const fileStorageFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.fileStorage,
  {},
);

export const importExportConfigKey = defineModuleConfigKeys(
  platformModuleId.importExport,
  {
    maxRowsPerImport: "maxRowsPerImport",
  },
);

export const importExportFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.importExport,
  {},
);

export const searchConfigKey = defineModuleConfigKeys(platformModuleId.search, {
  indexMaxDocuments: "index.maxDocuments",
});

export const searchFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.search,
  {},
);

export const workflowJobsConfigKey = defineModuleConfigKeys(
  platformModuleId.workflowJobs,
  {
    retryMaxAttempts: "retry.maxAttempts",
    reconciliationDeadlineSeconds: "reconciliation.deadlineSeconds",
    reconciliationSweepIntervalMinutes: "reconciliation.sweepIntervalMins",
  },
);

export const workflowJobsFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.workflowJobs,
  {},
);
