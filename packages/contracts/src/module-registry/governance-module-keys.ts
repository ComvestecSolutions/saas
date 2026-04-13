import {
  defineModuleConfigKeys,
  defineModuleFeatureFlags,
} from "./key-factories";
import { platformModuleId } from "./modules";

export const auditLogConfigKey = defineModuleConfigKeys(
  platformModuleId.auditLog,
  {
    retentionDays: "retentionDays",
    sensitiveReadCapture: "sensitiveReadCapture",
  },
);

export const auditLogFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.auditLog,
  {},
);

export const featureFlagsFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.featureFlags,
  {},
);

export const retentionLegalHoldConfigKey = defineModuleConfigKeys(
  platformModuleId.retentionLegalHold,
  {
    defaultRetentionDays: "defaultRetentionDays",
  },
);

export const retentionLegalHoldFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.retentionLegalHold,
  {},
);

export const runtimeConfigConfigKey = defineModuleConfigKeys(
  platformModuleId.runtimeConfig,
  {
    syncStrategy: "sync.strategy",
    approvalsEnabled: "approvals.enabled",
  },
);

export const runtimeConfigFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.runtimeConfig,
  {
    inlineDiffViewer: "inlineDiffViewer",
  },
);

export const supportOperationsConfigKey = defineModuleConfigKeys(
  platformModuleId.supportOperations,
  {
    impersonationMaxDurationMinutes: "impersonation.maxDurationMinutes",
    breakGlassMaxDurationMinutes: "breakGlass.maxDurationMinutes",
  },
);

export const supportOperationsFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.supportOperations,
  {
    breakGlassEnabled: "breakGlassEnabled",
  },
);
