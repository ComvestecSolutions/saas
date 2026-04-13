import {
  auditLogConfigKey,
  auditLogFeatureFlag,
  configSchemaType,
  permissionScope,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const auditLogManifest = defineModuleManifest({
  moduleId: platformModuleId.auditLog,
  configKeys: [
    {
      key: auditLogConfigKey.retentionDays,
      description: "Days before audit records are archived.",
      schema: configSchemaType.number,
      defaultValue: 365,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.enterprise],
      owner: platformModuleId.auditLog,
    },
    {
      key: auditLogConfigKey.sensitiveReadCapture,
      description: "Capture sensitive field access events.",
      schema: configSchemaType.boolean,
      defaultValue: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.auditLog,
    },
  ],
  featureFlags: [
    {
      key: auditLogFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.auditLog,
      purpose: "Gate audit log module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.auditRead],
  fieldClassifications: [],
  projectionProfiles: [],
});
