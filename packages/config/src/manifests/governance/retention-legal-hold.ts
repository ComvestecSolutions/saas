import {
  configSchemaType,
  permissionScope,
  platformModuleId,
  platformScope,
  retentionLegalHoldConfigKey,
  retentionLegalHoldFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const retentionLegalHoldManifest = defineModuleManifest({
  moduleId: platformModuleId.retentionLegalHold,
  configKeys: [
    {
      key: retentionLegalHoldConfigKey.defaultRetentionDays,
      description: "Default data retention period in days.",
      schema: configSchemaType.number,
      defaultValue: 730,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.enterprise],
      owner: platformModuleId.retentionLegalHold,
    },
  ],
  featureFlags: [
    {
      key: retentionLegalHoldFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.retentionLegalHold,
      purpose: "Gate retention and legal hold module.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "Enable once compliance workflows are defined.",
    },
  ],
  permissionScopes: [permissionScope.retentionManage],
  fieldClassifications: [],
  projectionProfiles: [],
});
