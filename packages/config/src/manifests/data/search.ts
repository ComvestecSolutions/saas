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

export const searchConfigKey = defineModuleConfigKeys(platformModuleId.search, {
  indexMaxDocuments: "index.maxDocuments",
});

export const searchFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.search,
  {
    enabled: "enabled",
  },
);

export const searchManifest = defineModuleManifest({
  moduleId: platformModuleId.search,
  configKeys: [
    {
      key: searchConfigKey.indexMaxDocuments,
      description: "Maximum documents per tenant index.",
      schema: configSchemaType.number,
      defaultValue: 100000,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.enterprise],
      owner: platformModuleId.search,
    },
  ],
  featureFlags: [
    {
      key: searchFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.search,
      purpose: "Gate search module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.searchAdmin],
  fieldClassifications: [],
  projectionProfiles: [],
});
