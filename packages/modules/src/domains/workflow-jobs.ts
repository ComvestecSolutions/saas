import { Schema } from "effect";
import {
  type BillingRepairWorkflowPayload,
  BillingRepairWorkflowPayloadSchema,
  type ImportExportJobFormat,
  type ImportExportManagedFileSummaryWorkflowPayload,
  ImportExportManagedFileSummaryWorkflowPayloadSchema,
  type ImportExportSupportCaseSummaryWorkflowPayload,
  ImportExportSupportCaseSummaryWorkflowPayloadSchema,
  IsoTimestampSchema,
  type NotificationCenterEmailDigestWorkflowPayload,
  NotificationCenterEmailDigestWorkflowPayloadSchema,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
  type WebhookOutboundDeliveryWorkflowPayload,
  WebhookOutboundDeliveryWorkflowPayloadSchema,
  type TenantInvitationExpiryNotificationWorkflowPayload,
  TenantInvitationExpiryNotificationWorkflowPayloadSchema,
  type TenantInvitationReminderWorkflowPayload,
  TenantInvitationReminderWorkflowPayloadSchema,
  type SearchTenantIndexEnsureWorkflowPayload,
  SearchTenantIndexEnsureWorkflowPayloadSchema,
  WorkflowJobGapReasonSchema,
  WorkflowJobKindSchema,
  WorkflowJobStatusSchema,
  WorkflowJobSummarySchema,
  WorkflowJobTriggerSchema,
  type PlatformScope,
} from "@comvestec/contracts";
import { platformAdapterServiceName } from "@comvestec/platform";

const WorkflowJobRuntimeConstantSchema = Schema.Struct({
  convex: Schema.Literal(platformAdapterServiceName.convex),
});

export const workflowJobRuntime = Schema.validateSync(
  WorkflowJobRuntimeConstantSchema,
)({
  convex: platformAdapterServiceName.convex,
} satisfies Schema.Schema.Type<typeof WorkflowJobRuntimeConstantSchema>);

export const WorkflowJobRuntimeSchema = Schema.Literal(
  workflowJobRuntime.convex,
);

export type WorkflowJobRuntime = Schema.Schema.Type<
  typeof WorkflowJobRuntimeSchema
>;

export const WorkflowJobRecordBaseSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  runtime: WorkflowJobRuntimeSchema,
  sourceModuleId: PlatformModuleIdSchema,
  kind: WorkflowJobKindSchema,
  trigger: WorkflowJobTriggerSchema,
  status: WorkflowJobStatusSchema,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  attempts: Schema.Number,
  scheduledAt: IsoTimestampSchema,
  completedAt: Schema.optional(IsoTimestampSchema),
  lastError: Schema.optional(Schema.NonEmptyString),
  gapReason: Schema.optional(WorkflowJobGapReasonSchema),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type WorkflowJobRecordBase = Schema.Schema.Type<
  typeof WorkflowJobRecordBaseSchema
>;

export const createWorkflowJobRecordSchema = <
  const TPayloadSchema extends Schema.Schema.AnyNoContext,
>(
  payloadSchema: TPayloadSchema,
) =>
  Schema.Struct({
    ...WorkflowJobRecordBaseSchema.fields,
    payload: payloadSchema,
  });

export const WorkflowJobRecordSchema = createWorkflowJobRecordSchema(
  Schema.Unknown,
);

export type WorkflowJobRecord = Schema.Schema.Type<
  typeof WorkflowJobRecordSchema
>;

export const BillingReconciliationWorkflowJobRecordSchema =
  createWorkflowJobRecordSchema(BillingRepairWorkflowPayloadSchema);

export type BillingReconciliationWorkflowJobRecord = Schema.Schema.Type<
  typeof BillingReconciliationWorkflowJobRecordSchema
>;

export const ImportExportManagedFileSummaryWorkflowJobRecordSchema =
  createWorkflowJobRecordSchema(
    ImportExportManagedFileSummaryWorkflowPayloadSchema,
  );

export type ImportExportManagedFileSummaryWorkflowJobRecord =
  Schema.Schema.Type<
    typeof ImportExportManagedFileSummaryWorkflowJobRecordSchema
  >;

export const ImportExportSupportCaseSummaryWorkflowJobRecordSchema =
  createWorkflowJobRecordSchema(
    ImportExportSupportCaseSummaryWorkflowPayloadSchema,
  );

export type ImportExportSupportCaseSummaryWorkflowJobRecord =
  Schema.Schema.Type<
    typeof ImportExportSupportCaseSummaryWorkflowJobRecordSchema
  >;

export const NotificationCenterEmailDigestWorkflowJobRecordSchema =
  createWorkflowJobRecordSchema(
    NotificationCenterEmailDigestWorkflowPayloadSchema,
  );

export type NotificationCenterEmailDigestWorkflowJobRecord = Schema.Schema.Type<
  typeof NotificationCenterEmailDigestWorkflowJobRecordSchema
>;

export const SearchTenantIndexEnsureWorkflowJobRecordSchema =
  createWorkflowJobRecordSchema(SearchTenantIndexEnsureWorkflowPayloadSchema);

export type SearchTenantIndexEnsureWorkflowJobRecord = Schema.Schema.Type<
  typeof SearchTenantIndexEnsureWorkflowJobRecordSchema
>;

export const WebhookOutboundDeliveryWorkflowJobRecordSchema =
  createWorkflowJobRecordSchema(WebhookOutboundDeliveryWorkflowPayloadSchema);

export type WebhookOutboundDeliveryWorkflowJobRecord = Schema.Schema.Type<
  typeof WebhookOutboundDeliveryWorkflowJobRecordSchema
>;

export const TenantInvitationReminderWorkflowJobRecordSchema =
  createWorkflowJobRecordSchema(TenantInvitationReminderWorkflowPayloadSchema);

export type TenantInvitationReminderWorkflowJobRecord = Schema.Schema.Type<
  typeof TenantInvitationReminderWorkflowJobRecordSchema
>;

export const TenantInvitationExpiryNotificationWorkflowJobRecordSchema =
  createWorkflowJobRecordSchema(
    TenantInvitationExpiryNotificationWorkflowPayloadSchema,
  );

export type TenantInvitationExpiryNotificationWorkflowJobRecord =
  Schema.Schema.Type<
    typeof TenantInvitationExpiryNotificationWorkflowJobRecordSchema
  >;

export const TenantInvitationNotificationWorkflowJobRecordSchema = Schema.Union(
  TenantInvitationReminderWorkflowJobRecordSchema,
  TenantInvitationExpiryNotificationWorkflowJobRecordSchema,
);

export type TenantInvitationNotificationWorkflowJobRecord = Schema.Schema.Type<
  typeof TenantInvitationNotificationWorkflowJobRecordSchema
>;

export const buildBillingReconciliationWorkflowJobId = (input: {
  readonly trigger: Schema.Schema.Type<typeof WorkflowJobTriggerSchema>;
  readonly tenantScope: PlatformScope;
  readonly tenantScopeId: string;
  readonly key: string;
}) =>
  [
    "workflow-jobs",
    "billing-repair",
    input.trigger,
    input.tenantScope,
    input.tenantScopeId,
    input.key,
  ].join(":");

export const buildSearchTenantIndexEnsureWorkflowJobId = (input: {
  readonly trigger: Schema.Schema.Type<typeof WorkflowJobTriggerSchema>;
  readonly tenantScope: PlatformScope;
  readonly tenantScopeId: string;
  readonly key: string;
}) =>
  [
    "workflow-jobs",
    "search-index-ensure",
    input.trigger,
    input.tenantScope,
    input.tenantScopeId,
    input.key,
  ].join(":");

export const buildImportExportManagedFileSummaryWorkflowJobId = (input: {
  readonly trigger: Schema.Schema.Type<typeof WorkflowJobTriggerSchema>;
  readonly tenantScope: PlatformScope;
  readonly tenantScopeId: string;
  readonly format: ImportExportJobFormat;
  readonly key: string;
}) =>
  [
    "workflow-jobs",
    "import-export-managed-file-summary",
    input.trigger,
    input.tenantScope,
    input.tenantScopeId,
    input.format,
    input.key,
  ].join(":");

export const buildImportExportSupportCaseSummaryWorkflowJobId = (input: {
  readonly trigger: Schema.Schema.Type<typeof WorkflowJobTriggerSchema>;
  readonly tenantScope: PlatformScope;
  readonly tenantScopeId: string;
  readonly key: string;
}) =>
  [
    "workflow-jobs",
    "import-export-support-case-summary",
    input.trigger,
    input.tenantScope,
    input.tenantScopeId,
    input.key,
  ].join(":");

export const buildNotificationCenterEmailDigestWorkflowJobId = (input: {
  readonly trigger: Schema.Schema.Type<typeof WorkflowJobTriggerSchema>;
  readonly tenantScope: PlatformScope;
  readonly tenantScopeId: string;
  readonly key: string;
}) =>
  [
    "workflow-jobs",
    "notification-center-email-digest",
    input.trigger,
    input.tenantScope,
    input.tenantScopeId,
    input.key,
  ].join(":");

export const buildTenantInvitationReminderWorkflowJobId = (input: {
  readonly trigger: Schema.Schema.Type<typeof WorkflowJobTriggerSchema>;
  readonly tenantScope: PlatformScope;
  readonly tenantScopeId: string;
  readonly key: string;
}) =>
  [
    "workflow-jobs",
    "tenant-invitation-reminder",
    input.trigger,
    input.tenantScope,
    input.tenantScopeId,
    input.key,
  ].join(":");

export const buildTenantInvitationExpiryNotificationWorkflowJobId = (input: {
  readonly trigger: Schema.Schema.Type<typeof WorkflowJobTriggerSchema>;
  readonly tenantScope: PlatformScope;
  readonly tenantScopeId: string;
  readonly key: string;
}) =>
  [
    "workflow-jobs",
    "tenant-invitation-expiry-notification",
    input.trigger,
    input.tenantScope,
    input.tenantScopeId,
    input.key,
  ].join(":");

export const buildWebhookOutboundDeliveryWorkflowJobId = (input: {
  readonly trigger: Schema.Schema.Type<typeof WorkflowJobTriggerSchema>;
  readonly tenantScope: PlatformScope;
  readonly tenantScopeId: string;
  readonly key: string;
}) =>
  [
    "workflow-jobs",
    "webhook-outbound-delivery",
    input.trigger,
    input.tenantScope,
    input.tenantScopeId,
    input.key,
  ].join(":");

export const buildWorkflowJobSummary = (input: {
  readonly record: WorkflowJobRecordBase;
}) =>
  Schema.decodeUnknown(WorkflowJobSummarySchema)({
    jobId: input.record.jobId,
    sourceModuleId: input.record.sourceModuleId,
    kind: input.record.kind,
    trigger: input.record.trigger,
    status: input.record.status,
    tenantScope: input.record.tenantScope,
    tenantScopeId: input.record.tenantScopeId,
    attempts: input.record.attempts,
    scheduledAt: input.record.scheduledAt,
    ...(input.record.completedAt !== undefined
      ? { completedAt: input.record.completedAt }
      : {}),
    ...(input.record.gapReason !== undefined
      ? { gapReason: input.record.gapReason }
      : {}),
  });
