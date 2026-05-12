import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  importExportConfigKey,
  importExportFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const importExportFields = defineModuleFields({
  jobId: "jobId",
  tenantScope: "tenantScope",
  tenantScopeId: "tenantScopeId",
  source: "source",
  format: "format",
  status: "status",
  rowCount: "rowCount",
  artifactFileId: "artifactFileId",
  lastError: "lastError",
  startedAt: "startedAt",
  completedAt: "completedAt",
  createdAt: "createdAt",
});

export const importExportFieldClassifications =
  defineDataClassificationDeclarations(importExportFields, [
    {
      field: importExportFields.jobId,
      classification: dataClassification.internal,
    },
    {
      field: importExportFields.tenantScope,
      classification: dataClassification.internal,
    },
    {
      field: importExportFields.tenantScopeId,
      classification: dataClassification.internal,
    },
    {
      field: importExportFields.source,
      classification: dataClassification.internal,
    },
    {
      field: importExportFields.format,
      classification: dataClassification.internal,
    },
    {
      field: importExportFields.status,
      classification: dataClassification.internal,
    },
    {
      field: importExportFields.rowCount,
      classification: dataClassification.internal,
    },
    {
      field: importExportFields.artifactFileId,
      classification: dataClassification.internal,
    },
    {
      field: importExportFields.lastError,
      classification: dataClassification.internal,
    },
    {
      field: importExportFields.startedAt,
      classification: dataClassification.internal,
    },
    {
      field: importExportFields.completedAt,
      classification: dataClassification.internal,
    },
    {
      field: importExportFields.createdAt,
      classification: dataClassification.internal,
    },
  ]);

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
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "Enable once import/export pipelines are stable.",
    },
  ],
  permissionScopes: [
    permissionScope.importExecute,
    permissionScope.exportExecute,
  ],
  fieldClassifications: importExportFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(importExportFields, [
    {
      profile: projectionProfile.admin,
      visibleFields: [
        importExportFields.jobId,
        importExportFields.tenantScope,
        importExportFields.tenantScopeId,
        importExportFields.source,
        importExportFields.format,
        importExportFields.status,
        importExportFields.rowCount,
        importExportFields.artifactFileId,
        importExportFields.lastError,
        importExportFields.startedAt,
        importExportFields.completedAt,
        importExportFields.createdAt,
      ],
      auditedFields: [],
    },
  ]),
});
