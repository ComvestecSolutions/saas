import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  identitySessionConfigKey,
  identitySessionFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const identitySessionFields = defineModuleFields({
  companyName: "companyName",
  replyToEmail: "replyToEmail",
  secretsToken: "secrets.token",
});

export const identitySessionFieldClassifications =
  defineDataClassificationDeclarations(identitySessionFields, [
    {
      field: identitySessionFields.companyName,
      classification: dataClassification.public,
    },
    {
      field: identitySessionFields.replyToEmail,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: identitySessionFields.secretsToken,
      classification: dataClassification.secret,
    },
  ]);

export const identitySessionManifest = defineModuleManifest({
  moduleId: platformModuleId.identitySession,
  configKeys: [
    {
      key: identitySessionConfigKey.sessionIdleTimeoutMinutes,
      description: "Minutes of inactivity before session expires.",
      schema: configSchemaType.number,
      defaultValue: 30,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.enterprise],
      owner: platformModuleId.identitySession,
    },
    {
      key: identitySessionConfigKey.sessionAbsoluteTimeoutHours,
      description: "Maximum session lifetime in hours.",
      schema: configSchemaType.number,
      defaultValue: 12,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.enterprise],
      owner: platformModuleId.identitySession,
    },
  ],
  featureFlags: [
    {
      key: identitySessionFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.identitySession,
      purpose: "Gate identity session module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "None — core module.",
    },
    {
      key: identitySessionFeatureFlag.mfaEnforced,
      description: "Require MFA for all users.",
      owner: platformModuleId.identitySession,
      purpose: "Enforce multi-factor authentication.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.enterprise],
      retirementPlan: "Promote to default when MFA adoption is sufficient.",
    },
  ],
  permissionScopes: [permissionScope.supportImpersonate],
  fieldClassifications: identitySessionFieldClassifications,
  projectionProfiles: [],
});
