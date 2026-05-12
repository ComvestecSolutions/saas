import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  getManagedFileSummaryImportExportJobSource,
  type ImportExportJobAdminView,
  ImportExportJobAdminViewSchema,
  importExportJobFormat,
  type ImportExportJobFormat,
  ImportExportJobFormatSchema,
  type ImportExportJobRecord,
  type ImportExportJobReference,
  importExportJobSource,
  type ImportExportJobSource,
  type ImportExportTenantScope,
  ImportExportTenantScopeSchema,
  IsoTimestampSchema,
  workflowJobStatus,
} from "@comvestec/contracts";
import {
  ImportExportJobPostgresRepository,
  type ImportExportJobPostgresRepositoryError,
  type ImportExportJobPostgresRepositoryService,
} from "../persistence";

export const RequestManagedFileSummaryExportRecordInputSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  tenantScope: ImportExportTenantScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  format: ImportExportJobFormatSchema,
  requestedBy: Schema.NonEmptyString,
  requestedAt: IsoTimestampSchema,
});

export type RequestManagedFileSummaryExportRecordInput = Schema.Schema.Type<
  typeof RequestManagedFileSummaryExportRecordInputSchema
>;

export const RequestSupportCaseSummaryExportRecordInputSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  tenantScope: ImportExportTenantScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  requestedBy: Schema.NonEmptyString,
  requestedAt: IsoTimestampSchema,
});

export type RequestSupportCaseSummaryExportRecordInput = Schema.Schema.Type<
  typeof RequestSupportCaseSummaryExportRecordInputSchema
>;

export const StartImportExportJobRecordInputSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  startedAt: IsoTimestampSchema,
});

export type StartImportExportJobRecordInput = Schema.Schema.Type<
  typeof StartImportExportJobRecordInputSchema
>;

export const CompleteImportExportJobRecordInputSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  artifactFileId: Schema.NonEmptyString,
  rowCount: Schema.NonNegativeInt,
  completedAt: IsoTimestampSchema,
});

export type CompleteImportExportJobRecordInput = Schema.Schema.Type<
  typeof CompleteImportExportJobRecordInputSchema
>;

export const FailImportExportJobRecordInputSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  lastError: Schema.NonEmptyString,
  completedAt: IsoTimestampSchema,
});

export type FailImportExportJobRecordInput = Schema.Schema.Type<
  typeof FailImportExportJobRecordInputSchema
>;

export const BlockImportExportJobRecordInputSchema =
  FailImportExportJobRecordInputSchema;

export type BlockImportExportJobRecordInput = Schema.Schema.Type<
  typeof BlockImportExportJobRecordInputSchema
>;

export type ImportExportJobRecordNotFoundError = {
  readonly _tag: "ImportExportJobRecordNotFoundError";
  readonly jobId: string;
};

export type ImportExportModuleError =
  | ParseResult.ParseError
  | ImportExportJobRecordNotFoundError
  | ImportExportJobPostgresRepositoryError;

export type ImportExportModuleService = {
  readonly requestManagedFileSummaryExportRecord: (
    input: RequestManagedFileSummaryExportRecordInput,
  ) => Effect.Effect<ImportExportJobAdminView, ImportExportModuleError>;
  readonly requestSupportCaseSummaryExportRecord: (
    input: RequestSupportCaseSummaryExportRecordInput,
  ) => Effect.Effect<ImportExportJobAdminView, ImportExportModuleError>;
  readonly startImportExportJobRecord: (
    input: StartImportExportJobRecordInput,
  ) => Effect.Effect<ImportExportJobAdminView, ImportExportModuleError>;
  readonly completeImportExportJobRecord: (
    input: CompleteImportExportJobRecordInput,
  ) => Effect.Effect<ImportExportJobAdminView, ImportExportModuleError>;
  readonly failImportExportJobRecord: (
    input: FailImportExportJobRecordInput,
  ) => Effect.Effect<ImportExportJobAdminView, ImportExportModuleError>;
  readonly blockImportExportJobRecord: (
    input: BlockImportExportJobRecordInput,
  ) => Effect.Effect<ImportExportJobAdminView, ImportExportModuleError>;
  readonly getImportExportJobRecord: (
    input: ImportExportJobReference,
  ) => Effect.Effect<
    ImportExportJobAdminView | undefined,
    ImportExportModuleError
  >;
};

export class ImportExportModule extends Context.Tag("ImportExportModule")<
  ImportExportModule,
  ImportExportModuleService
>() {}

const buildAdminView = (
  record: ImportExportJobRecord,
): Effect.Effect<ImportExportJobAdminView, ParseResult.ParseError> =>
  Schema.decodeUnknown(ImportExportJobAdminViewSchema)({
    jobId: record.jobId,
    tenantScope: record.tenantScope,
    tenantScopeId: record.tenantScopeId,
    source: record.source,
    format: record.format,
    status: record.status,
    ...(record.rowCount !== undefined ? { rowCount: record.rowCount } : {}),
    ...(record.artifactFileId !== undefined
      ? { artifactFileId: record.artifactFileId }
      : {}),
    ...(record.lastError !== undefined ? { lastError: record.lastError } : {}),
    ...(record.startedAt !== undefined ? { startedAt: record.startedAt } : {}),
    ...(record.completedAt !== undefined
      ? { completedAt: record.completedAt }
      : {}),
    createdAt: record.createdAt,
  });

const buildScheduledRecord = (input: {
  readonly jobId: string;
  readonly tenantScope: ImportExportTenantScope;
  readonly tenantScopeId: string;
  readonly source: ImportExportJobSource;
  readonly format: ImportExportJobFormat;
  readonly requestedBy: string;
  readonly requestedAt: string;
}): ImportExportJobRecord => ({
  jobId: input.jobId,
  tenantScope: input.tenantScope,
  tenantScopeId: input.tenantScopeId,
  source: input.source,
  format: input.format,
  status: workflowJobStatus.scheduled,
  requestedBy: input.requestedBy,
  createdAt: input.requestedAt,
  updatedAt: input.requestedAt,
});

const replaceStatus = (input: {
  readonly record: ImportExportJobRecord;
  readonly status: ImportExportJobRecord["status"];
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly rowCount?: number;
  readonly artifactFileId?: string;
  readonly lastError?: string;
}): ImportExportJobRecord => ({
  ...input.record,
  status: input.status,
  ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
  ...(input.completedAt !== undefined
    ? { completedAt: input.completedAt }
    : {}),
  ...(input.rowCount !== undefined ? { rowCount: input.rowCount } : {}),
  ...(input.artifactFileId !== undefined
    ? { artifactFileId: input.artifactFileId }
    : {}),
  ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
  updatedAt: input.updatedAt,
});

const importExportJobRecordNotFound = (
  jobId: string,
): ImportExportJobRecordNotFoundError => ({
  _tag: "ImportExportJobRecordNotFoundError",
  jobId,
});

const updateExistingRecord = (input: {
  readonly repository: ImportExportJobPostgresRepositoryService;
  readonly jobId: string;
  readonly update: (record: ImportExportJobRecord) => ImportExportJobRecord;
}): Effect.Effect<
  ImportExportJobRecord,
  ImportExportJobPostgresRepositoryError | ImportExportJobRecordNotFoundError
> =>
  Effect.gen(function* () {
    const record = yield* input.repository.getImportExportJobRecord({
      jobId: input.jobId,
    });

    if (record === undefined) {
      return yield* Effect.fail(importExportJobRecordNotFound(input.jobId));
    }

    return yield* input.repository.upsertImportExportJobRecord(
      input.update(record),
    );
  });

export const makeImportExportModule = () =>
  Effect.gen(function* () {
    const repository = yield* ImportExportJobPostgresRepository;

    return {
      requestManagedFileSummaryExportRecord: (input) =>
        Schema.decodeUnknown(RequestManagedFileSummaryExportRecordInputSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            repository.upsertImportExportJobRecord(
              buildScheduledRecord({
                ...request,
                source: getManagedFileSummaryImportExportJobSource(
                  request.format,
                ),
              }),
            ),
          ),
          Effect.flatMap((record) => buildAdminView(record)),
        ),
      requestSupportCaseSummaryExportRecord: (input) =>
        Schema.decodeUnknown(RequestSupportCaseSummaryExportRecordInputSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            repository.upsertImportExportJobRecord(
              buildScheduledRecord({
                ...request,
                source: importExportJobSource.supportCaseSummaryJson,
                format: importExportJobFormat.json,
              }),
            ),
          ),
          Effect.flatMap((record) => buildAdminView(record)),
        ),
      startImportExportJobRecord: (input) =>
        Schema.decodeUnknown(StartImportExportJobRecordInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            updateExistingRecord({
              repository,
              jobId: request.jobId,
              update: (record) =>
                replaceStatus({
                  record,
                  status: workflowJobStatus.running,
                  startedAt: request.startedAt,
                  updatedAt: request.startedAt,
                }),
            }),
          ),
          Effect.flatMap((record) => buildAdminView(record)),
        ),
      completeImportExportJobRecord: (input) =>
        Schema.decodeUnknown(CompleteImportExportJobRecordInputSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            updateExistingRecord({
              repository,
              jobId: request.jobId,
              update: (record) =>
                replaceStatus({
                  record,
                  status: workflowJobStatus.completed,
                  completedAt: request.completedAt,
                  rowCount: request.rowCount,
                  artifactFileId: request.artifactFileId,
                  updatedAt: request.completedAt,
                }),
            }),
          ),
          Effect.flatMap((record) => buildAdminView(record)),
        ),
      failImportExportJobRecord: (input) =>
        Schema.decodeUnknown(FailImportExportJobRecordInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            updateExistingRecord({
              repository,
              jobId: request.jobId,
              update: (record) =>
                replaceStatus({
                  record,
                  status: workflowJobStatus.failed,
                  completedAt: request.completedAt,
                  lastError: request.lastError,
                  updatedAt: request.completedAt,
                }),
            }),
          ),
          Effect.flatMap((record) => buildAdminView(record)),
        ),
      blockImportExportJobRecord: (input) =>
        Schema.decodeUnknown(BlockImportExportJobRecordInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            updateExistingRecord({
              repository,
              jobId: request.jobId,
              update: (record) =>
                replaceStatus({
                  record,
                  status: workflowJobStatus.blocked,
                  completedAt: request.completedAt,
                  lastError: request.lastError,
                  updatedAt: request.completedAt,
                }),
            }),
          ),
          Effect.flatMap((record) => buildAdminView(record)),
        ),
      getImportExportJobRecord: (input) =>
        repository
          .getImportExportJobRecord(input)
          .pipe(
            Effect.flatMap((record) =>
              record === undefined
                ? Effect.succeed(undefined)
                : buildAdminView(record),
            ),
          ),
    } satisfies ImportExportModuleService;
  });

export const makeImportExportModuleLayer = () =>
  Layer.effect(ImportExportModule, makeImportExportModule());
