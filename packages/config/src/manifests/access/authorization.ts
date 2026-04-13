import {
  authorizationConfigKey,
  authorizationFeatureFlag,
  configSchemaType,
  permissionScope,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const authorizationManifest = defineModuleManifest({
  moduleId: platformModuleId.authorization,
  configKeys: [
    {
      key: authorizationConfigKey.cacheTtlSeconds,
      description: "Keto decision cache TTL.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.authorization,
    },
  ],
  featureFlags: [
    {
      key: authorizationFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.authorization,
      purpose: "Gate authorization module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.fieldAdmin],
  fieldClassifications: [],
  projectionProfiles: [],
});
