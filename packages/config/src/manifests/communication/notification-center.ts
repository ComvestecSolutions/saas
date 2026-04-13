import {
  configSchemaType,
  notificationCenterConfigKey,
  notificationCenterFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

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
