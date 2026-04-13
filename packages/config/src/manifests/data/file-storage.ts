import {
  configSchemaType,
  fileStorageConfigKey,
  fileStorageFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const fileStorageManifest = defineModuleManifest({
  moduleId: platformModuleId.fileStorage,
  configKeys: [
    {
      key: fileStorageConfigKey.maxUploadSizeMb,
      description: "Maximum single file upload size in MB.",
      schema: configSchemaType.number,
      defaultValue: 50,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.organization],
      owner: platformModuleId.fileStorage,
    },
  ],
  featureFlags: [
    {
      key: fileStorageFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.fileStorage,
      purpose: "Gate file storage module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.fileRead, permissionScope.fileWrite],
  fieldClassifications: [],
  projectionProfiles: [],
});
