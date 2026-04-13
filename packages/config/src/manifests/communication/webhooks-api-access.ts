import {
  configSchemaType,
  permissionScope,
  platformModuleId,
  platformScope,
  webhooksApiAccessConfigKey,
  webhooksApiAccessFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const webhooksApiAccessManifest = defineModuleManifest({
  moduleId: platformModuleId.webhooksApiAccess,
  configKeys: [
    {
      key: webhooksApiAccessConfigKey.deliveryMaxRetries,
      description: "Maximum retry attempts per webhook delivery.",
      schema: configSchemaType.number,
      defaultValue: 5,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.webhooksApiAccess,
    },
  ],
  featureFlags: [
    {
      key: webhooksApiAccessFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.webhooksApiAccess,
      purpose: "Gate webhooks and API access module.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "Enable once webhook infrastructure is stable.",
    },
  ],
  permissionScopes: [permissionScope.webhookManage],
  fieldClassifications: [],
  projectionProfiles: [],
});
