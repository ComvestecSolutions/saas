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
  supportOperationsConfigKey,
  supportOperationsFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const supportOperationsFields = defineModuleFields({
  caseId: "caseId",
  supportAgent: "supportAgent",
  tenantScope: "tenantScope",
  tenantScopeId: "tenantScopeId",
  summary: "summary",
  impersonatedUser: "impersonatedUser",
  startedAt: "startedAt",
  lastUpdatedAt: "lastUpdatedAt",
  durationMinutes: "durationMinutes",
  status: "status",
  priority: "priority",
  approvedBy: "approvedBy",
  reason: "reason",
  expiresAt: "expiresAt",
});

export const supportOperationsFieldClassifications =
  defineDataClassificationDeclarations(supportOperationsFields, [
    {
      field: supportOperationsFields.caseId,
      classification: dataClassification.internal,
    },
    {
      field: supportOperationsFields.supportAgent,
      classification: dataClassification.internal,
    },
    {
      field: supportOperationsFields.tenantScope,
      classification: dataClassification.internal,
    },
    {
      field: supportOperationsFields.tenantScopeId,
      classification: dataClassification.internal,
    },
    {
      field: supportOperationsFields.summary,
      classification: dataClassification.internal,
    },
    {
      field: supportOperationsFields.impersonatedUser,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: supportOperationsFields.startedAt,
      classification: dataClassification.internal,
    },
    {
      field: supportOperationsFields.lastUpdatedAt,
      classification: dataClassification.internal,
    },
    {
      field: supportOperationsFields.durationMinutes,
      classification: dataClassification.internal,
    },
    {
      field: supportOperationsFields.status,
      classification: dataClassification.internal,
    },
    {
      field: supportOperationsFields.priority,
      classification: dataClassification.internal,
    },
    {
      field: supportOperationsFields.approvedBy,
      classification: dataClassification.internal,
    },
    {
      field: supportOperationsFields.reason,
      classification: dataClassification.internal,
    },
    {
      field: supportOperationsFields.expiresAt,
      classification: dataClassification.internal,
    },
  ]);

export const supportOperationsManifest = defineModuleManifest({
  moduleId: platformModuleId.supportOperations,
  configKeys: [
    {
      key: supportOperationsConfigKey.impersonationMaxDurationMinutes,
      description: "Maximum impersonation session length.",
      schema: configSchemaType.number,
      defaultValue: 30,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.supportOperations,
    },
    {
      key: supportOperationsConfigKey.breakGlassMaxDurationMinutes,
      description: "Maximum break-glass access duration.",
      schema: configSchemaType.number,
      defaultValue: 30,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.supportOperations,
    },
  ],
  featureFlags: [
    {
      key: supportOperationsFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.supportOperations,
      purpose: "Gate support operations module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "None — core module.",
    },
    {
      key: supportOperationsFeatureFlag.breakGlassEnabled,
      description: "Enable break-glass emergency access.",
      owner: platformModuleId.supportOperations,
      purpose: "Gate emergency privileged access workflows.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [supportOperationsFeatureFlag.enabled],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Keep default-on until runtime feature-flag enforcement and post-incident review controls are wired end to end.",
    },
  ],
  permissionScopes: [permissionScope.supportImpersonate],
  fieldClassifications: supportOperationsFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(supportOperationsFields, [
    {
      profile: projectionProfile.admin,
      visibleFields: [
        supportOperationsFields.caseId,
        supportOperationsFields.supportAgent,
        supportOperationsFields.tenantScope,
        supportOperationsFields.tenantScopeId,
        supportOperationsFields.summary,
        supportOperationsFields.impersonatedUser,
        supportOperationsFields.startedAt,
        supportOperationsFields.lastUpdatedAt,
        supportOperationsFields.durationMinutes,
        supportOperationsFields.status,
        supportOperationsFields.priority,
        supportOperationsFields.approvedBy,
        supportOperationsFields.reason,
        supportOperationsFields.expiresAt,
      ],
      auditedFields: [supportOperationsFields.impersonatedUser],
    },
    {
      profile: projectionProfile.supportSafe,
      visibleFields: [
        supportOperationsFields.caseId,
        supportOperationsFields.supportAgent,
        supportOperationsFields.tenantScope,
        supportOperationsFields.tenantScopeId,
        supportOperationsFields.summary,
        supportOperationsFields.status,
        supportOperationsFields.priority,
        supportOperationsFields.startedAt,
        supportOperationsFields.lastUpdatedAt,
      ],
      auditedFields: [],
    },
  ]),
});
