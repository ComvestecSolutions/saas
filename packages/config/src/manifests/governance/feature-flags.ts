import {
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  featureFlagsFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const featureFlagsFields = defineModuleFields({
  key: "key",
  description: "description",
  owner: "owner",
  purpose: "purpose",
  defaultEnabled: "defaultEnabled",
  effectiveState: "effectiveState",
  source: "source",
  entitled: "entitled",
  dependencies: "dependencies",
  lifecycle: "lifecycle",
  retirementPlan: "retirementPlan",
  scope: "scope",
});

export const featureFlagsFieldClassifications =
  defineDataClassificationDeclarations(featureFlagsFields, [
    {
      field: featureFlagsFields.key,
      classification: dataClassification.internal,
    },
    {
      field: featureFlagsFields.description,
      classification: dataClassification.internal,
    },
    {
      field: featureFlagsFields.owner,
      classification: dataClassification.internal,
    },
    {
      field: featureFlagsFields.purpose,
      classification: dataClassification.internal,
    },
    {
      field: featureFlagsFields.defaultEnabled,
      classification: dataClassification.internal,
    },
    {
      field: featureFlagsFields.effectiveState,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: featureFlagsFields.source,
      classification: dataClassification.internal,
    },
    {
      field: featureFlagsFields.entitled,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: featureFlagsFields.dependencies,
      classification: dataClassification.internal,
    },
    {
      field: featureFlagsFields.lifecycle,
      classification: dataClassification.internal,
    },
    {
      field: featureFlagsFields.retirementPlan,
      classification: dataClassification.internal,
    },
    {
      field: featureFlagsFields.scope,
      classification: dataClassification.internal,
    },
  ]);

export const featureFlagsManifest = defineModuleManifest({
  moduleId: platformModuleId.featureFlags,
  configKeys: [],
  featureFlags: [
    {
      key: featureFlagsFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.featureFlags,
      purpose: "Gate feature flags module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "None — core module.",
    },
    {
      key: featureFlagsFeatureFlag.legacyRolloutCatalog,
      description: "Retired local rollout catalog surface.",
      owner: platformModuleId.featureFlags,
      purpose:
        "Keep retired feature-flag declarations visible after operator rollout inspection moved into admin governance projections.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.retired,
      retirementPlan:
        "Retired after admin governance effective-state projections replaced the local rollout catalog.",
    },
  ],
  permissionScopes: [permissionScope.flagRead, permissionScope.flagWrite],
  fieldClassifications: featureFlagsFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(featureFlagsFields, [
    {
      profile: projectionProfile.admin,
      visibleFields: [
        featureFlagsFields.key,
        featureFlagsFields.description,
        featureFlagsFields.owner,
        featureFlagsFields.purpose,
        featureFlagsFields.defaultEnabled,
        featureFlagsFields.effectiveState,
        featureFlagsFields.source,
        featureFlagsFields.entitled,
        featureFlagsFields.dependencies,
        featureFlagsFields.lifecycle,
        featureFlagsFields.retirementPlan,
        featureFlagsFields.scope,
      ],
      auditedFields: [featureFlagsFields.effectiveState],
    },
    {
      profile: projectionProfile.summary,
      visibleFields: [
        featureFlagsFields.key,
        featureFlagsFields.effectiveState,
        featureFlagsFields.lifecycle,
      ],
      auditedFields: [],
    },
  ]),
});
