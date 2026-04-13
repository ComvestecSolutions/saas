import {
  featureFlagsFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

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
