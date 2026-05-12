import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  BillingRepairWorkflowPayloadSchema,
  IsoTimestampSchema,
  normalizeManagedFileSummaryImportExportFields,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
  type PlatformModuleId,
  workflowJobKind,
} from "@comvestec/contracts";
import {
  createWorkflowJobRecordSchema,
  type BillingReconciliationWorkflowJobRecord,
  type WorkflowJobRecordBase,
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

const ConditionalWorkflowJobCancellationSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  expectedUpdatedAt: IsoTimestampSchema,
  canceledAt: IsoTimestampSchema,
});

const DueWorkflowJobListSchema = Schema.Struct({
  sourceModuleId: PlatformModuleIdSchema,
  scheduledBefore: IsoTimestampSchema,
});

const RepairGapWorkflowJobListSchema = Schema.Struct({
  sourceModuleId: PlatformModuleIdSchema,
  tenantScope: Schema.optional(PlatformScopeSchema),
  tenantScopeId: Schema.optional(Schema.NonEmptyString),
});

type WorkflowJobRow = typeof workflowJobsTable.$inferSelect;

type WorkflowJobRecordWithPayload = WorkflowJobRecordBase & {
  readonly payload: unknown;
};

type WorkflowJobRecordForPayload<
  TPayloadSchema extends Schema.Schema.AnyNoContext,
> = WorkflowJobRecordBase & {
  readonly payload: Schema.Schema.Type<TPayloadSchema>;
};

export type WorkflowJobsPostgresQueryableForRecord<
  TWorkflowJobRecord extends WorkflowJobRecordWithPayload,
> = {
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
    record: TWorkflowJobRecord,
  ) => Promise<WorkflowJobRow | undefined>;
  readonly cancelWorkflowJobIfUpdatedAtMatches: (
    jobId: string,
    expectedUpdatedAt: Date,
    canceledAt: Date,
  ) => Promise<WorkflowJobRow | undefined>;
  readonly listDueWorkflowJobs: (
    sourceModuleId: PlatformModuleId,
    scheduledBefore: Date,
  ) => Promise<readonly WorkflowJobRow[]>;
  readonly listRepairGapWorkflowJobs: (input: {
    readonly sourceModuleId: PlatformModuleId;
    readonly tenantScope?: Schema.Schema.Type<typeof PlatformScopeSchema>;
    readonly tenantScopeId?: string;
  }) => Promise<readonly WorkflowJobRow[]>;
};

export type WorkflowJobsPostgresQueryable =
  WorkflowJobsPostgresQueryableForRecord<BillingReconciliationWorkflowJobRecord>;

export type WorkflowJobsPostgresRepositoryError =
  | ParseResult.ParseError
  | {
      readonly _tag: "WorkflowJobsPostgresRepositoryQueryError";
      readonly operation:
        | "persistWorkflowJob"
        | "getWorkflowJob"
        | "claimScheduledWorkflowJob"
        | "restoreWorkflowJobIfUpdatedAtMatches"
        | "cancelWorkflowJobIfUpdatedAtMatches"
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

const normalizeWorkflowJobPayload = (input: {
  readonly kind: WorkflowJobRow["kind"];
  readonly payload: unknown;
}) =>
  input.kind === workflowJobKind.importExportManagedFileSummary
    ? normalizeManagedFileSummaryImportExportFields(input.payload)
    : input.payload;

export type WorkflowJobsPostgresRepositoryServiceForRecord<TWorkflowJobRecord> =
  {
    readonly persistWorkflowJob: (
      input: TWorkflowJobRecord,
    ) => Effect.Effect<TWorkflowJobRecord, WorkflowJobsPostgresRepositoryError>;
    readonly getWorkflowJob: (input: {
      readonly jobId: string;
    }) => Effect.Effect<
      TWorkflowJobRecord | undefined,
      WorkflowJobsPostgresRepositoryError
    >;
    readonly claimScheduledWorkflowJob: (input: {
      readonly jobId: string;
      readonly now: string;
    }) => Effect.Effect<
      TWorkflowJobRecord | undefined,
      WorkflowJobsPostgresRepositoryError
    >;
    readonly restoreWorkflowJobIfUpdatedAtMatches: (input: {
      readonly jobId: string;
      readonly expectedUpdatedAt: string;
      readonly record: TWorkflowJobRecord;
    }) => Effect.Effect<
      TWorkflowJobRecord | undefined,
      WorkflowJobsPostgresRepositoryError
    >;
    readonly cancelWorkflowJobIfUpdatedAtMatches: (input: {
      readonly jobId: string;
      readonly expectedUpdatedAt: string;
      readonly canceledAt: string;
    }) => Effect.Effect<
      TWorkflowJobRecord | undefined,
      WorkflowJobsPostgresRepositoryError
    >;
    readonly listDueWorkflowJobs: (input: {
      readonly sourceModuleId: PlatformModuleId;
      readonly scheduledBefore: string;
    }) => Effect.Effect<
      readonly TWorkflowJobRecord[],
      WorkflowJobsPostgresRepositoryError
    >;
    readonly listRepairGapWorkflowJobs: (input: {
      readonly sourceModuleId: PlatformModuleId;
      readonly tenantScope?: Schema.Schema.Type<typeof PlatformScopeSchema>;
      readonly tenantScopeId?: string;
    }) => Effect.Effect<
      readonly TWorkflowJobRecord[],
      WorkflowJobsPostgresRepositoryError
    >;
  };

export type WorkflowJobsPostgresRepositoryService =
  WorkflowJobsPostgresRepositoryServiceForRecord<BillingReconciliationWorkflowJobRecord>;

export class WorkflowJobsPostgresRepository extends Context.Tag(
  "WorkflowJobsPostgresRepository",
)<WorkflowJobsPostgresRepository, WorkflowJobsPostgresRepositoryService>() {}

export const makeWorkflowJobsPostgresRepositoryForRecordSchema = <
  TWorkflowJobRecord extends WorkflowJobRecordWithPayload,
  TWorkflowJobRecordEncoded,
>(
  database: PostgresDatabase,
  queryable: WorkflowJobsPostgresQueryableForRecord<TWorkflowJobRecord>,
  workflowJobRecordSchema: Schema.Schema<
    TWorkflowJobRecord,
    TWorkflowJobRecordEncoded,
    never
  >,
) => {
  const ConditionalWorkflowJobRestoreSchema = Schema.Struct({
    jobId: Schema.NonEmptyString,
    expectedUpdatedAt: IsoTimestampSchema,
    record: workflowJobRecordSchema,
  });

  const buildRecordFromRow = (row: WorkflowJobRow) =>
    Schema.decodeUnknown(workflowJobRecordSchema)({
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
      payload: normalizeWorkflowJobPayload({
        kind: row.kind,
        payload: row.payload,
      }),
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    });

  const buildInsertRow = (record: TWorkflowJobRecord) => ({
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

  return Effect.succeed<
    WorkflowJobsPostgresRepositoryServiceForRecord<TWorkflowJobRecord>
  >({
    persistWorkflowJob: (input: TWorkflowJobRecord) =>
      Schema.decodeUnknown(workflowJobRecordSchema)(input).pipe(
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
    cancelWorkflowJobIfUpdatedAtMatches: (input) =>
      Schema.decodeUnknown(ConditionalWorkflowJobCancellationSchema)(
        input,
      ).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              queryable.cancelWorkflowJobIfUpdatedAtMatches(
                request.jobId,
                new Date(request.expectedUpdatedAt),
                new Date(request.canceledAt),
              ),
            catch: (cause) =>
              ({
                _tag: "WorkflowJobsPostgresRepositoryQueryError",
                operation: "cancelWorkflowJobIfUpdatedAtMatches",
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
              queryable.listRepairGapWorkflowJobs({
                sourceModuleId: request.sourceModuleId,
                ...(request.tenantScope === undefined
                  ? {}
                  : { tenantScope: request.tenantScope }),
                ...(request.tenantScopeId === undefined
                  ? {}
                  : { tenantScopeId: request.tenantScopeId }),
              }),
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
};

export const makeWorkflowJobsPostgresRepositoryForPayload = <
  const TPayloadSchema extends Schema.Schema.AnyNoContext,
>(
  database: PostgresDatabase,
  queryable: WorkflowJobsPostgresQueryableForRecord<
    WorkflowJobRecordForPayload<TPayloadSchema>
  >,
  payloadSchema: TPayloadSchema,
) => {
  const workflowJobRecordSchema = createWorkflowJobRecordSchema(payloadSchema);
  type WorkflowJobRecord = WorkflowJobRecordForPayload<TPayloadSchema>;
  const typedWorkflowJobRecordSchema =
    workflowJobRecordSchema as unknown as Schema.Schema<
      WorkflowJobRecord,
      unknown,
      never
    >;

  return makeWorkflowJobsPostgresRepositoryForRecordSchema(
    database,
    queryable,
    typedWorkflowJobRecordSchema,
  );
};

export const makeWorkflowJobsPostgresRepository = (
  database: PostgresDatabase,
  queryable: WorkflowJobsPostgresQueryable,
) =>
  makeWorkflowJobsPostgresRepositoryForPayload(
    database,
    queryable,
    BillingRepairWorkflowPayloadSchema,
  );

export const makeWorkflowJobsPostgresRepositoryLayer = (
  database: PostgresDatabase,
  queryable: WorkflowJobsPostgresQueryable,
) =>
  Layer.effect(
    WorkflowJobsPostgresRepository,
    makeWorkflowJobsPostgresRepository(database, queryable),
  );
