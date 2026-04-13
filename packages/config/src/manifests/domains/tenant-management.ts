import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
  tenantManagementConfigKey,
  tenantManagementFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const tenantManagementFields = defineModuleFields({
  id: "id",
  name: "name",
  status: "status",
  billingEmail: "billingEmail",
});

export const tenantManagementFieldClassifications =
  defineDataClassificationDeclarations(tenantManagementFields, [
    {
      field: tenantManagementFields.id,
      classification: dataClassification.internal,
    },
    {
      field: tenantManagementFields.name,
      classification: dataClassification.internal,
    },
    {
      field: tenantManagementFields.status,
      classification: dataClassification.internal,
    },
    {
      field: tenantManagementFields.billingEmail,
      classification: dataClassification.tenantConfidential,
    },
  ]);

export const tenantManagementManifest = defineModuleManifest({
  moduleId: platformModuleId.tenantManagement,
  configKeys: [
    {
      key: tenantManagementConfigKey.membershipInviteExpiryHours,
      description: "Hours before an invite expires.",
      schema: configSchemaType.number,
      defaultValue: 72,
      billable: false,
      allowedScopes: [
        platformScope.platform,
        platformScope.enterprise,
        platformScope.organization,
      ],
      owner: platformModuleId.tenantManagement,
    },
    {
      key: tenantManagementConfigKey.onboardingReminderDays,
      description: "Days between onboarding reminder nudges.",
      schema: configSchemaType.number,
      defaultValue: 3,
      billable: false,
      allowedScopes: [
        platformScope.platform,
        platformScope.enterprise,
        platformScope.organization,
      ],
      owner: platformModuleId.tenantManagement,
    },
  ],
  featureFlags: [
    {
      key: tenantManagementFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.tenantManagement,
      purpose: "Gate tenant management module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "None — core module.",
    },
    {
      key: tenantManagementFeatureFlag.enterpriseHierarchy,
      description: "Enable multi-org enterprise hierarchy.",
      owner: platformModuleId.tenantManagement,
      purpose: "Allow enterprises with multiple organizations.",
      defaultEnabled: false,
      billable: true,
      allowedScopes: [platformScope.platform, platformScope.enterprise],
      retirementPlan: "None — permanent feature gate.",
    },
    {
      key: tenantManagementFeatureFlag.guidedOnboarding,
      description: "Enable guided onboarding workflow.",
      owner: platformModuleId.tenantManagement,
      purpose: "Guide tenant activation and initial setup.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [
        platformScope.platform,
        platformScope.enterprise,
        platformScope.organization,
      ],
      retirementPlan: "Promote to default once onboarding workflow stabilizes.",
    },
  ],
  permissionScopes: [
    permissionScope.tenantRead,
    permissionScope.tenantWrite,
    permissionScope.memberManage,
  ],
  fieldClassifications: tenantManagementFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(tenantManagementFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        tenantManagementFields.id,
        tenantManagementFields.name,
        tenantManagementFields.status,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.admin,
      visibleFields: [
        tenantManagementFields.id,
        tenantManagementFields.name,
        tenantManagementFields.status,
        tenantManagementFields.billingEmail,
      ],
      auditedFields: [tenantManagementFields.billingEmail],
    },
  ]),
});
