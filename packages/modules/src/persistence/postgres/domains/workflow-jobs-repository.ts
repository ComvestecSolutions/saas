import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  IsoTimestampSchema,
  PlatformModuleIdSchema,
  type PlatformModuleId,
} from "@comvestec/contracts";
import {
  BillingReconciliationWorkflowJobRecordSchema,
  type BillingReconciliationWorkflowJobRecord,
} from "../../../domains/workflow-jobs";
import { workflowJobsTable } from "./workflow-jobs";
import type { PostgresDatabase } from "../database";

const WorkflowJobLookupSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
});

const ScheduledWorkflowJobClaimSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  now: IsoTimestampSchema,
});

const ConditionalWorkflowJobRestoreSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  expectedUpdatedAt: IsoTimestampSchema,
  record: BillingReconciliationWorkflowJobRecordSchema,
});

const DueWorkflowJobListSchema = Schema.Struct({
  sourceModuleId: PlatformModuleIdSchema,
  scheduledBefore: IsoTimestampSchema,
});

const RepairGapWorkflowJobListSchema = Schema.Struct({
  sourceModuleId: PlatformModuleIdSchema,
});

type WorkflowJobRow = typeof workflowJobsTable.$inferSelect;

export type WorkflowJobsPostgresQueryable = {
  readonly getWorkflowJobById: (
    jobId: string,
  ) => Promise<WorkflowJobRow | undefined>;
  readonly claimScheduledWorkflowJob: (
    jobId: string,
    now: Date,
  ) => Promise<WorkflowJobRow | undefined>;
  readonly restoreWorkflowJobIfUpdatedAtMatches: (
    jobId: string,
    expectedUpdatedAt: Date,
    record: BillingReconciliationWorkflowJobRecord,
  ) => Promise<WorkflowJobRow | undefined>;
  readonly listDueWorkflowJobs: (
    sourceModuleId: PlatformModuleId,
    scheduledBefore: Date,
  ) => Promise<readonly WorkflowJobRow[]>;
  readonly listRepairGapWorkflowJobs: (
    sourceModuleId: PlatformModuleId,
  ) => Promise<readonly WorkflowJobRow[]>;
};

export type WorkflowJobsPostgresRepositoryError =
  | ParseResult.ParseError
  | {
      readonly _tag: "WorkflowJobsPostgresRepositoryQueryError";
      readonly operation:
        | "persistWorkflowJob"
        | "getWorkflowJob"
        | "claimScheduledWorkflowJob"
        | "restoreWorkflowJobIfUpdatedAtMatches"
        | "listDueWorkflowJobs"
        | "listRepairGapWorkflowJobs";
      readonly cause: unknown;
    };

const parseTimestamp = (value: string | undefined) =>
  value === undefined ? undefined : new Date(value);

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const buildRecordFromRow = (row: WorkflowJobRow) =>
  Schema.decodeUnknown(BillingReconciliationWorkflowJobRecordSchema)({
    jobId: row.jobId,
    runtime: row.runtime,
    sourceModuleId: row.sourceModuleId,
    kind: row.kind,
    trigger: row.trigger,
    status: row.status,
    tenantScope: row.tenantScope,
    tenantScopeId: row.tenantScopeId,
    attempts: row.attempts,
    scheduledAt: toIsoString(row.scheduledAt),
    ...(row.completedAt != null
      ? { completedAt: toIsoString(row.completedAt) }
      : {}),
    ...(row.lastError != null ? { lastError: row.lastError } : {}),
    ...(row.gapReason != null ? { gapReason: row.gapReason } : {}),
    payload: row.payload,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  });

const buildInsertRow = (record: BillingReconciliationWorkflowJobRecord) => ({
  jobId: record.jobId,
  runtime: record.runtime,
  sourceModuleId: record.sourceModuleId,
  kind: record.kind,
  trigger: record.trigger,
  status: record.status,
  tenantScope: record.tenantScope,
  tenantScopeId: record.tenantScopeId,
  attempts: record.attempts,
  scheduledAt: new Date(record.scheduledAt),
  completedAt: parseTimestamp(record.completedAt),
  lastError: record.lastError,
  gapReason: record.gapReason,
  payload: record.payload,
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

export type WorkflowJobsPostgresRepositoryService = {
  readonly persistWorkflowJob: (
    input: BillingReconciliationWorkflowJobRecord,
  ) => Effect.Effect<
    BillingReconciliationWorkflowJobRecord,
    WorkflowJobsPostgresRepositoryError
  >;
  readonly getWorkflowJob: (input: {
    readonly jobId: string;
  }) => Effect.Effect<
    BillingReconciliationWorkflowJobRecord | undefined,
    WorkflowJobsPostgresRepositoryError
  >;
  readonly claimScheduledWorkflowJob: (input: {
    readonly jobId: string;
    readonly now: string;
  }) => Effect.Effect<
    BillingReconciliationWorkflowJobRecord | undefined,
    WorkflowJobsPostgresRepositoryError
  >;
  readonly restoreWorkflowJobIfUpdatedAtMatches: (input: {
    readonly jobId: string;
    readonly expectedUpdatedAt: string;
    readonly record: BillingReconciliationWorkflowJobRecord;
  }) => Effect.Effect<
    BillingReconciliationWorkflowJobRecord | undefined,
    WorkflowJobsPostgresRepositoryError
  >;
  readonly listDueWorkflowJobs: (input: {
    readonly sourceModuleId: PlatformModuleId;
    readonly scheduledBefore: string;
  }) => Effect.Effect<
    readonly BillingReconciliationWorkflowJobRecord[],
    WorkflowJobsPostgresRepositoryError
  >;
  readonly listRepairGapWorkflowJobs: (input: {
    readonly sourceModuleId: PlatformModuleId;
  }) => Effect.Effect<
    readonly BillingReconciliationWorkflowJobRecord[],
    WorkflowJobsPostgresRepositoryError
  >;
};

export class WorkflowJobsPostgresRepository extends Context.Tag(
  "WorkflowJobsPostgresRepository",
)<WorkflowJobsPostgresRepository, WorkflowJobsPostgresRepositoryService>() {}

export const makeWorkflowJobsPostgresRepository = (
  database: PostgresDatabase,
  queryable: WorkflowJobsPostgresQueryable,
) =>
  Effect.succeed<WorkflowJobsPostgresRepositoryService>({
    persistWorkflowJob: (input: BillingReconciliationWorkflowJobRecord) =>
      Schema.decodeUnknown(BillingReconciliationWorkflowJobRecordSchema)(
        input,
      ).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database
                .insert(workflowJobsTable)
                .values(buildInsertRow(record))
                .onConflictDoUpdate({
                  target: [workflowJobsTable.jobId],
                  set: {
                    runtime: record.runtime,
                    sourceModuleId: record.sourceModuleId,
                    kind: record.kind,
                    trigger: record.trigger,
                    status: record.status,
                    tenantScope: record.tenantScope,
                    tenantScopeId: record.tenantScopeId,
                    attempts: record.attempts,
                    scheduledAt: new Date(record.scheduledAt),
                    completedAt: parseTimestamp(record.completedAt),
                    lastError: record.lastError,
                    gapReason: record.gapReason,
                    payload: record.payload,
                    updatedAt: new Date(record.updatedAt),
                  },
                })
                .execute(),
            catch: (cause) =>
              ({
                _tag: "WorkflowJobsPostgresRepositoryQueryError",
                operation: "persistWorkflowJob",
                cause,
              }) as const,
          }).pipe(Effect.as(record)),
        ),
      ),
    getWorkflowJob: (input) =>
      Schema.decodeUnknown(WorkflowJobLookupSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () => queryable.getWorkflowJobById(request.jobId),
            catch: (cause) =>
              ({
                _tag: "WorkflowJobsPostgresRepositoryQueryError",
                operation: "getWorkflowJob",
                cause,
              }) as const,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildRecordFromRow(row),
        ),
      ),
    claimScheduledWorkflowJob: (input) =>
      Schema.decodeUnknown(ScheduledWorkflowJobClaimSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              queryable.claimScheduledWorkflowJob(
                request.jobId,
                new Date(request.now),
              ),
            catch: (cause) =>
              ({
                _tag: "WorkflowJobsPostgresRepositoryQueryError",
                operation: "claimScheduledWorkflowJob",
                cause,
              }) as const,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildRecordFromRow(row),
        ),
      ),
    restoreWorkflowJobIfUpdatedAtMatches: (input) =>
      Schema.decodeUnknown(ConditionalWorkflowJobRestoreSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              queryable.restoreWorkflowJobIfUpdatedAtMatches(
                request.jobId,
                new Date(request.expectedUpdatedAt),
                request.record,
              ),
            catch: (cause) =>
              ({
                _tag: "WorkflowJobsPostgresRepositoryQueryError",
                operation: "restoreWorkflowJobIfUpdatedAtMatches",
                cause,
              }) as const,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildRecordFromRow(row),
        ),
      ),
    listDueWorkflowJobs: (input) =>
      Schema.decodeUnknown(DueWorkflowJobListSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              queryable.listDueWorkflowJobs(
                request.sourceModuleId,
                new Date(request.scheduledBefore),
              ),
            catch: (cause) =>
              ({
                _tag: "WorkflowJobsPostgresRepositoryQueryError",
                operation: "listDueWorkflowJobs",
                cause,
              }) as const,
          }),
        ),
        Effect.flatMap((rows) => Effect.forEach(rows, buildRecordFromRow)),
      ),
    listRepairGapWorkflowJobs: (input) =>
      Schema.decodeUnknown(RepairGapWorkflowJobListSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              queryable.listRepairGapWorkflowJobs(request.sourceModuleId),
            catch: (cause) =>
              ({
                _tag: "WorkflowJobsPostgresRepositoryQueryError",
                operation: "listRepairGapWorkflowJobs",
                cause,
              }) as const,
          }),
        ),
        Effect.flatMap((rows) => Effect.forEach(rows, buildRecordFromRow)),
      ),
  });

export const makeWorkflowJobsPostgresRepositoryLayer = (
  database: PostgresDatabase,
  queryable: WorkflowJobsPostgresQueryable,
) =>
  Layer.effect(
    WorkflowJobsPostgresRepository,
    makeWorkflowJobsPostgresRepository(database, queryable),
  );
