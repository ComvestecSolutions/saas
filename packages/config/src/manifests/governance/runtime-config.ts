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
} from "@comvestec/contracts";
import {
  defineModuleConfigKeys,
  defineModuleFeatureFlags,
  defineModuleManifest,
} from "../../manifest-helpers";

export const runtimeConfigConfigKey = defineModuleConfigKeys(
  platformModuleId.runtimeConfig,
  {
    syncStrategy: "sync.strategy",
    approvalsEnabled: "approvals.enabled",
  },
);

export const runtimeConfigFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.runtimeConfig,
  {
    enabled: "enabled",
    inlineDiffViewer: "inlineDiffViewer",
  },
);

export const runtimeConfigFields = defineModuleFields({
  moduleId: "moduleId",
  effectiveValue: "effectiveValue",
  source: "source",
});

export const runtimeConfigFieldClassifications =
  defineDataClassificationDeclarations(runtimeConfigFields, [
    {
      field: runtimeConfigFields.moduleId,
      classification: dataClassification.internal,
    },
    {
      field: runtimeConfigFields.effectiveValue,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: runtimeConfigFields.source,
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
        runtimeConfigFields.effectiveValue,
        runtimeConfigFields.source,
      ],
      auditedFields: [runtimeConfigFields.effectiveValue],
    },
  ]),
});
