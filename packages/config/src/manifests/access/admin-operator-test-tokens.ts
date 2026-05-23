import {
  adminOperatorTestTokensConfigKey,
  adminOperatorTestTokensFeatureFlag,
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
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const adminOperatorTestTokensFields = defineModuleFields({
  id: "id",
  tokenPrefix: "tokenPrefix",
  tokenHash: "tokenHash",
  label: "label",
  issuedBy: "issuedBy",
  issuedAt: "issuedAt",
  expiresAt: "expiresAt",
  revokedAt: "revokedAt",
  revokedBy: "revokedBy",
  lastUsedAt: "lastUsedAt",
  lastUsedOutcome: "lastUsedOutcome",
  reasonCatalogId: "reasonCatalogId",
  reasonAttachmentText: "reasonAttachmentText",
});

export const adminOperatorTestTokensFieldClassifications =
  defineDataClassificationDeclarations(adminOperatorTestTokensFields, [
    {
      field: adminOperatorTestTokensFields.id,
      classification: dataClassification.internal,
    },
    {
      field: adminOperatorTestTokensFields.tokenPrefix,
      classification: dataClassification.secret,
    },
    {
      field: adminOperatorTestTokensFields.tokenHash,
      classification: dataClassification.secret,
    },
    {
      field: adminOperatorTestTokensFields.label,
      classification: dataClassification.internal,
    },
    {
      field: adminOperatorTestTokensFields.issuedBy,
      classification: dataClassification.internal,
    },
    {
      field: adminOperatorTestTokensFields.issuedAt,
      classification: dataClassification.internal,
    },
    {
      field: adminOperatorTestTokensFields.expiresAt,
      classification: dataClassification.internal,
    },
    {
      field: adminOperatorTestTokensFields.revokedAt,
      classification: dataClassification.internal,
    },
    {
      field: adminOperatorTestTokensFields.revokedBy,
      classification: dataClassification.internal,
    },
    {
      field: adminOperatorTestTokensFields.lastUsedAt,
      classification: dataClassification.internal,
    },
    {
      field: adminOperatorTestTokensFields.lastUsedOutcome,
      classification: dataClassification.internal,
    },
    {
      field: adminOperatorTestTokensFields.reasonCatalogId,
      classification: dataClassification.internal,
    },
    {
      field: adminOperatorTestTokensFields.reasonAttachmentText,
      classification: dataClassification.internal,
    },
  ]);

export const adminOperatorTestTokensManifest = defineModuleManifest({
  moduleId: platformModuleId.adminOperatorTestTokens,
  configKeys: [
    {
      key: adminOperatorTestTokensConfigKey.tokenDefaultExpiryHours,
      description:
        "Default token lifetime applied on issue when the operator does not specify one. Resolved at the service boundary; matches the spec's 24h default.",
      schema: configSchemaType.number,
      defaultValue: 24,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.adminOperatorTestTokens,
    },
    {
      key: adminOperatorTestTokensConfigKey.tokenMaxExpiryHours,
      description:
        "Hard ceiling on token lifetime accepted at issue. The service rejects an expiresAt past now + maxExpiryHours; defaults to 168h per spec.",
      schema: configSchemaType.number,
      defaultValue: 168,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.adminOperatorTestTokens,
    },
  ],
  featureFlags: [
    {
      key: adminOperatorTestTokensFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.adminOperatorTestTokens,
      purpose:
        "Gate the admin-operator-test-tokens surface; off => list returns empty and issue/revoke reject.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "None — owner-only automation credential surface required by first-party test harnesses.",
    },
  ],
  permissionScopes: [permissionScope.adminOperatorTestTokensManage],
  fieldClassifications: adminOperatorTestTokensFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(
    adminOperatorTestTokensFields,
    [
      {
        profile: projectionProfile.adminOwnerOnly,
        visibleFields: [
          adminOperatorTestTokensFields.id,
          adminOperatorTestTokensFields.tokenPrefix,
          adminOperatorTestTokensFields.label,
          adminOperatorTestTokensFields.issuedBy,
          adminOperatorTestTokensFields.issuedAt,
          adminOperatorTestTokensFields.expiresAt,
          adminOperatorTestTokensFields.revokedAt,
          adminOperatorTestTokensFields.lastUsedAt,
          adminOperatorTestTokensFields.lastUsedOutcome,
        ],
        auditedFields: [adminOperatorTestTokensFields.tokenPrefix],
      },
      {
        profile: projectionProfile.adminOwnerOnly,
        visibleFields: [
          adminOperatorTestTokensFields.id,
          adminOperatorTestTokensFields.tokenPrefix,
          adminOperatorTestTokensFields.label,
          adminOperatorTestTokensFields.issuedBy,
          adminOperatorTestTokensFields.issuedAt,
          adminOperatorTestTokensFields.expiresAt,
          adminOperatorTestTokensFields.revokedAt,
          adminOperatorTestTokensFields.revokedBy,
          adminOperatorTestTokensFields.lastUsedAt,
          adminOperatorTestTokensFields.lastUsedOutcome,
          adminOperatorTestTokensFields.reasonCatalogId,
          adminOperatorTestTokensFields.reasonAttachmentText,
        ],
        auditedFields: [
          adminOperatorTestTokensFields.tokenPrefix,
          adminOperatorTestTokensFields.reasonAttachmentText,
        ],
      },
    ],
  ),
});
