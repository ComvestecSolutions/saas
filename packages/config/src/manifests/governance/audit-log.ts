import {
  auditLogConfigKey,
  auditLogFeatureFlag,
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
import { defineModuleManifest } from "../../manifest-helpers";

export const auditLogFields = defineModuleFields({
  eventId: "eventId",
  timestamp: "timestamp",
  actorId: "actorId",
  moduleId: "moduleId",
  tenantScope: "tenantScope",
  tenantScopeId: "tenantScopeId",
  action: "action",
  target: "target",
  reason: "reason",
  correlationId: "correlationId",
});

export const auditLogFieldClassifications =
  defineDataClassificationDeclarations(auditLogFields, [
    {
      field: auditLogFields.eventId,
      classification: dataClassification.internal,
    },
    {
      field: auditLogFields.timestamp,
      classification: dataClassification.internal,
    },
    {
      field: auditLogFields.actorId,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: auditLogFields.moduleId,
      classification: dataClassification.internal,
    },
    {
      field: auditLogFields.tenantScope,
      classification: dataClassification.internal,
    },
    {
      field: auditLogFields.tenantScopeId,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: auditLogFields.action,
      classification: dataClassification.internal,
    },
    {
      field: auditLogFields.target,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: auditLogFields.reason,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: auditLogFields.correlationId,
      classification: dataClassification.internal,
    },
  ]);

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
  fieldClassifications: auditLogFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(auditLogFields, [
    {
      profile: projectionProfile.admin,
      visibleFields: [
        auditLogFields.eventId,
        auditLogFields.timestamp,
        auditLogFields.actorId,
        auditLogFields.moduleId,
        auditLogFields.tenantScope,
        auditLogFields.tenantScopeId,
        auditLogFields.action,
        auditLogFields.target,
        auditLogFields.reason,
        auditLogFields.correlationId,
      ],
      auditedFields: [
        auditLogFields.actorId,
        auditLogFields.tenantScopeId,
        auditLogFields.target,
        auditLogFields.reason,
      ],
    },
  ]),
});
