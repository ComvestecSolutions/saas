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

export const importExportConfigKey = defineModuleConfigKeys(
  platformModuleId.importExport,
  {
    maxRowsPerImport: "maxRowsPerImport",
  },
);

export const importExportFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.importExport,
  {
    enabled: "enabled",
  },
);

export const importExportManifest = defineModuleManifest({
  moduleId: platformModuleId.importExport,
  configKeys: [
    {
      key: importExportConfigKey.maxRowsPerImport,
      description: "Maximum rows per import batch.",
      schema: configSchemaType.number,
      defaultValue: 10000,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.enterprise],
      owner: platformModuleId.importExport,
    },
  ],
  featureFlags: [
    {
      key: importExportFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.importExport,
      purpose: "Gate import/export module.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "Enable once import/export pipelines are stable.",
    },
  ],
  permissionScopes: [
    permissionScope.importExecute,
    permissionScope.exportExecute,
  ],
  fieldClassifications: [],
  projectionProfiles: [],
});
