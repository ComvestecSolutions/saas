import {
  permissionScope,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import {
  defineModuleFeatureFlags,
  defineModuleManifest,
} from "../../manifest-helpers";

export const featureFlagsFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.featureFlags,
  {
    enabled: "enabled",
  },
);

export const featureFlagsManifest = defineModuleManifest({
  moduleId: platformModuleId.featureFlags,
  configKeys: [],
  featureFlags: [
    {
      key: featureFlagsFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.featureFlags,
      purpose: "Gate feature flags module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.flagRead, permissionScope.flagWrite],
  fieldClassifications: [],
  projectionProfiles: [],
});
