import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  permissionScope,
  platformModuleId,
  platformScope,
  supportOperationsConfigKey,
  supportOperationsFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const supportOperationsFields = defineModuleFields({
  companyName: "companyName",
  ssn: "ssn",
});

export const supportOperationsFieldClassifications =
  defineDataClassificationDeclarations(supportOperationsFields, [
    {
      field: supportOperationsFields.companyName,
      classification: dataClassification.public,
    },
    {
      field: supportOperationsFields.ssn,
      classification: dataClassification.regulatedSensitive,
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
      retirementPlan: "None — core module.",
    },
    {
      key: supportOperationsFeatureFlag.breakGlassEnabled,
      description: "Enable break-glass emergency access.",
      owner: platformModuleId.supportOperations,
      purpose: "Gate emergency privileged access workflows.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan:
        "Promote to default after approval and post-incident review flows are validated.",
    },
  ],
  permissionScopes: [permissionScope.supportImpersonate],
  fieldClassifications: supportOperationsFieldClassifications,
  projectionProfiles: [],
});
