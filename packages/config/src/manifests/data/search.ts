import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
  searchConfigKey,
  searchFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const searchFields = defineModuleFields({
  documentId: "documentId",
  documentFamily: "documentFamily",
  fileId: "fileId",
  fileName: "fileName",
  contentType: "contentType",
  sizeBytes: "sizeBytes",
  deletedAt: "deletedAt",
  caseId: "caseId",
  supportAgent: "supportAgent",
  tenantScope: "tenantScope",
  tenantScopeId: "tenantScopeId",
  summary: "summary",
  status: "status",
  priority: "priority",
  startedAt: "startedAt",
  lastUpdatedAt: "lastUpdatedAt",
});

export const searchFieldClassifications = defineDataClassificationDeclarations(
  searchFields,
  [
    {
      field: searchFields.documentId,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.documentFamily,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.fileId,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.fileName,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.contentType,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.sizeBytes,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.deletedAt,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.caseId,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.supportAgent,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.tenantScope,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.tenantScopeId,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.summary,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.status,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.priority,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.startedAt,
      classification: dataClassification.internal,
    },
    {
      field: searchFields.lastUpdatedAt,
      classification: dataClassification.internal,
    },
  ],
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
      description:
        "Gate tenant search index ensure and tenant-facing search availability while preserving operator lifecycle inspection and teardown.",
      owner: platformModuleId.search,
      purpose:
        "Gate tenant-visible search activation while preserving operator cleanup and audit workflows.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.searchAdmin],
  fieldClassifications: searchFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(searchFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        searchFields.fileId,
        searchFields.fileName,
        searchFields.contentType,
        searchFields.sizeBytes,
        searchFields.deletedAt,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.admin,
      visibleFields: [
        searchFields.fileId,
        searchFields.fileName,
        searchFields.contentType,
        searchFields.sizeBytes,
        searchFields.deletedAt,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.supportSafe,
      visibleFields: [
        searchFields.caseId,
        searchFields.supportAgent,
        searchFields.tenantScope,
        searchFields.tenantScopeId,
        searchFields.summary,
        searchFields.status,
        searchFields.priority,
        searchFields.startedAt,
        searchFields.lastUpdatedAt,
      ],
      auditedFields: [],
    },
  ]),
});
