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
  webhooksApiAccessConfigKey,
  webhooksApiAccessFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const webhooksApiAccessFields = defineModuleFields({
  apiKeyId: "apiKeyId",
  label: "label",
  prefix: "prefix",
  secretHash: "secretHash",
  subscriptionId: "subscriptionId",
  url: "url",
  events: "events",
  status: "status",
  createdAt: "createdAt",
  rotatedAt: "rotatedAt",
  revokedAt: "revokedAt",
  lastDeliveryAt: "lastDeliveryAt",
});

export const webhooksApiAccessFieldClassifications =
  defineDataClassificationDeclarations(webhooksApiAccessFields, [
    {
      field: webhooksApiAccessFields.apiKeyId,
      classification: dataClassification.internal,
    },
    {
      field: webhooksApiAccessFields.label,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: webhooksApiAccessFields.prefix,
      classification: dataClassification.internal,
    },
    {
      field: webhooksApiAccessFields.secretHash,
      classification: dataClassification.secret,
    },
    {
      field: webhooksApiAccessFields.subscriptionId,
      classification: dataClassification.internal,
    },
    {
      field: webhooksApiAccessFields.url,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: webhooksApiAccessFields.events,
      classification: dataClassification.internal,
    },
    {
      field: webhooksApiAccessFields.status,
      classification: dataClassification.internal,
    },
    {
      field: webhooksApiAccessFields.createdAt,
      classification: dataClassification.internal,
    },
    {
      field: webhooksApiAccessFields.rotatedAt,
      classification: dataClassification.internal,
    },
    {
      field: webhooksApiAccessFields.revokedAt,
      classification: dataClassification.internal,
    },
    {
      field: webhooksApiAccessFields.lastDeliveryAt,
      classification: dataClassification.internal,
    },
  ]);

export const webhooksApiAccessManifest = defineModuleManifest({
  moduleId: platformModuleId.webhooksApiAccess,
  configKeys: [
    {
      key: webhooksApiAccessConfigKey.deliveryMaxRetries,
      description: "Maximum retry attempts per webhook delivery.",
      schema: configSchemaType.number,
      defaultValue: 5,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.webhooksApiAccess,
    },
  ],
  featureFlags: [
    {
      key: webhooksApiAccessFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.webhooksApiAccess,
      purpose: "Gate webhooks and API access module.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "Enable once webhook infrastructure is stable.",
    },
  ],
  permissionScopes: [permissionScope.webhookManage],
  fieldClassifications: webhooksApiAccessFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(webhooksApiAccessFields, [
    {
      profile: projectionProfile.admin,
      visibleFields: [
        webhooksApiAccessFields.apiKeyId,
        webhooksApiAccessFields.label,
        webhooksApiAccessFields.prefix,
        webhooksApiAccessFields.subscriptionId,
        webhooksApiAccessFields.url,
        webhooksApiAccessFields.events,
        webhooksApiAccessFields.status,
        webhooksApiAccessFields.createdAt,
        webhooksApiAccessFields.rotatedAt,
        webhooksApiAccessFields.revokedAt,
        webhooksApiAccessFields.lastDeliveryAt,
      ],
      auditedFields: [
        webhooksApiAccessFields.label,
        webhooksApiAccessFields.url,
      ],
    },
    {
      profile: projectionProfile.summary,
      visibleFields: [
        webhooksApiAccessFields.apiKeyId,
        webhooksApiAccessFields.label,
        webhooksApiAccessFields.prefix,
        webhooksApiAccessFields.subscriptionId,
        webhooksApiAccessFields.status,
      ],
      auditedFields: [],
    },
  ]),
});
