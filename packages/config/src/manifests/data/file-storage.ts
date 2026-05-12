import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  fileStorageConfigKey,
  fileStorageFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const fileStorageFields = defineModuleFields({
  fileId: "fileId",
  content: "content",
  fileName: "fileName",
  contentType: "contentType",
  sizeBytes: "sizeBytes",
  classification: "classification",
  usage: "usage",
  scope: "scope",
  scopeId: "scopeId",
  uploadedBy: "uploadedBy",
  uploadedAt: "uploadedAt",
  deletedBy: "deletedBy",
  deletedAt: "deletedAt",
  legalHoldActive: "legalHoldActive",
});

export const fileStorageFieldClassifications =
  defineDataClassificationDeclarations(fileStorageFields, [
    {
      field: fileStorageFields.fileId,
      classification: dataClassification.internal,
    },
    {
      field: fileStorageFields.content,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: fileStorageFields.fileName,
      classification: dataClassification.internal,
    },
    {
      field: fileStorageFields.contentType,
      classification: dataClassification.internal,
    },
    {
      field: fileStorageFields.sizeBytes,
      classification: dataClassification.internal,
    },
    {
      field: fileStorageFields.classification,
      classification: dataClassification.internal,
    },
    {
      field: fileStorageFields.usage,
      classification: dataClassification.internal,
    },
    {
      field: fileStorageFields.scope,
      classification: dataClassification.internal,
    },
    {
      field: fileStorageFields.scopeId,
      classification: dataClassification.internal,
    },
    {
      field: fileStorageFields.uploadedBy,
      classification: dataClassification.internal,
    },
    {
      field: fileStorageFields.uploadedAt,
      classification: dataClassification.internal,
    },
    {
      field: fileStorageFields.deletedBy,
      classification: dataClassification.internal,
    },
    {
      field: fileStorageFields.deletedAt,
      classification: dataClassification.internal,
    },
    {
      field: fileStorageFields.legalHoldActive,
      classification: dataClassification.regulatedSensitive,
    },
  ]);

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
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.fileRead, permissionScope.fileWrite],
  fieldClassifications: fileStorageFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(fileStorageFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        fileStorageFields.fileId,
        fileStorageFields.fileName,
        fileStorageFields.contentType,
        fileStorageFields.sizeBytes,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.admin,
      visibleFields: [
        fileStorageFields.fileId,
        fileStorageFields.fileName,
        fileStorageFields.contentType,
        fileStorageFields.sizeBytes,
        fileStorageFields.uploadedBy,
        fileStorageFields.scope,
        fileStorageFields.scopeId,
        fileStorageFields.legalHoldActive,
      ],
      auditedFields: [fileStorageFields.legalHoldActive],
    },
  ]),
});
