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
  retentionLegalHoldConfigKey,
  retentionLegalHoldFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const retentionLegalHoldFields = defineModuleFields({
  policyId: "policyId",
  dataType: "dataType",
  retentionDays: "retentionDays",
  legalHoldActive: "legalHoldActive",
  legalHoldId: "legalHoldId",
  targetId: "targetId",
  status: "status",
  placedAt: "placedAt",
  releasedAt: "releasedAt",
  evidence: "evidence",
});

export const retentionLegalHoldFieldClassifications =
  defineDataClassificationDeclarations(retentionLegalHoldFields, [
    {
      field: retentionLegalHoldFields.policyId,
      classification: dataClassification.internal,
    },
    {
      field: retentionLegalHoldFields.dataType,
      classification: dataClassification.internal,
    },
    {
      field: retentionLegalHoldFields.retentionDays,
      classification: dataClassification.internal,
    },
    {
      field: retentionLegalHoldFields.legalHoldActive,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: retentionLegalHoldFields.legalHoldId,
      classification: dataClassification.internal,
    },
    {
      field: retentionLegalHoldFields.targetId,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: retentionLegalHoldFields.status,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: retentionLegalHoldFields.placedAt,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: retentionLegalHoldFields.releasedAt,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: retentionLegalHoldFields.evidence,
      classification: dataClassification.regulatedSensitive,
    },
  ]);

export const retentionLegalHoldManifest = defineModuleManifest({
  moduleId: platformModuleId.retentionLegalHold,
  configKeys: [
    {
      key: retentionLegalHoldConfigKey.defaultRetentionDays,
      description: "Default data retention period in days.",
      schema: configSchemaType.number,
      defaultValue: 730,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.enterprise],
      owner: platformModuleId.retentionLegalHold,
    },
  ],
  featureFlags: [
    {
      key: retentionLegalHoldFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.retentionLegalHold,
      purpose: "Gate retention and legal hold module.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "Enable once compliance workflows are defined.",
    },
  ],
  permissionScopes: [permissionScope.retentionManage],
  fieldClassifications: retentionLegalHoldFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(retentionLegalHoldFields, [
    {
      profile: projectionProfile.admin,
      visibleFields: [
        retentionLegalHoldFields.policyId,
        retentionLegalHoldFields.dataType,
        retentionLegalHoldFields.retentionDays,
        retentionLegalHoldFields.legalHoldActive,
      ],
      auditedFields: [retentionLegalHoldFields.legalHoldActive],
    },
    {
      profile: projectionProfile.complianceReview,
      visibleFields: [
        retentionLegalHoldFields.legalHoldId,
        retentionLegalHoldFields.dataType,
        retentionLegalHoldFields.targetId,
        retentionLegalHoldFields.status,
        retentionLegalHoldFields.placedAt,
        retentionLegalHoldFields.releasedAt,
        retentionLegalHoldFields.evidence,
        retentionLegalHoldFields.legalHoldActive,
      ],
      auditedFields: [
        retentionLegalHoldFields.legalHoldActive,
        retentionLegalHoldFields.targetId,
        retentionLegalHoldFields.evidence,
      ],
    },
  ]),
});
