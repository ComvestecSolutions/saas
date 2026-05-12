import { Schema } from "effect";
import { PlatformScopeSchema } from "../access/platform-scopes";
import { IsoTimestampSchema } from "../runtime/timestamps";

const EmailDeliveryStatusConstantSchema = Schema.Struct({
  queued: Schema.Literal("queued"),
  delivered: Schema.Literal("delivered"),
  bounced: Schema.Literal("bounced"),
  complained: Schema.Literal("complained"),
  failed: Schema.Literal("failed"),
});

export const emailDeliveryStatus = Schema.validateSync(
  EmailDeliveryStatusConstantSchema,
)({
  queued: "queued",
  delivered: "delivered",
  bounced: "bounced",
  complained: "complained",
  failed: "failed",
} satisfies Schema.Schema.Type<typeof EmailDeliveryStatusConstantSchema>);

export const emailDeliveryStatuses = [
  emailDeliveryStatus.queued,
  emailDeliveryStatus.delivered,
  emailDeliveryStatus.bounced,
  emailDeliveryStatus.complained,
  emailDeliveryStatus.failed,
] as const;

export const EmailDeliveryStatusSchema = Schema.Literal(
  ...emailDeliveryStatuses,
);

export type EmailDeliveryStatus = Schema.Schema.Type<
  typeof EmailDeliveryStatusSchema
>;

const EmailDeliveryProviderEventTypeConstantSchema = Schema.Struct({
  delivered: Schema.Literal("delivered"),
  bounced: Schema.Literal("bounced"),
  complained: Schema.Literal("complained"),
});

export const emailDeliveryProviderEventType = Schema.validateSync(
  EmailDeliveryProviderEventTypeConstantSchema,
)({
  delivered: "delivered",
  bounced: "bounced",
  complained: "complained",
} satisfies Schema.Schema.Type<
  typeof EmailDeliveryProviderEventTypeConstantSchema
>);

export const emailDeliveryProviderEventTypes = [
  emailDeliveryProviderEventType.delivered,
  emailDeliveryProviderEventType.bounced,
  emailDeliveryProviderEventType.complained,
] as const;

export const EmailDeliveryProviderEventTypeSchema = Schema.Literal(
  ...emailDeliveryProviderEventTypes,
);

export type EmailDeliveryProviderEventType = Schema.Schema.Type<
  typeof EmailDeliveryProviderEventTypeSchema
>;

const EmailDeliveryBounceTypeConstantSchema = Schema.Struct({
  hard: Schema.Literal("hard"),
  soft: Schema.Literal("soft"),
});

export const emailDeliveryBounceType = Schema.validateSync(
  EmailDeliveryBounceTypeConstantSchema,
)({
  hard: "hard",
  soft: "soft",
} satisfies Schema.Schema.Type<typeof EmailDeliveryBounceTypeConstantSchema>);

export const emailDeliveryBounceTypes = [
  emailDeliveryBounceType.hard,
  emailDeliveryBounceType.soft,
] as const;

export const EmailDeliveryBounceTypeSchema = Schema.Literal(
  ...emailDeliveryBounceTypes,
);

export type EmailDeliveryBounceType = Schema.Schema.Type<
  typeof EmailDeliveryBounceTypeSchema
>;

const EmailSuppressionReasonConstantSchema = Schema.Struct({
  bounced: Schema.Literal("bounced"),
  complained: Schema.Literal("complained"),
});

export const emailSuppressionReason = Schema.validateSync(
  EmailSuppressionReasonConstantSchema,
)({
  bounced: "bounced",
  complained: "complained",
} satisfies Schema.Schema.Type<typeof EmailSuppressionReasonConstantSchema>);

export const emailSuppressionReasons = [
  emailSuppressionReason.bounced,
  emailSuppressionReason.complained,
] as const;

export const EmailSuppressionReasonSchema = Schema.Literal(
  ...emailSuppressionReasons,
);

export type EmailSuppressionReason = Schema.Schema.Type<
  typeof EmailSuppressionReasonSchema
>;

const EmailDeliveryTemplateIdConstantSchema = Schema.Struct({
  billingInvoiceReady: Schema.Literal("billing.invoice-ready"),
  billingInvoiceReadyDigest: Schema.Literal("billing.invoice-ready-digest"),
  identitySessionEmailVerification: Schema.Literal(
    "identity-session.email-verification",
  ),
  identitySessionMfaCode: Schema.Literal("identity-session.mfa-code"),
  identitySessionPasswordReset: Schema.Literal(
    "identity-session.password-reset",
  ),
  notificationCenterNewsletter: Schema.Literal(
    "notification-center.newsletter",
  ),
  notificationCenterWelcomeCampaign: Schema.Literal(
    "notification-center.welcome-campaign",
  ),
  tenantMembershipInvitation: Schema.Literal(
    "tenant-management.membership-invitation",
  ),
  tenantMembershipInvitationReminder: Schema.Literal(
    "tenant-management.membership-invitation-reminder",
  ),
  tenantMembershipInvitationExpiryNotification: Schema.Literal(
    "tenant-management.membership-invitation-expiry-notification",
  ),
});

export const emailDeliveryTemplateId = Schema.validateSync(
  EmailDeliveryTemplateIdConstantSchema,
)({
  billingInvoiceReady: "billing.invoice-ready",
  billingInvoiceReadyDigest: "billing.invoice-ready-digest",
  identitySessionEmailVerification: "identity-session.email-verification",
  identitySessionMfaCode: "identity-session.mfa-code",
  identitySessionPasswordReset: "identity-session.password-reset",
  notificationCenterNewsletter: "notification-center.newsletter",
  notificationCenterWelcomeCampaign: "notification-center.welcome-campaign",
  tenantMembershipInvitation: "tenant-management.membership-invitation",
  tenantMembershipInvitationReminder:
    "tenant-management.membership-invitation-reminder",
  tenantMembershipInvitationExpiryNotification:
    "tenant-management.membership-invitation-expiry-notification",
} satisfies Schema.Schema.Type<typeof EmailDeliveryTemplateIdConstantSchema>);

export const emailDeliveryTemplateIds = [
  emailDeliveryTemplateId.billingInvoiceReady,
  emailDeliveryTemplateId.billingInvoiceReadyDigest,
  emailDeliveryTemplateId.identitySessionEmailVerification,
  emailDeliveryTemplateId.identitySessionMfaCode,
  emailDeliveryTemplateId.identitySessionPasswordReset,
  emailDeliveryTemplateId.notificationCenterNewsletter,
  emailDeliveryTemplateId.notificationCenterWelcomeCampaign,
  emailDeliveryTemplateId.tenantMembershipInvitation,
  emailDeliveryTemplateId.tenantMembershipInvitationReminder,
  emailDeliveryTemplateId.tenantMembershipInvitationExpiryNotification,
] as const;

export const EmailDeliveryTemplateIdSchema = Schema.Literal(
  ...emailDeliveryTemplateIds,
);

export type EmailDeliveryTemplateId = Schema.Schema.Type<
  typeof EmailDeliveryTemplateIdSchema
>;

export const EmailDeliveryMessageReferenceSchema = Schema.Struct({
  messageId: Schema.NonEmptyString,
});

export type EmailDeliveryMessageReference = Schema.Schema.Type<
  typeof EmailDeliveryMessageReferenceSchema
>;

export const EmailRecipientSuppressionLookupSchema = Schema.Struct({
  recipient: Schema.NonEmptyString,
});

export type EmailRecipientSuppressionLookup = Schema.Schema.Type<
  typeof EmailRecipientSuppressionLookupSchema
>;

export const EmailDeliveryTrackingRecordSchema = Schema.Struct({
  messageId: Schema.NonEmptyString,
  provider: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  recipient: Schema.NonEmptyString,
  status: EmailDeliveryStatusSchema,
  template: Schema.optional(Schema.NonEmptyString),
  senderDisplayName: Schema.NonEmptyString,
  fromEmail: Schema.NonEmptyString,
  replyToEmail: Schema.NonEmptyString,
  sentAt: IsoTimestampSchema,
  lastEventAt: Schema.optional(IsoTimestampSchema),
  bounceType: Schema.optional(EmailDeliveryBounceTypeSchema),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type EmailDeliveryTrackingRecord = Schema.Schema.Type<
  typeof EmailDeliveryTrackingRecordSchema
>;

export const EmailDeliveryTrackingAdminViewSchema = Schema.Struct({
  messageId: Schema.NonEmptyString,
  recipient: Schema.NonEmptyString,
  template: Schema.optional(Schema.NonEmptyString),
  status: EmailDeliveryStatusSchema,
  sentAt: IsoTimestampSchema,
  lastEventAt: Schema.optional(IsoTimestampSchema),
  bounceType: Schema.optional(EmailDeliveryBounceTypeSchema),
});

export type EmailDeliveryTrackingAdminView = Schema.Schema.Type<
  typeof EmailDeliveryTrackingAdminViewSchema
>;

export const EmailRecipientSuppressionRecordSchema = Schema.Struct({
  suppressionId: Schema.NonEmptyString,
  recipient: Schema.NonEmptyString,
  reason: EmailSuppressionReasonSchema,
  sourceMessageId: Schema.NonEmptyString,
  bounceType: Schema.optional(EmailDeliveryBounceTypeSchema),
  suppressedAt: IsoTimestampSchema,
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type EmailRecipientSuppressionRecord = Schema.Schema.Type<
  typeof EmailRecipientSuppressionRecordSchema
>;

export const EmailRecipientSuppressionAdminViewSchema = Schema.Struct({
  suppressionId: Schema.NonEmptyString,
  recipient: Schema.NonEmptyString,
  suppressionReason: EmailSuppressionReasonSchema,
  sourceMessageId: Schema.NonEmptyString,
  bounceType: Schema.optional(EmailDeliveryBounceTypeSchema),
  suppressedAt: IsoTimestampSchema,
});

export type EmailRecipientSuppressionAdminView = Schema.Schema.Type<
  typeof EmailRecipientSuppressionAdminViewSchema
>;

export const EmailDeliveryProviderEventSchema = Schema.Union(
  Schema.Struct({
    messageId: Schema.NonEmptyString,
    eventType: Schema.Literal(emailDeliveryProviderEventType.delivered),
    occurredAt: IsoTimestampSchema,
  }),
  Schema.Struct({
    messageId: Schema.NonEmptyString,
    eventType: Schema.Literal(emailDeliveryProviderEventType.bounced),
    bounceType: EmailDeliveryBounceTypeSchema,
    occurredAt: IsoTimestampSchema,
  }),
  Schema.Struct({
    messageId: Schema.NonEmptyString,
    eventType: Schema.Literal(emailDeliveryProviderEventType.complained),
    occurredAt: IsoTimestampSchema,
  }),
);

export type EmailDeliveryProviderEvent = Schema.Schema.Type<
  typeof EmailDeliveryProviderEventSchema
>;
