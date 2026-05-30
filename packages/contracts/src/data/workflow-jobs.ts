import { Schema } from "effect";
import { RequestContextSchema } from "../access/request-context";
import {
  workflowJobGapReason,
  workflowJobGapReasons,
  type WorkflowJobGapReason,
  WorkflowJobGapReasonSchema,
  workflowJobStatus,
  workflowJobStatuses,
  type WorkflowJobStatus,
  WorkflowJobStatusSchema,
} from "./workflow-job-state";
import {
  importExportJobFormat,
  ImportExportJobFormatSchema,
  importExportJobSource,
  ImportExportJobSourceSchema,
  ImportExportTenantScopeSchema,
} from "../domains/import-export";
import { NotificationCenterChannelSchema } from "../domains/notification-center";
import {
  SearchTenantIndexSettingsSchema,
  SearchTenantScopeSchema,
} from "../domains/search";
import { TenantMembershipRelationSchema } from "../domains/tenant-management";
import {
  WebhookOutboundDeliveryPayloadSchema,
  WebhookSubscriptionEventSchema,
} from "../domains/webhooks-api-access";
import { EmailDeliveryTemplateIdSchema } from "../domains/email-delivery";
import { PlatformScopeSchema } from "../access/platform-scopes";
import { PlatformModuleIdSchema } from "../module-registry/modules";
import { IsoTimestampSchema } from "../runtime/timestamps";

export {
  workflowJobGapReason,
  workflowJobGapReasons,
  WorkflowJobGapReasonSchema,
  workflowJobStatus,
  workflowJobStatuses,
  WorkflowJobStatusSchema,
};

export type { WorkflowJobGapReason, WorkflowJobStatus };

const WorkflowJobKindConstantSchema = Schema.Struct({
  importExportManagedFileSummary: Schema.Literal(
    "import-export-managed-file-summary",
  ),
  importExportSupportCaseSummary: Schema.Literal(
    "import-export-support-case-summary",
  ),
  invitationExpiryNotification: Schema.Literal(
    "invitation-expiry-notification",
  ),
  invitationReminder: Schema.Literal("invitation-reminder"),
  notificationCenterEmailDigest: Schema.Literal(
    "notification-center-email-digest",
  ),
  reconciliationDeadline: Schema.Literal("reconciliation-deadline"),
  reconciliationSweep: Schema.Literal("reconciliation-sweep"),
  searchIndexEnsure: Schema.Literal("search-index-ensure"),
  webhookOutboundDelivery: Schema.Literal("webhook-outbound-delivery"),
});

export const workflowJobKind = Schema.validateSync(
  WorkflowJobKindConstantSchema,
)({
  importExportManagedFileSummary: "import-export-managed-file-summary",
  importExportSupportCaseSummary: "import-export-support-case-summary",
  invitationExpiryNotification: "invitation-expiry-notification",
  invitationReminder: "invitation-reminder",
  notificationCenterEmailDigest: "notification-center-email-digest",
  reconciliationDeadline: "reconciliation-deadline",
  reconciliationSweep: "reconciliation-sweep",
  searchIndexEnsure: "search-index-ensure",
  webhookOutboundDelivery: "webhook-outbound-delivery",
} satisfies Schema.Schema.Type<typeof WorkflowJobKindConstantSchema>);

export const workflowJobKinds = [
  workflowJobKind.importExportManagedFileSummary,
  workflowJobKind.importExportSupportCaseSummary,
  workflowJobKind.invitationExpiryNotification,
  workflowJobKind.invitationReminder,
  workflowJobKind.notificationCenterEmailDigest,
  workflowJobKind.reconciliationDeadline,
  workflowJobKind.reconciliationSweep,
  workflowJobKind.searchIndexEnsure,
  workflowJobKind.webhookOutboundDelivery,
] as const;

export const WorkflowJobKindSchema = Schema.Literal(...workflowJobKinds);

export type WorkflowJobKind = Schema.Schema.Type<typeof WorkflowJobKindSchema>;

const WorkflowJobTriggerConstantSchema = Schema.Struct({
  checkoutCreated: Schema.Literal("checkout-created"),
  moduleEvent: Schema.Literal("module-event"),
  operatorRequested: Schema.Literal("operator-requested"),
  periodicSweep: Schema.Literal("periodic-sweep"),
});

export const workflowJobTrigger = Schema.validateSync(
  WorkflowJobTriggerConstantSchema,
)({
  checkoutCreated: "checkout-created",
  moduleEvent: "module-event",
  operatorRequested: "operator-requested",
  periodicSweep: "periodic-sweep",
} satisfies Schema.Schema.Type<typeof WorkflowJobTriggerConstantSchema>);

export const workflowJobTriggers = [
  workflowJobTrigger.checkoutCreated,
  workflowJobTrigger.moduleEvent,
  workflowJobTrigger.operatorRequested,
  workflowJobTrigger.periodicSweep,
] as const;

export const WorkflowJobTriggerSchema = Schema.Literal(...workflowJobTriggers);

export type WorkflowJobTrigger = Schema.Schema.Type<
  typeof WorkflowJobTriggerSchema
>;

export const WorkflowJobDispatchMetadataSchema = Schema.Struct({
  scheduledAt: IsoTimestampSchema,
  scheduledFunctionId: Schema.NonEmptyString,
  scheduledFunctionIds: Schema.Array(Schema.NonEmptyString),
  primaryScheduled: Schema.Boolean,
  scheduledRecoveryAttemptCount: Schema.Number,
  expectedRecoveryAttemptCount: Schema.Number,
});

export type WorkflowJobDispatchMetadata = Schema.Schema.Type<
  typeof WorkflowJobDispatchMetadataSchema
>;

export const BillingRepairWorkflowDispatchMetadataSchema =
  WorkflowJobDispatchMetadataSchema;

export type BillingRepairWorkflowDispatchMetadata = WorkflowJobDispatchMetadata;

export const BillingRepairWorkflowPayloadSchema = Schema.Struct({
  sourceModuleId: PlatformModuleIdSchema,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  enterpriseId: Schema.optional(Schema.NonEmptyString),
  organizationId: Schema.optional(Schema.NonEmptyString),
  individualId: Schema.optional(Schema.NonEmptyString),
  actorId: Schema.optional(Schema.NonEmptyString),
  provider: Schema.NonEmptyString,
  correlationId: Schema.NonEmptyString,
  checkoutSessionId: Schema.optional(Schema.NonEmptyString),
  deliveryId: Schema.optional(Schema.NonEmptyString),
  providerCustomerId: Schema.optional(Schema.NonEmptyString),
  subscriptionId: Schema.optional(Schema.NonEmptyString),
  trigger: WorkflowJobTriggerSchema,
  dispatch: Schema.optional(WorkflowJobDispatchMetadataSchema),
});

export type BillingRepairWorkflowPayload = Schema.Schema.Type<
  typeof BillingRepairWorkflowPayloadSchema
>;

export const ImportExportManagedFileSummaryWorkflowPayloadSchema =
  Schema.Struct({
    sourceModuleId: PlatformModuleIdSchema,
    tenantScope: ImportExportTenantScopeSchema,
    tenantScopeId: Schema.NonEmptyString,
    requestContext: RequestContextSchema,
    actorId: Schema.optional(Schema.NonEmptyString),
    correlationId: Schema.NonEmptyString,
    source: ImportExportJobSourceSchema,
    format: ImportExportJobFormatSchema,
    dispatch: Schema.optional(WorkflowJobDispatchMetadataSchema),
  });

export type ImportExportManagedFileSummaryWorkflowPayload = Schema.Schema.Type<
  typeof ImportExportManagedFileSummaryWorkflowPayloadSchema
>;

export const ImportExportSupportCaseSummaryWorkflowPayloadSchema =
  Schema.Struct({
    sourceModuleId: PlatformModuleIdSchema,
    tenantScope: ImportExportTenantScopeSchema,
    tenantScopeId: Schema.NonEmptyString,
    requestContext: RequestContextSchema,
    actorId: Schema.optional(Schema.NonEmptyString),
    correlationId: Schema.NonEmptyString,
    source: Schema.Literal(importExportJobSource.supportCaseSummaryJson),
    format: Schema.Literal(importExportJobFormat.json),
    dispatch: Schema.optional(WorkflowJobDispatchMetadataSchema),
  });

export type ImportExportSupportCaseSummaryWorkflowPayload = Schema.Schema.Type<
  typeof ImportExportSupportCaseSummaryWorkflowPayloadSchema
>;

export const NotificationCenterEmailDigestWorkflowPayloadSchema = Schema.Struct(
  {
    sourceModuleId: PlatformModuleIdSchema,
    tenantScope: PlatformScopeSchema,
    tenantScopeId: Schema.NonEmptyString,
    requestContext: RequestContextSchema,
    actorId: Schema.optional(Schema.NonEmptyString),
    correlationId: Schema.NonEmptyString,
    digestRunId: Schema.NonEmptyString,
    recipient: Schema.NonEmptyString,
    channel: NotificationCenterChannelSchema,
    template: EmailDeliveryTemplateIdSchema,
    dispatch: Schema.optional(WorkflowJobDispatchMetadataSchema),
  },
);

export type NotificationCenterEmailDigestWorkflowPayload = Schema.Schema.Type<
  typeof NotificationCenterEmailDigestWorkflowPayloadSchema
>;

export const SearchTenantIndexEnsureWorkflowPayloadSchema = Schema.Struct({
  sourceModuleId: PlatformModuleIdSchema,
  tenantScope: SearchTenantScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  requestContext: RequestContextSchema,
  actorId: Schema.optional(Schema.NonEmptyString),
  correlationId: Schema.NonEmptyString,
  settings: SearchTenantIndexSettingsSchema,
  dispatch: Schema.optional(WorkflowJobDispatchMetadataSchema),
});

export type SearchTenantIndexEnsureWorkflowPayload = Schema.Schema.Type<
  typeof SearchTenantIndexEnsureWorkflowPayloadSchema
>;

export const WebhookOutboundDeliveryWorkflowPayloadSchema = Schema.Struct({
  sourceModuleId: PlatformModuleIdSchema,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  requestContext: RequestContextSchema,
  actorId: Schema.optional(Schema.NonEmptyString),
  correlationId: Schema.NonEmptyString,
  subscriptionId: Schema.NonEmptyString,
  deliveryId: Schema.NonEmptyString,
  eventType: WebhookSubscriptionEventSchema,
  payload: WebhookOutboundDeliveryPayloadSchema,
  maxAttempts: Schema.Number,
  dispatch: Schema.optional(WorkflowJobDispatchMetadataSchema),
});

export type WebhookOutboundDeliveryWorkflowPayload = Schema.Schema.Type<
  typeof WebhookOutboundDeliveryWorkflowPayloadSchema
>;

const TenantInvitationWorkflowPayloadBaseSchema = Schema.Struct({
  sourceModuleId: PlatformModuleIdSchema,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  invitationId: Schema.NonEmptyString,
  recipientEmail: Schema.NonEmptyString,
  relation: TenantMembershipRelationSchema,
  correlationId: Schema.NonEmptyString,
  dispatch: Schema.optional(WorkflowJobDispatchMetadataSchema),
});

export const TenantInvitationReminderWorkflowPayloadSchema =
  TenantInvitationWorkflowPayloadBaseSchema;

export type TenantInvitationReminderWorkflowPayload = Schema.Schema.Type<
  typeof TenantInvitationReminderWorkflowPayloadSchema
>;

export const TenantInvitationExpiryNotificationWorkflowPayloadSchema =
  TenantInvitationWorkflowPayloadBaseSchema;

export type TenantInvitationExpiryNotificationWorkflowPayload =
  Schema.Schema.Type<
    typeof TenantInvitationExpiryNotificationWorkflowPayloadSchema
  >;

export const WorkflowJobSummarySchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  sourceModuleId: PlatformModuleIdSchema,
  kind: WorkflowJobKindSchema,
  trigger: WorkflowJobTriggerSchema,
  status: WorkflowJobStatusSchema,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  attempts: Schema.Number,
  scheduledAt: IsoTimestampSchema,
  completedAt: Schema.optional(IsoTimestampSchema),
  gapReason: Schema.optional(WorkflowJobGapReasonSchema),
});

export type WorkflowJobSummary = Schema.Schema.Type<
  typeof WorkflowJobSummarySchema
>;

export const WorkflowJobSummaryListSchema = Schema.Array(
  WorkflowJobSummarySchema,
);

export type WorkflowJobSummaryList = Schema.Schema.Type<
  typeof WorkflowJobSummaryListSchema
>;

export const WorkflowJobRepairGapSchema = Schema.Struct({
  ...WorkflowJobSummarySchema.fields,
  lastError: Schema.optional(Schema.NonEmptyString),
});

export type WorkflowJobRepairGap = Schema.Schema.Type<
  typeof WorkflowJobRepairGapSchema
>;

export const WorkflowJobRepairGapListSchema = Schema.Array(
  WorkflowJobRepairGapSchema,
);

export type WorkflowJobRepairGapList = Schema.Schema.Type<
  typeof WorkflowJobRepairGapListSchema
>;

export const WorkflowJobRepairGapListRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  sourceModuleId: PlatformModuleIdSchema,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export type WorkflowJobRepairGapListRequest = Schema.Schema.Type<
  typeof WorkflowJobRepairGapListRequestSchema
>;

export const WorkflowJobRepairGapListResultSchema = Schema.Struct({
  jobs: WorkflowJobRepairGapListSchema,
});

export type WorkflowJobRepairGapListResult = Schema.Schema.Type<
  typeof WorkflowJobRepairGapListResultSchema
>;

export const WorkflowJobRepairGapReplayRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  convexAuthToken: Schema.NonEmptyString,
  jobId: Schema.NonEmptyString,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export type WorkflowJobRepairGapReplayRequest = Schema.Schema.Type<
  typeof WorkflowJobRepairGapReplayRequestSchema
>;

export const WorkflowJobRepairGapReplayResultSchema = Schema.Struct({
  job: WorkflowJobRepairGapSchema,
});

export type WorkflowJobRepairGapReplayResult = Schema.Schema.Type<
  typeof WorkflowJobRepairGapReplayResultSchema
>;

export const WorkflowJobRepairGapCancelRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  convexAuthToken: Schema.NonEmptyString,
  jobId: Schema.NonEmptyString,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export type WorkflowJobRepairGapCancelRequest = Schema.Schema.Type<
  typeof WorkflowJobRepairGapCancelRequestSchema
>;

export const WorkflowJobRepairGapCancelResultSchema = Schema.Struct({
  job: WorkflowJobRepairGapSchema,
});

export type WorkflowJobRepairGapCancelResult = Schema.Schema.Type<
  typeof WorkflowJobRepairGapCancelResultSchema
>;

export const BillingRepairGapActionAvailabilitySchema = Schema.Struct({
  replay: Schema.Boolean,
  cancel: Schema.Boolean,
});

export type BillingRepairGapActionAvailability = Schema.Schema.Type<
  typeof BillingRepairGapActionAvailabilitySchema
>;

export const BillingRepairGapSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  status: WorkflowJobStatusSchema,
  attempts: Schema.Number,
  scheduledAt: IsoTimestampSchema,
  completedAt: Schema.optional(IsoTimestampSchema),
  gapReason: Schema.optional(WorkflowJobGapReasonSchema),
  actionAvailability: Schema.optional(BillingRepairGapActionAvailabilitySchema),
  lastError: Schema.optional(Schema.NonEmptyString),
});

export type BillingRepairGap = Schema.Schema.Type<
  typeof BillingRepairGapSchema
>;

export const BillingRepairGapListSchema = Schema.Array(BillingRepairGapSchema);

export type BillingRepairGapList = Schema.Schema.Type<
  typeof BillingRepairGapListSchema
>;

export const BillingRepairGapListRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export type BillingRepairGapListRequest = Schema.Schema.Type<
  typeof BillingRepairGapListRequestSchema
>;

export const BillingRepairGapListResultSchema = Schema.Struct({
  jobs: BillingRepairGapListSchema,
});

export type BillingRepairGapListResult = Schema.Schema.Type<
  typeof BillingRepairGapListResultSchema
>;

export const BillingRepairGapReplayRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  convexAuthToken: Schema.NonEmptyString,
  jobId: Schema.NonEmptyString,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export type BillingRepairGapReplayRequest = Schema.Schema.Type<
  typeof BillingRepairGapReplayRequestSchema
>;

export const BillingRepairGapReplayResultSchema = Schema.Struct({
  job: BillingRepairGapSchema,
});

export type BillingRepairGapReplayResult = Schema.Schema.Type<
  typeof BillingRepairGapReplayResultSchema
>;

export const BillingRepairGapCancelRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  convexAuthToken: Schema.NonEmptyString,
  jobId: Schema.NonEmptyString,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export type BillingRepairGapCancelRequest = Schema.Schema.Type<
  typeof BillingRepairGapCancelRequestSchema
>;

export const BillingRepairGapCancelResultSchema = Schema.Struct({
  job: BillingRepairGapSchema,
});

export type BillingRepairGapCancelResult = Schema.Schema.Type<
  typeof BillingRepairGapCancelResultSchema
>;

export const BillingReconciliationManualRunRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  convexAuthToken: Schema.NonEmptyString,
  now: Schema.optional(IsoTimestampSchema),
});

export type BillingReconciliationManualRunRequest = Schema.Schema.Type<
  typeof BillingReconciliationManualRunRequestSchema
>;

export const BillingReconciliationManualRunResultSchema = Schema.Struct({
  jobs: WorkflowJobSummaryListSchema,
});

export type BillingReconciliationManualRunResult = Schema.Schema.Type<
  typeof BillingReconciliationManualRunResultSchema
>;
