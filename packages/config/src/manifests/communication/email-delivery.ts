import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  emailDeliveryConfigKey,
  emailDeliveryFeatureFlag,
  featureFlagLifecycle,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const emailDeliveryFields = defineModuleFields({
  messageId: "messageId",
  suppressionId: "suppressionId",
  provider: "provider",
  recipient: "recipient",
  status: "status",
  template: "template",
  senderDisplayName: "senderDisplayName",
  fromEmail: "fromEmail",
  replyToEmail: "replyToEmail",
  sourceMessageId: "sourceMessageId",
  sentAt: "sentAt",
  lastEventAt: "lastEventAt",
  bounceType: "bounceType",
  suppressionReason: "suppressionReason",
  suppressedAt: "suppressedAt",
});

export const emailDeliveryFieldClassifications =
  defineDataClassificationDeclarations(emailDeliveryFields, [
    {
      field: emailDeliveryFields.messageId,
      classification: dataClassification.internal,
    },
    {
      field: emailDeliveryFields.suppressionId,
      classification: dataClassification.internal,
    },
    {
      field: emailDeliveryFields.provider,
      classification: dataClassification.internal,
    },
    {
      field: emailDeliveryFields.recipient,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: emailDeliveryFields.status,
      classification: dataClassification.internal,
    },
    {
      field: emailDeliveryFields.template,
      classification: dataClassification.internal,
    },
    {
      field: emailDeliveryFields.senderDisplayName,
      classification: dataClassification.internal,
    },
    {
      field: emailDeliveryFields.fromEmail,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: emailDeliveryFields.replyToEmail,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: emailDeliveryFields.sourceMessageId,
      classification: dataClassification.internal,
    },
    {
      field: emailDeliveryFields.sentAt,
      classification: dataClassification.internal,
    },
    {
      field: emailDeliveryFields.lastEventAt,
      classification: dataClassification.internal,
    },
    {
      field: emailDeliveryFields.bounceType,
      classification: dataClassification.internal,
    },
    {
      field: emailDeliveryFields.suppressionReason,
      classification: dataClassification.internal,
    },
    {
      field: emailDeliveryFields.suppressedAt,
      classification: dataClassification.internal,
    },
  ]);

export const emailDeliveryManifest = defineModuleManifest({
  moduleId: platformModuleId.emailDelivery,
  configKeys: [
    {
      key: emailDeliveryConfigKey.rateLimitPerMinute,
      description: "Maximum emails per minute per tenant.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform, platformScope.enterprise],
      owner: platformModuleId.emailDelivery,
    },
  ],
  featureFlags: [
    {
      key: emailDeliveryFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.emailDelivery,
      purpose: "Gate email delivery module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.emailManage],
  fieldClassifications: emailDeliveryFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(emailDeliveryFields, [
    {
      profile: projectionProfile.admin,
      visibleFields: [
        emailDeliveryFields.messageId,
        emailDeliveryFields.suppressionId,
        emailDeliveryFields.recipient,
        emailDeliveryFields.template,
        emailDeliveryFields.status,
        emailDeliveryFields.sourceMessageId,
        emailDeliveryFields.sentAt,
        emailDeliveryFields.lastEventAt,
        emailDeliveryFields.bounceType,
        emailDeliveryFields.suppressionReason,
        emailDeliveryFields.suppressedAt,
      ],
      auditedFields: [emailDeliveryFields.recipient],
    },
    {
      profile: projectionProfile.summary,
      visibleFields: [
        emailDeliveryFields.messageId,
        emailDeliveryFields.template,
        emailDeliveryFields.status,
        emailDeliveryFields.sentAt,
        emailDeliveryFields.lastEventAt,
      ],
      auditedFields: [],
    },
  ]),
});
