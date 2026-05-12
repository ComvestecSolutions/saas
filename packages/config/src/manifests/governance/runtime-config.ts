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
  runtimeConfigConfigKey,
  runtimeConfigFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const runtimeConfigFields = defineModuleFields({
  moduleId: "moduleId",
  key: "key",
  scope: "scope",
  scopeId: "scopeId",
  value: "value",
  source: "source",
  changedBy: "changedBy",
  changedAt: "changedAt",
  approvalReason: "approvalReason",
  proposalId: "proposalId",
  action: "action",
  artifactPath: "artifactPath",
  runtimeValue: "runtimeValue",
  codeValue: "codeValue",
  status: "status",
  generatedAt: "generatedAt",
  decidedBy: "decidedBy",
  decisionReason: "decisionReason",
  decidedAt: "decidedAt",
});

export const runtimeConfigFieldClassifications =
  defineDataClassificationDeclarations(runtimeConfigFields, [
    {
      field: runtimeConfigFields.moduleId,
      classification: dataClassification.internal,
    },
    {
      field: runtimeConfigFields.key,
      classification: dataClassification.internal,
    },
    {
      field: runtimeConfigFields.scope,
      classification: dataClassification.internal,
    },
    {
      field: runtimeConfigFields.scopeId,
      classification: dataClassification.internal,
    },
    {
      field: runtimeConfigFields.value,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: runtimeConfigFields.source,
      classification: dataClassification.internal,
    },
    {
      field: runtimeConfigFields.changedBy,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: runtimeConfigFields.changedAt,
      classification: dataClassification.internal,
    },
    {
      field: runtimeConfigFields.approvalReason,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: runtimeConfigFields.proposalId,
      classification: dataClassification.internal,
    },
    {
      field: runtimeConfigFields.action,
      classification: dataClassification.internal,
    },
    {
      field: runtimeConfigFields.artifactPath,
      classification: dataClassification.internal,
    },
    {
      field: runtimeConfigFields.runtimeValue,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: runtimeConfigFields.codeValue,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: runtimeConfigFields.status,
      classification: dataClassification.internal,
    },
    {
      field: runtimeConfigFields.generatedAt,
      classification: dataClassification.internal,
    },
    {
      field: runtimeConfigFields.decidedBy,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: runtimeConfigFields.decisionReason,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: runtimeConfigFields.decidedAt,
      classification: dataClassification.internal,
    },
  ]);

export const runtimeConfigManifest = defineModuleManifest({
  moduleId: platformModuleId.runtimeConfig,
  configKeys: [
    {
      key: runtimeConfigConfigKey.syncStrategy,
      description: "Sync strategy between code and database.",
      schema: configSchemaType.string,
      defaultValue: "bidirectional",
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.runtimeConfig,
    },
    {
      key: runtimeConfigConfigKey.approvalsEnabled,
      description: "Whether runtime config changes require approvals.",
      schema: configSchemaType.boolean,
      defaultValue: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.runtimeConfig,
    },
  ],
  featureFlags: [
    {
      key: runtimeConfigFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.runtimeConfig,
      purpose: "Gate runtime config module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "None — core module.",
    },
    {
      key: runtimeConfigFeatureFlag.inlineDiffViewer,
      description: "Show inline diff in admin config screens.",
      owner: platformModuleId.runtimeConfig,
      purpose: "Enable visual diff comparison for config changes.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [runtimeConfigFeatureFlag.enabled],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "Promote to default when stable.",
    },
  ],
  permissionScopes: [
    permissionScope.configRead,
    permissionScope.configWrite,
    permissionScope.auditRead,
  ],
  fieldClassifications: runtimeConfigFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(runtimeConfigFields, [
    {
      profile: projectionProfile.admin,
      visibleFields: [
        runtimeConfigFields.moduleId,
        runtimeConfigFields.key,
        runtimeConfigFields.scope,
        runtimeConfigFields.scopeId,
        runtimeConfigFields.value,
        runtimeConfigFields.source,
        runtimeConfigFields.changedBy,
        runtimeConfigFields.changedAt,
        runtimeConfigFields.approvalReason,
        runtimeConfigFields.proposalId,
        runtimeConfigFields.action,
        runtimeConfigFields.artifactPath,
        runtimeConfigFields.runtimeValue,
        runtimeConfigFields.codeValue,
        runtimeConfigFields.status,
        runtimeConfigFields.generatedAt,
        runtimeConfigFields.decidedBy,
        runtimeConfigFields.decisionReason,
        runtimeConfigFields.decidedAt,
      ],
      auditedFields: [
        runtimeConfigFields.value,
        runtimeConfigFields.approvalReason,
        runtimeConfigFields.runtimeValue,
        runtimeConfigFields.codeValue,
        runtimeConfigFields.decidedBy,
        runtimeConfigFields.decisionReason,
      ],
    },
  ]),
});
