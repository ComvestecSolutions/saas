import {
  configSchemaType,
  permissionScope,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import {
  defineModuleConfigKeys,
  defineModuleFeatureFlags,
  defineModuleManifest,
} from "../../manifest-helpers";

export const notificationCenterConfigKey = defineModuleConfigKeys(
  platformModuleId.notificationCenter,
  {
    digestIntervalMinutes: "digest.intervalMinutes",
  },
);

export const notificationCenterFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.notificationCenter,
  {
    enabled: "enabled",
  },
);

export const notificationCenterManifest = defineModuleManifest({
  moduleId: platformModuleId.notificationCenter,
  configKeys: [
    {
      key: notificationCenterConfigKey.digestIntervalMinutes,
      description: "Minutes between digest batches.",
      schema: configSchemaType.number,
      defaultValue: 15,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.organization],
      owner: platformModuleId.notificationCenter,
    },
  ],
  featureFlags: [
    {
      key: notificationCenterFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.notificationCenter,
      purpose: "Gate notification center module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.notificationManage],
  fieldClassifications: [],
  projectionProfiles: [],
});
