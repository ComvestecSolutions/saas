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

export const emailDeliveryConfigKey = defineModuleConfigKeys(
  platformModuleId.emailDelivery,
  {
    rateLimitPerMinute: "rateLimitPerMinute",
  },
);

export const emailDeliveryFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.emailDelivery,
  {
    enabled: "enabled",
  },
);

export const emailDeliveryManifest = defineModuleManifest({
  moduleId: platformModuleId.emailDelivery,
  configKeys: [
    {
      key: emailDeliveryConfigKey.rateLimitPerMinute,
      description: "Maximum emails per minute per tenant.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.enterprise],
      owner: platformModuleId.emailDelivery,
    },
  ],
  featureFlags: [
    {
      key: emailDeliveryFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.emailDelivery,
      purpose: "Gate email delivery module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.emailManage],
  fieldClassifications: [],
  projectionProfiles: [],
});
