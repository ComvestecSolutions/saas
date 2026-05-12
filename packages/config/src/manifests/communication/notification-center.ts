import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  notificationCenterConfigKey,
  notificationCenterFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const notificationCenterFields = defineModuleFields({
  id: "id",
  channel: "channel",
  family: "family",
  status: "status",
  recipient: "recipient",
  template: "template",
  actorId: "actorId",
  sourceModuleId: "sourceModuleId",
  sourceEventId: "sourceEventId",
  title: "title",
  bodySummary: "bodySummary",
  actionLabel: "actionLabel",
  actionUrl: "actionUrl",
  correlationId: "correlationId",
  correlatedEmailReceiptId: "correlatedEmailReceiptId",
  correlatedDigestRunId: "correlatedDigestRunId",
  readAt: "readAt",
  dismissedAt: "dismissedAt",
  emailDeliveryMessageId: "emailDeliveryMessageId",
  queueFailureSummary: "queueFailureSummary",
  suppressionReason: "suppressionReason",
  createdAt: "createdAt",
  enabled: "enabled",
  updatedBy: "updatedBy",
  updatedAt: "updatedAt",
});

export const notificationCenterFieldClassifications =
  defineDataClassificationDeclarations(notificationCenterFields, [
    {
      field: notificationCenterFields.id,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.channel,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.family,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.status,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.recipient,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: notificationCenterFields.template,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.actorId,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: notificationCenterFields.sourceModuleId,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.sourceEventId,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.title,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: notificationCenterFields.bodySummary,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: notificationCenterFields.actionLabel,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: notificationCenterFields.actionUrl,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: notificationCenterFields.correlationId,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.correlatedEmailReceiptId,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.correlatedDigestRunId,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.readAt,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.dismissedAt,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.emailDeliveryMessageId,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.queueFailureSummary,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.suppressionReason,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.createdAt,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.enabled,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.updatedBy,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterFields.updatedAt,
      classification: dataClassification.internal,
    },
  ]);

export const notificationCenterManifest = defineModuleManifest({
  moduleId: platformModuleId.notificationCenter,
  configKeys: [
    {
      key: notificationCenterConfigKey.digestIntervalMinutes,
      description:
        "Active digest window in minutes; 0 preserves immediate send.",
      schema: configSchemaType.number,
      defaultValue: 0,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.organization],
      owner: platformModuleId.notificationCenter,
    },
  ],
  featureFlags: [
    {
      key: notificationCenterFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.notificationCenter,
      purpose: "Gate notification center module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.notificationManage],
  fieldClassifications: notificationCenterFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(notificationCenterFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        notificationCenterFields.id,
        notificationCenterFields.channel,
        notificationCenterFields.family,
        notificationCenterFields.status,
        notificationCenterFields.title,
        notificationCenterFields.bodySummary,
        notificationCenterFields.actionLabel,
        notificationCenterFields.actionUrl,
        notificationCenterFields.readAt,
        notificationCenterFields.dismissedAt,
        notificationCenterFields.createdAt,
        notificationCenterFields.updatedAt,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.admin,
      visibleFields: [
        notificationCenterFields.id,
        notificationCenterFields.channel,
        notificationCenterFields.family,
        notificationCenterFields.status,
        notificationCenterFields.recipient,
        notificationCenterFields.template,
        notificationCenterFields.actorId,
        notificationCenterFields.sourceModuleId,
        notificationCenterFields.sourceEventId,
        notificationCenterFields.title,
        notificationCenterFields.bodySummary,
        notificationCenterFields.actionLabel,
        notificationCenterFields.actionUrl,
        notificationCenterFields.correlationId,
        notificationCenterFields.correlatedEmailReceiptId,
        notificationCenterFields.correlatedDigestRunId,
        notificationCenterFields.readAt,
        notificationCenterFields.dismissedAt,
        notificationCenterFields.emailDeliveryMessageId,
        notificationCenterFields.queueFailureSummary,
        notificationCenterFields.suppressionReason,
        notificationCenterFields.createdAt,
        notificationCenterFields.enabled,
        notificationCenterFields.updatedBy,
        notificationCenterFields.updatedAt,
      ],
      auditedFields: [
        notificationCenterFields.recipient,
        notificationCenterFields.actorId,
        notificationCenterFields.title,
        notificationCenterFields.bodySummary,
        notificationCenterFields.actionLabel,
        notificationCenterFields.actionUrl,
      ],
    },
  ]),
});
