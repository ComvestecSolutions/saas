/**
 * Workflow runs admin envelope contracts (admin-app implementation
 * plan §9 item 15). Operator-Desk surface for inspecting +
 * replaying/canceling first-party workflow-jobs runs.
 *
 * Owner-locked design (enforced in the platform service at
 * `packages/platform/src/services/domains/workflow-runs-admin-service.ts`):
 *
 *   - **Read authz**: `list` / `detail` require
 *     `actorType.platformOperator` OR `actorType.supportOperator`
 *     OR any admin-org membership row (any role).
 *   - **Write authz**: `replay` / `cancel` require
 *     `actorType.platformOperator` OR
 *     `adminMemberRole.adminOwner` / `adminMemberRole.adminAdmin`.
 *     Support operators have read access only; admin viewers/etc.
 *     are denied. Anonymous always → typed Unauthorized.
 *   - **Reason-catalog + attachment**: every `replay` decodes its
 *     `reason` against `ReasonCatalogIdSchema` and enforces
 *     `validateReasonForAction(reasonId, workflowRunsAdminAuditAction.replayed)`
 *     plus non-empty `reasonAttachmentText`. `cancel` is symmetric
 *     against `workflowRunsAdminAuditAction.canceled`.
 *   - **Field-security**: `lastError` and `payloadProjection` are
 *     `regulated-sensitive` per the matching manifest and are
 *     visible only to platform-operator / support-operator.
 *   - **Bounded list**: page size is capped at `listPageSizeMax`
 *     and per-bucket failures degrade to `partialFailures` (mirrors
 *     universal-search) rather than aborting the envelope.
 *
 * The platform service composes an injected `WorkflowRunsPort`
 * (Context.Tag) representing the workflow-jobs admin surface;
 * the default Layer ships a TODO(phase1-item15) pass-through stub
 * that returns honest empty results until workflow-jobs publishes
 * its admin port — same staged pattern as the per-vendor reads.
 */
import { Schema } from "effect";
import { RequestContextSchema } from "../access/request-context";
import { PlatformModuleIdSchema } from "../module-registry/modules";
import { IsoTimestampSchema } from "../runtime/timestamps";

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

const WorkflowRunStatusConstantSchema = Schema.Struct({
  queued: Schema.Literal("queued"),
  running: Schema.Literal("running"),
  succeeded: Schema.Literal("succeeded"),
  failed: Schema.Literal("failed"),
  canceled: Schema.Literal("canceled"),
  stale: Schema.Literal("stale"),
});

export const workflowRunStatus = Schema.validateSync(
  WorkflowRunStatusConstantSchema,
)({
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  canceled: "canceled",
  stale: "stale",
} satisfies Schema.Schema.Type<typeof WorkflowRunStatusConstantSchema>);

export const workflowRunStatuses = [
  workflowRunStatus.queued,
  workflowRunStatus.running,
  workflowRunStatus.succeeded,
  workflowRunStatus.failed,
  workflowRunStatus.canceled,
  workflowRunStatus.stale,
] as const;

export const WorkflowRunStatusSchema = Schema.Literal(...workflowRunStatuses);

export type WorkflowRunStatus = Schema.Schema.Type<
  typeof WorkflowRunStatusSchema
>;

// ---------------------------------------------------------------------------
// Step envelope (detail-only)
// ---------------------------------------------------------------------------

export const WorkflowRunStepSchema = Schema.Struct({
  stepKey: Schema.NonEmptyString,
  status: WorkflowRunStatusSchema,
  startedAt: Schema.optional(IsoTimestampSchema),
  finishedAt: Schema.optional(IsoTimestampSchema),
  error: Schema.optional(Schema.NonEmptyString),
});

export type WorkflowRunStep = Schema.Schema.Type<typeof WorkflowRunStepSchema>;

// ---------------------------------------------------------------------------
// Summary + Detail envelopes
// ---------------------------------------------------------------------------

const DurationMsSchema = Schema.Number.pipe(Schema.int(), Schema.nonNegative());

const AttemptSchema = Schema.Number.pipe(Schema.int(), Schema.greaterThan(0));

export const WorkflowRunSummarySchema = Schema.Struct({
  runId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  workflowKey: Schema.NonEmptyString,
  status: WorkflowRunStatusSchema,
  queuedAt: IsoTimestampSchema,
  startedAt: Schema.optional(IsoTimestampSchema),
  finishedAt: Schema.optional(IsoTimestampSchema),
  durationMs: Schema.optional(DurationMsSchema),
  attempt: AttemptSchema,
  lastError: Schema.optional(Schema.NonEmptyString),
});

export type WorkflowRunSummary = Schema.Schema.Type<
  typeof WorkflowRunSummarySchema
>;

export const WorkflowRunDetailSchema = Schema.Struct({
  runId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  workflowKey: Schema.NonEmptyString,
  status: WorkflowRunStatusSchema,
  queuedAt: IsoTimestampSchema,
  startedAt: Schema.optional(IsoTimestampSchema),
  finishedAt: Schema.optional(IsoTimestampSchema),
  durationMs: Schema.optional(DurationMsSchema),
  attempt: AttemptSchema,
  lastError: Schema.optional(Schema.NonEmptyString),
  steps: Schema.Array(WorkflowRunStepSchema),
  payloadProjection: Schema.NonEmptyString,
  auditCorrelationId: Schema.NonEmptyString,
});

export type WorkflowRunDetail = Schema.Schema.Type<
  typeof WorkflowRunDetailSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const WorkflowRunsListFiltersSchema = Schema.Struct({
  moduleId: Schema.optional(PlatformModuleIdSchema),
  status: Schema.optional(WorkflowRunStatusSchema),
  since: Schema.optional(IsoTimestampSchema),
  until: Schema.optional(IsoTimestampSchema),
});

export type WorkflowRunsListFilters = Schema.Schema.Type<
  typeof WorkflowRunsListFiltersSchema
>;

const PageSizeSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThan(0),
  Schema.lessThanOrEqualTo(500),
);

export const WorkflowRunsListInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  filters: WorkflowRunsListFiltersSchema,
  pageSize: PageSizeSchema,
  pageToken: Schema.optional(Schema.NonEmptyString),
});

export type WorkflowRunsListInput = Schema.Schema.Type<
  typeof WorkflowRunsListInputSchema
>;

export const WorkflowRunDetailInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  runId: Schema.NonEmptyString,
});

export type WorkflowRunDetailInput = Schema.Schema.Type<
  typeof WorkflowRunDetailInputSchema
>;

export const WorkflowRunReplayInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  runId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  reasonAttachmentText: Schema.optional(Schema.NonEmptyString),
});

export type WorkflowRunReplayInput = Schema.Schema.Type<
  typeof WorkflowRunReplayInputSchema
>;

export const WorkflowRunCancelInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  runId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  reasonAttachmentText: Schema.optional(Schema.NonEmptyString),
});

export type WorkflowRunCancelInput = Schema.Schema.Type<
  typeof WorkflowRunCancelInputSchema
>;

// ---------------------------------------------------------------------------
// Partial-failure entry (mirrors universal-search shape)
// ---------------------------------------------------------------------------

export const WorkflowRunsPartialFailureSchema = Schema.Struct({
  bucket: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
});

export type WorkflowRunsPartialFailure = Schema.Schema.Type<
  typeof WorkflowRunsPartialFailureSchema
>;

// ---------------------------------------------------------------------------
// List response envelope
// ---------------------------------------------------------------------------

export const WorkflowRunsListResultSchema = Schema.Struct({
  runs: Schema.Array(WorkflowRunSummarySchema),
  nextPageToken: Schema.optional(Schema.NonEmptyString),
  partialFailures: Schema.optional(
    Schema.Array(WorkflowRunsPartialFailureSchema),
  ),
});

export type WorkflowRunsListResult = Schema.Schema.Type<
  typeof WorkflowRunsListResultSchema
>;

// ---------------------------------------------------------------------------
// Write acknowledgements
// ---------------------------------------------------------------------------

export const WorkflowRunReplayResultSchema = Schema.Struct({
  accepted: Schema.Literal(true),
  runId: Schema.NonEmptyString,
  replayRunId: Schema.optional(Schema.NonEmptyString),
});

export type WorkflowRunReplayResult = Schema.Schema.Type<
  typeof WorkflowRunReplayResultSchema
>;

export const WorkflowRunCancelResultSchema = Schema.Struct({
  accepted: Schema.Literal(true),
  runId: Schema.NonEmptyString,
});

export type WorkflowRunCancelResult = Schema.Schema.Type<
  typeof WorkflowRunCancelResultSchema
>;
