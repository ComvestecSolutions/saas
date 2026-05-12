import { Schema } from "effect";
import { EmailDeliveryTemplateIdSchema } from "./email-delivery";
import { PlatformScopeSchema } from "../access/platform-scopes";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { AbsoluteRedirectUriSchema } from "../runtime/redirect-uris";
import { PlatformModuleIdSchema } from "../module-registry/modules";

const NotificationCenterChannelConstantSchema = Schema.Struct({
  email: Schema.Literal("email"),
  inApp: Schema.Literal("in-app"),
});

export const notificationCenterChannel = Schema.validateSync(
  NotificationCenterChannelConstantSchema,
)({
  email: "email",
  inApp: "in-app",
} satisfies Schema.Schema.Type<typeof NotificationCenterChannelConstantSchema>);

export const notificationCenterChannels = [
  notificationCenterChannel.email,
  notificationCenterChannel.inApp,
] as const;

export const NotificationCenterChannelSchema = Schema.Literal(
  ...notificationCenterChannels,
);

export type NotificationCenterChannel = Schema.Schema.Type<
  typeof NotificationCenterChannelSchema
>;

export const NotificationCenterEmailChannelSchema = Schema.Literal(
  notificationCenterChannel.email,
);

export const NotificationCenterInAppChannelSchema = Schema.Literal(
  notificationCenterChannel.inApp,
);

const NotificationCenterNotificationFamilyConstantSchema = Schema.Struct({
  billingInvoiceReady: Schema.Literal("billing.invoice-ready"),
});

export const notificationCenterNotificationFamily = Schema.validateSync(
  NotificationCenterNotificationFamilyConstantSchema,
)({
  billingInvoiceReady: "billing.invoice-ready",
} satisfies Schema.Schema.Type<
  typeof NotificationCenterNotificationFamilyConstantSchema
>);

export const notificationCenterNotificationFamilies = [
  notificationCenterNotificationFamily.billingInvoiceReady,
] as const;

export const NotificationCenterNotificationFamilySchema = Schema.Literal(
  ...notificationCenterNotificationFamilies,
);

export type NotificationCenterNotificationFamily = Schema.Schema.Type<
  typeof NotificationCenterNotificationFamilySchema
>;

const NotificationCenterInAppStatusConstantSchema = Schema.Struct({
  unread: Schema.Literal("unread"),
  read: Schema.Literal("read"),
  dismissed: Schema.Literal("dismissed"),
});

export const notificationCenterInAppStatus = Schema.validateSync(
  NotificationCenterInAppStatusConstantSchema,
)({
  unread: "unread",
  read: "read",
  dismissed: "dismissed",
} satisfies Schema.Schema.Type<
  typeof NotificationCenterInAppStatusConstantSchema
>);

export const notificationCenterInAppStatuses = [
  notificationCenterInAppStatus.unread,
  notificationCenterInAppStatus.read,
  notificationCenterInAppStatus.dismissed,
] as const;

export const NotificationCenterInAppStatusSchema = Schema.Literal(
  ...notificationCenterInAppStatuses,
);

export type NotificationCenterInAppStatus = Schema.Schema.Type<
  typeof NotificationCenterInAppStatusSchema
>;

const NotificationCenterReceiptStatusConstantSchema = Schema.Struct({
  queued: Schema.Literal("queued"),
  queueFailed: Schema.Literal("queue-failed"),
  suppressed: Schema.Literal("suppressed"),
});

export const notificationCenterReceiptStatus = Schema.validateSync(
  NotificationCenterReceiptStatusConstantSchema,
)({
  queued: "queued",
  queueFailed: "queue-failed",
  suppressed: "suppressed",
} satisfies Schema.Schema.Type<
  typeof NotificationCenterReceiptStatusConstantSchema
>);

export const notificationCenterReceiptStatuses = [
  notificationCenterReceiptStatus.queued,
  notificationCenterReceiptStatus.queueFailed,
  notificationCenterReceiptStatus.suppressed,
] as const;

export const NotificationCenterReceiptStatusSchema = Schema.Literal(
  ...notificationCenterReceiptStatuses,
);

export type NotificationCenterReceiptStatus = Schema.Schema.Type<
  typeof NotificationCenterReceiptStatusSchema
>;

const NotificationCenterDigestRunStatusConstantSchema = Schema.Struct({
  scheduled: Schema.Literal("scheduled"),
  running: Schema.Literal("running"),
  queued: Schema.Literal("queued"),
  queueFailed: Schema.Literal("queue-failed"),
  failed: Schema.Literal("failed"),
  canceled: Schema.Literal("canceled"),
});

export const notificationCenterDigestRunStatus = Schema.validateSync(
  NotificationCenterDigestRunStatusConstantSchema,
)({
  scheduled: "scheduled",
  running: "running",
  queued: "queued",
  queueFailed: "queue-failed",
  failed: "failed",
  canceled: "canceled",
} satisfies Schema.Schema.Type<
  typeof NotificationCenterDigestRunStatusConstantSchema
>);

export const notificationCenterDigestRunStatuses = [
  notificationCenterDigestRunStatus.scheduled,
  notificationCenterDigestRunStatus.running,
  notificationCenterDigestRunStatus.queued,
  notificationCenterDigestRunStatus.queueFailed,
  notificationCenterDigestRunStatus.failed,
  notificationCenterDigestRunStatus.canceled,
] as const;

export const NotificationCenterDigestRunStatusSchema = Schema.Literal(
  ...notificationCenterDigestRunStatuses,
);

export type NotificationCenterDigestRunStatus = Schema.Schema.Type<
  typeof NotificationCenterDigestRunStatusSchema
>;

export const NotificationCenterEmailReceiptReferenceSchema = Schema.Struct({
  notificationId: Schema.NonEmptyString,
});

export type NotificationCenterEmailReceiptReference = Schema.Schema.Type<
  typeof NotificationCenterEmailReceiptReferenceSchema
>;

export const NotificationCenterDigestRunReferenceSchema = Schema.Struct({
  digestRunId: Schema.NonEmptyString,
});

export type NotificationCenterDigestRunReference = Schema.Schema.Type<
  typeof NotificationCenterDigestRunReferenceSchema
>;

export const NotificationCenterEmailReceiptRecordSchema = Schema.Struct({
  notificationId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  channel: NotificationCenterEmailChannelSchema,
  recipient: Schema.NonEmptyString,
  template: EmailDeliveryTemplateIdSchema,
  status: NotificationCenterReceiptStatusSchema,
  emailDeliveryMessageId: Schema.optional(Schema.NonEmptyString),
  queueReceiptId: Schema.optional(Schema.NonEmptyString),
  queueFailureSummary: Schema.optional(Schema.NonEmptyString),
  suppressionReason: Schema.optional(Schema.NonEmptyString),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type NotificationCenterEmailReceiptRecord = Schema.Schema.Type<
  typeof NotificationCenterEmailReceiptRecordSchema
>;

export const NotificationCenterDigestCandidateRecordSchema = Schema.Struct({
  candidateId: Schema.NonEmptyString,
  sourceNotificationId: Schema.NonEmptyString,
  digestRunId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  channel: NotificationCenterEmailChannelSchema,
  recipient: Schema.NonEmptyString,
  sourceTemplate: EmailDeliveryTemplateIdSchema,
  digestTemplate: EmailDeliveryTemplateIdSchema,
  windowEndsAt: IsoTimestampSchema,
  invoiceNumber: Schema.NonEmptyString,
  invoiceUrl: Schema.NonEmptyString,
  dueAt: IsoTimestampSchema,
  totalDue: Schema.NonEmptyString,
  digestedAt: Schema.optional(IsoTimestampSchema),
  canceledAt: Schema.optional(IsoTimestampSchema),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type NotificationCenterDigestCandidateRecord = Schema.Schema.Type<
  typeof NotificationCenterDigestCandidateRecordSchema
>;

export const NotificationCenterDigestRunRecordSchema = Schema.Struct({
  digestRunId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  recipient: Schema.NonEmptyString,
  channel: NotificationCenterEmailChannelSchema,
  template: EmailDeliveryTemplateIdSchema,
  scheduledAt: IsoTimestampSchema,
  startedAt: Schema.optional(IsoTimestampSchema),
  completedAt: Schema.optional(IsoTimestampSchema),
  status: NotificationCenterDigestRunStatusSchema,
  itemCount: Schema.Number,
  emailDeliveryMessageId: Schema.optional(Schema.NonEmptyString),
  queueReceiptId: Schema.optional(Schema.NonEmptyString),
  failureSummary: Schema.optional(Schema.NonEmptyString),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type NotificationCenterDigestRunRecord = Schema.Schema.Type<
  typeof NotificationCenterDigestRunRecordSchema
>;

export const NotificationCenterEmailReceiptAdminViewSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  channel: NotificationCenterEmailChannelSchema,
  status: NotificationCenterReceiptStatusSchema,
  recipient: Schema.NonEmptyString,
  template: EmailDeliveryTemplateIdSchema,
  emailDeliveryMessageId: Schema.optional(Schema.NonEmptyString),
  queueFailureSummary: Schema.optional(Schema.NonEmptyString),
  suppressionReason: Schema.optional(Schema.NonEmptyString),
  createdAt: IsoTimestampSchema,
});

export type NotificationCenterEmailReceiptAdminView = Schema.Schema.Type<
  typeof NotificationCenterEmailReceiptAdminViewSchema
>;

export const NotificationCenterEmailPreferenceReferenceSchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  recipient: Schema.NonEmptyString,
  template: EmailDeliveryTemplateIdSchema,
});

export type NotificationCenterEmailPreferenceReference = Schema.Schema.Type<
  typeof NotificationCenterEmailPreferenceReferenceSchema
>;

export const NotificationCenterEmailPreferenceRecordSchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  channel: Schema.Literal(notificationCenterChannel.email),
  recipient: Schema.NonEmptyString,
  template: EmailDeliveryTemplateIdSchema,
  enabled: Schema.Boolean,
  updatedBy: Schema.NonEmptyString,
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type NotificationCenterEmailPreferenceRecord = Schema.Schema.Type<
  typeof NotificationCenterEmailPreferenceRecordSchema
>;

export const NotificationCenterEmailPreferenceAdminViewSchema = Schema.Struct({
  channel: Schema.Literal(notificationCenterChannel.email),
  recipient: Schema.NonEmptyString,
  template: EmailDeliveryTemplateIdSchema,
  enabled: Schema.Boolean,
  updatedBy: Schema.NonEmptyString,
  updatedAt: IsoTimestampSchema,
});

export type NotificationCenterEmailPreferenceAdminView = Schema.Schema.Type<
  typeof NotificationCenterEmailPreferenceAdminViewSchema
>;

export const CreateNotificationCenterInAppNotificationInputSchema =
  Schema.Struct({
    sourceEventId: Schema.NonEmptyString,
    sourceModuleId: PlatformModuleIdSchema,
    tenantScope: PlatformScopeSchema,
    tenantScopeId: Schema.NonEmptyString,
    actorId: Schema.NonEmptyString,
    family: NotificationCenterNotificationFamilySchema,
    title: Schema.optional(Schema.NonEmptyString),
    bodySummary: Schema.optional(Schema.NonEmptyString),
    actionLabel: Schema.optional(Schema.NonEmptyString),
    actionUrl: Schema.optional(AbsoluteRedirectUriSchema),
    correlationId: Schema.optional(Schema.NonEmptyString),
    correlatedEmailReceiptId: Schema.optional(Schema.NonEmptyString),
    correlatedDigestRunId: Schema.optional(Schema.NonEmptyString),
    createdAt: IsoTimestampSchema,
  });

export type CreateNotificationCenterInAppNotificationInput = Schema.Schema.Type<
  typeof CreateNotificationCenterInAppNotificationInputSchema
>;

export const NotificationCenterInAppNotificationReferenceSchema = Schema.Struct(
  {
    notificationId: Schema.NonEmptyString,
  },
);

export type NotificationCenterInAppNotificationReference = Schema.Schema.Type<
  typeof NotificationCenterInAppNotificationReferenceSchema
>;

export const ListNotificationCenterInAppNotificationsInputSchema =
  Schema.Struct({
    tenantScope: PlatformScopeSchema,
    tenantScopeId: Schema.NonEmptyString,
    actorId: Schema.NonEmptyString,
    pageSize: Schema.Number,
  });

export type ListNotificationCenterInAppNotificationsInput = Schema.Schema.Type<
  typeof ListNotificationCenterInAppNotificationsInputSchema
>;

const NotificationCenterInAppNotificationMutationInputFields = {
  notificationId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  actorId: Schema.NonEmptyString,
};

export const MarkNotificationCenterInAppNotificationReadInputSchema =
  Schema.Struct({
    ...NotificationCenterInAppNotificationMutationInputFields,
    readAt: IsoTimestampSchema,
  });

export type MarkNotificationCenterInAppNotificationReadInput =
  Schema.Schema.Type<
    typeof MarkNotificationCenterInAppNotificationReadInputSchema
  >;

export const DismissNotificationCenterInAppNotificationInputSchema =
  Schema.Struct({
    ...NotificationCenterInAppNotificationMutationInputFields,
    dismissedAt: IsoTimestampSchema,
  });

export type DismissNotificationCenterInAppNotificationInput =
  Schema.Schema.Type<
    typeof DismissNotificationCenterInAppNotificationInputSchema
  >;

export const NotificationCenterInAppNotificationRecordSchema = Schema.Struct({
  notificationId: Schema.NonEmptyString,
  sourceEventId: Schema.NonEmptyString,
  sourceModuleId: PlatformModuleIdSchema,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  actorId: Schema.NonEmptyString,
  channel: NotificationCenterInAppChannelSchema,
  family: NotificationCenterNotificationFamilySchema,
  status: NotificationCenterInAppStatusSchema,
  title: Schema.optional(Schema.NonEmptyString),
  bodySummary: Schema.optional(Schema.NonEmptyString),
  actionLabel: Schema.optional(Schema.NonEmptyString),
  actionUrl: Schema.optional(AbsoluteRedirectUriSchema),
  correlationId: Schema.optional(Schema.NonEmptyString),
  correlatedEmailReceiptId: Schema.optional(Schema.NonEmptyString),
  correlatedDigestRunId: Schema.optional(Schema.NonEmptyString),
  readAt: Schema.optional(IsoTimestampSchema),
  dismissedAt: Schema.optional(IsoTimestampSchema),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type NotificationCenterInAppNotificationRecord = Schema.Schema.Type<
  typeof NotificationCenterInAppNotificationRecordSchema
>;

export const NotificationCenterInAppNotificationRecordListSchema = Schema.Array(
  NotificationCenterInAppNotificationRecordSchema,
);

export type NotificationCenterInAppNotificationRecordList = Schema.Schema.Type<
  typeof NotificationCenterInAppNotificationRecordListSchema
>;

export const NotificationCenterInAppNotificationSummaryViewSchema =
  Schema.Struct({
    id: Schema.NonEmptyString,
    channel: NotificationCenterInAppChannelSchema,
    family: NotificationCenterNotificationFamilySchema,
    status: NotificationCenterInAppStatusSchema,
    title: Schema.optional(Schema.NonEmptyString),
    bodySummary: Schema.optional(Schema.NonEmptyString),
    actionLabel: Schema.optional(Schema.NonEmptyString),
    actionUrl: Schema.optional(AbsoluteRedirectUriSchema),
    readAt: Schema.optional(IsoTimestampSchema),
    dismissedAt: Schema.optional(IsoTimestampSchema),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  });

export type NotificationCenterInAppNotificationSummaryView = Schema.Schema.Type<
  typeof NotificationCenterInAppNotificationSummaryViewSchema
>;

export const NotificationCenterInAppNotificationSummaryViewListSchema =
  Schema.Array(NotificationCenterInAppNotificationSummaryViewSchema);

export type NotificationCenterInAppNotificationSummaryViewList =
  Schema.Schema.Type<
    typeof NotificationCenterInAppNotificationSummaryViewListSchema
  >;

export const NotificationCenterInAppNotificationAdminViewSchema = Schema.Struct(
  {
    id: Schema.NonEmptyString,
    channel: NotificationCenterInAppChannelSchema,
    family: NotificationCenterNotificationFamilySchema,
    actorId: Schema.NonEmptyString,
    sourceModuleId: PlatformModuleIdSchema,
    sourceEventId: Schema.NonEmptyString,
    status: NotificationCenterInAppStatusSchema,
    title: Schema.optional(Schema.NonEmptyString),
    bodySummary: Schema.optional(Schema.NonEmptyString),
    actionLabel: Schema.optional(Schema.NonEmptyString),
    actionUrl: Schema.optional(AbsoluteRedirectUriSchema),
    correlationId: Schema.optional(Schema.NonEmptyString),
    correlatedEmailReceiptId: Schema.optional(Schema.NonEmptyString),
    correlatedDigestRunId: Schema.optional(Schema.NonEmptyString),
    readAt: Schema.optional(IsoTimestampSchema),
    dismissedAt: Schema.optional(IsoTimestampSchema),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  },
);

export type NotificationCenterInAppNotificationAdminView = Schema.Schema.Type<
  typeof NotificationCenterInAppNotificationAdminViewSchema
>;
