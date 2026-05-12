import { Schema } from "effect";

const WorkflowJobStatusConstantSchema = Schema.Struct({
  scheduled: Schema.Literal("scheduled"),
  running: Schema.Literal("running"),
  completed: Schema.Literal("completed"),
  blocked: Schema.Literal("blocked"),
  failed: Schema.Literal("failed"),
  canceled: Schema.Literal("canceled"),
});

export const workflowJobStatus = Schema.validateSync(
  WorkflowJobStatusConstantSchema,
)({
  scheduled: "scheduled",
  running: "running",
  completed: "completed",
  blocked: "blocked",
  failed: "failed",
  canceled: "canceled",
} satisfies Schema.Schema.Type<typeof WorkflowJobStatusConstantSchema>);

export const workflowJobStatuses = [
  workflowJobStatus.scheduled,
  workflowJobStatus.running,
  workflowJobStatus.completed,
  workflowJobStatus.blocked,
  workflowJobStatus.failed,
  workflowJobStatus.canceled,
] as const;

export const WorkflowJobStatusSchema = Schema.Literal(...workflowJobStatuses);

export type WorkflowJobStatus = Schema.Schema.Type<
  typeof WorkflowJobStatusSchema
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
