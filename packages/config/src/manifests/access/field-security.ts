import {
  configSchemaType,
  featureFlagLifecycle,
  fieldSecurityConfigKey,
  fieldSecurityFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const fieldSecurityManifest = defineModuleManifest({
  moduleId: platformModuleId.fieldSecurity,
  configKeys: [
    {
      key: fieldSecurityConfigKey.sensitiveReadAudit,
      description: "Whether sensitive-read events are captured.",
      schema: configSchemaType.boolean,
      defaultValue: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.fieldSecurity,
    },
  ],
  featureFlags: [
    {
      key: fieldSecurityFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.fieldSecurity,
      purpose: "Gate field security module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.fieldAdmin],
  fieldClassifications: [],
  projectionProfiles: [],
});
