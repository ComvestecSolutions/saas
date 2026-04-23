import { Schema } from "effect";
import {
  BillingRepairWorkflowPayloadSchema,
  IsoTimestampSchema,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
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

export const BillingReconciliationWorkflowJobRecordSchema = Schema.Struct({
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
  payload: BillingRepairWorkflowPayloadSchema,
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type BillingReconciliationWorkflowJobRecord = Schema.Schema.Type<
  typeof BillingReconciliationWorkflowJobRecordSchema
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

export const buildWorkflowJobSummary = (input: {
  readonly record: BillingReconciliationWorkflowJobRecord;
}) =>
  Schema.decodeUnknown(WorkflowJobSummarySchema)({
    jobId: input.record.jobId,
    sourceModuleId: input.record.payload.sourceModuleId,
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
