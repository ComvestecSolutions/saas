import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  normalizeManagedFileSummaryImportExportFields,
  type ImportExportJobRecord,
  ImportExportJobRecordSchema,
  type ImportExportJobReference,
  ImportExportJobReferenceSchema,
} from "@comvestec/contracts";
import { importExportJobsTable } from "./schema";

type ImportExportJobRow = typeof importExportJobsTable.$inferSelect;

export type ImportExportJobPostgresQueryable = {
  readonly upsertImportExportJob: (
    record: typeof importExportJobsTable.$inferInsert,
  ) => Promise<ImportExportJobRow>;
  readonly getImportExportJob: (
    jobId: string,
  ) => Promise<ImportExportJobRow | undefined>;
};

export type ImportExportJobPostgresRepositoryQueryError = {
  readonly _tag: "ImportExportJobPostgresRepositoryQueryError";
  readonly operation:
    | "upsertImportExportJobRecord"
    | "getImportExportJobRecord";
  readonly cause: unknown;
};

export type ImportExportJobPostgresRepositoryError =
  | ParseResult.ParseError
  | ImportExportJobPostgresRepositoryQueryError;

const parseTimestamp = (value: string | undefined) =>
  value === undefined ? null : new Date(value);

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const buildImportExportJobRecord = (row: ImportExportJobRow) =>
  Schema.decodeUnknown(ImportExportJobRecordSchema)(
    normalizeManagedFileSummaryImportExportFields({
      jobId: row.jobId,
      tenantScope: row.tenantScope,
      tenantScopeId: row.tenantScopeId,
      source: row.source,
      ...(row.format != null ? { format: row.format } : {}),
      status: row.status,
      requestedBy: row.requestedBy,
      ...(row.rowCount != null ? { rowCount: row.rowCount } : {}),
      ...(row.artifactFileId != null
        ? { artifactFileId: row.artifactFileId }
        : {}),
      ...(row.lastError != null ? { lastError: row.lastError } : {}),
      ...(toIsoString(row.startedAt) !== undefined
        ? { startedAt: toIsoString(row.startedAt) }
        : {}),
      ...(toIsoString(row.completedAt) !== undefined
        ? { completedAt: toIsoString(row.completedAt) }
        : {}),
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    }),
  );

const buildInsertRow = (record: ImportExportJobRecord) => ({
  jobId: record.jobId,
  tenantScope: record.tenantScope,
  tenantScopeId: record.tenantScopeId,
  source: record.source,
  format: record.format,
  status: record.status,
  requestedBy: record.requestedBy,
  rowCount: record.rowCount ?? null,
  artifactFileId: record.artifactFileId ?? null,
  lastError: record.lastError ?? null,
  startedAt: parseTimestamp(record.startedAt),
  completedAt: parseTimestamp(record.completedAt),
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

export type ImportExportJobPostgresRepositoryService = {
  readonly upsertImportExportJobRecord: (
    input: ImportExportJobRecord,
  ) => Effect.Effect<
    ImportExportJobRecord,
    ImportExportJobPostgresRepositoryError
  >;
  readonly getImportExportJobRecord: (
    input: ImportExportJobReference,
  ) => Effect.Effect<
    ImportExportJobRecord | undefined,
    ImportExportJobPostgresRepositoryError
  >;
};

export class ImportExportJobPostgresRepository extends Context.Tag(
  "ImportExportJobPostgresRepository",
)<
  ImportExportJobPostgresRepository,
  ImportExportJobPostgresRepositoryService
>() {}

export const makeImportExportJobPostgresRepository = (
  database: ImportExportJobPostgresQueryable,
) =>
  Effect.succeed<ImportExportJobPostgresRepositoryService>({
    upsertImportExportJobRecord: (input: ImportExportJobRecord) =>
      Schema.decodeUnknown(ImportExportJobRecordSchema)(input).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () => database.upsertImportExportJob(buildInsertRow(record)),
            catch: (cause) =>
              ({
                _tag: "ImportExportJobPostgresRepositoryQueryError",
                operation: "upsertImportExportJobRecord",
                cause,
              }) satisfies ImportExportJobPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) => buildImportExportJobRecord(row)),
      ),
    getImportExportJobRecord: (input: ImportExportJobReference) =>
      Schema.decodeUnknown(ImportExportJobReferenceSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () => database.getImportExportJob(request.jobId),
            catch: (cause) =>
              ({
                _tag: "ImportExportJobPostgresRepositoryQueryError",
                operation: "getImportExportJobRecord",
                cause,
              }) satisfies ImportExportJobPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildImportExportJobRecord(row),
        ),
      ),
  });

export const makeImportExportJobPostgresRepositoryLayer = (
  database: ImportExportJobPostgresQueryable,
) =>
  Layer.effect(
    ImportExportJobPostgresRepository,
    makeImportExportJobPostgresRepository(database),
  );
