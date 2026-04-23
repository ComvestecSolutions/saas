import { Schema } from "effect";
import { PlatformScopeSchema } from "../access/platform-scopes";
import { PlatformModuleIdSchema } from "../module-registry/modules";
import { IsoTimestampSchema } from "../runtime/timestamps";

const WorkflowJobKindConstantSchema = Schema.Struct({
  reconciliationDeadline: Schema.Literal("reconciliation-deadline"),
  reconciliationSweep: Schema.Literal("reconciliation-sweep"),
});

export const workflowJobKind = Schema.validateSync(
  WorkflowJobKindConstantSchema,
)({
  reconciliationDeadline: "reconciliation-deadline",
  reconciliationSweep: "reconciliation-sweep",
} satisfies Schema.Schema.Type<typeof WorkflowJobKindConstantSchema>);

export const workflowJobKinds = [
  workflowJobKind.reconciliationDeadline,
  workflowJobKind.reconciliationSweep,
] as const;

export const WorkflowJobKindSchema = Schema.Literal(...workflowJobKinds);

export type WorkflowJobKind = Schema.Schema.Type<typeof WorkflowJobKindSchema>;

const WorkflowJobStatusConstantSchema = Schema.Struct({
  scheduled: Schema.Literal("scheduled"),
  running: Schema.Literal("running"),
  completed: Schema.Literal("completed"),
  blocked: Schema.Literal("blocked"),
  failed: Schema.Literal("failed"),
});

export const workflowJobStatus = Schema.validateSync(
  WorkflowJobStatusConstantSchema,
)({
  scheduled: "scheduled",
  running: "running",
  completed: "completed",
  blocked: "blocked",
  failed: "failed",
} satisfies Schema.Schema.Type<typeof WorkflowJobStatusConstantSchema>);

export const workflowJobStatuses = [
  workflowJobStatus.scheduled,
  workflowJobStatus.running,
  workflowJobStatus.completed,
  workflowJobStatus.blocked,
  workflowJobStatus.failed,
] as const;

export const WorkflowJobStatusSchema = Schema.Literal(...workflowJobStatuses);

export type WorkflowJobStatus = Schema.Schema.Type<
  typeof WorkflowJobStatusSchema
>;

const WorkflowJobTriggerConstantSchema = Schema.Struct({
  checkoutCreated: Schema.Literal("checkout-created"),
  periodicSweep: Schema.Literal("periodic-sweep"),
});

export const workflowJobTrigger = Schema.validateSync(
  WorkflowJobTriggerConstantSchema,
)({
  checkoutCreated: "checkout-created",
  periodicSweep: "periodic-sweep",
} satisfies Schema.Schema.Type<typeof WorkflowJobTriggerConstantSchema>);

export const workflowJobTriggers = [
  workflowJobTrigger.checkoutCreated,
  workflowJobTrigger.periodicSweep,
] as const;

export const WorkflowJobTriggerSchema = Schema.Literal(...workflowJobTriggers);

export type WorkflowJobTrigger = Schema.Schema.Type<
  typeof WorkflowJobTriggerSchema
>;

const WorkflowJobGapReasonConstantSchema = Schema.Struct({
  missingCustomerAccount: Schema.Literal("missing-customer-account"),
  missingSubscriptionState: Schema.Literal("missing-subscription-state"),
  missingProvisioning: Schema.Literal("missing-provisioning"),
  missingOnboarding: Schema.Literal("missing-onboarding"),
  repairFailed: Schema.Literal("repair-failed"),
});

export const workflowJobGapReason = Schema.validateSync(
  WorkflowJobGapReasonConstantSchema,
)({
  missingCustomerAccount: "missing-customer-account",
  missingSubscriptionState: "missing-subscription-state",
  missingProvisioning: "missing-provisioning",
  missingOnboarding: "missing-onboarding",
  repairFailed: "repair-failed",
} satisfies Schema.Schema.Type<typeof WorkflowJobGapReasonConstantSchema>);

export const workflowJobGapReasons = [
  workflowJobGapReason.missingCustomerAccount,
  workflowJobGapReason.missingSubscriptionState,
  workflowJobGapReason.missingProvisioning,
  workflowJobGapReason.missingOnboarding,
  workflowJobGapReason.repairFailed,
] as const;

export const WorkflowJobGapReasonSchema = Schema.Literal(
  ...workflowJobGapReasons,
);

export type WorkflowJobGapReason = Schema.Schema.Type<
  typeof WorkflowJobGapReasonSchema
>;

export const BillingRepairWorkflowPayloadSchema = Schema.Struct({
  sourceModuleId: PlatformModuleIdSchema,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  actorId: Schema.optional(Schema.NonEmptyString),
  provider: Schema.NonEmptyString,
  correlationId: Schema.NonEmptyString,
  checkoutSessionId: Schema.optional(Schema.NonEmptyString),
  deliveryId: Schema.optional(Schema.NonEmptyString),
  providerCustomerId: Schema.optional(Schema.NonEmptyString),
  subscriptionId: Schema.optional(Schema.NonEmptyString),
  trigger: WorkflowJobTriggerSchema,
});

export type BillingRepairWorkflowPayload = Schema.Schema.Type<
  typeof BillingRepairWorkflowPayloadSchema
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

export const BillingRepairGapSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  status: WorkflowJobStatusSchema,
  attempts: Schema.Number,
  scheduledAt: IsoTimestampSchema,
  completedAt: Schema.optional(IsoTimestampSchema),
  gapReason: Schema.optional(WorkflowJobGapReasonSchema),
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
