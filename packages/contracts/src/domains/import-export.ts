import { Schema } from "effect";
import { platformScope } from "../access/platform-scopes";
import { IsoTimestampSchema } from "../runtime/timestamps";

const ImportExportJobSourceConstantSchema = Schema.Struct({
  managedFileSummaryJson: Schema.Literal("managed-file-summary-json"),
  managedFileSummaryCsv: Schema.Literal("managed-file-summary-csv"),
  supportCaseSummaryJson: Schema.Literal("support-case-summary-json"),
});

export const importExportJobSource = Schema.validateSync(
  ImportExportJobSourceConstantSchema,
)({
  managedFileSummaryJson: "managed-file-summary-json",
  managedFileSummaryCsv: "managed-file-summary-csv",
  supportCaseSummaryJson: "support-case-summary-json",
} satisfies Schema.Schema.Type<typeof ImportExportJobSourceConstantSchema>);

export const importExportJobSources = [
  importExportJobSource.managedFileSummaryJson,
  importExportJobSource.managedFileSummaryCsv,
  importExportJobSource.supportCaseSummaryJson,
] as const;

export const ImportExportJobSourceSchema = Schema.Literal(
  ...importExportJobSources,
);

export type ImportExportJobSource = Schema.Schema.Type<
  typeof ImportExportJobSourceSchema
>;

const ImportExportJobFormatConstantSchema = Schema.Struct({
  json: Schema.Literal("json"),
  csv: Schema.Literal("csv"),
});

export const importExportJobFormat = Schema.validateSync(
  ImportExportJobFormatConstantSchema,
)({
  json: "json",
  csv: "csv",
} satisfies Schema.Schema.Type<typeof ImportExportJobFormatConstantSchema>);

export const importExportJobFormats = [
  importExportJobFormat.json,
  importExportJobFormat.csv,
] as const;

export const ImportExportJobFormatSchema = Schema.Literal(
  ...importExportJobFormats,
);

export type ImportExportJobFormat = Schema.Schema.Type<
  typeof ImportExportJobFormatSchema
>;

export const getManagedFileSummaryImportExportJobSource = (
  format: ImportExportJobFormat,
): ImportExportJobSource =>
  format === importExportJobFormat.csv
    ? importExportJobSource.managedFileSummaryCsv
    : importExportJobSource.managedFileSummaryJson;

export const getSupportCaseSummaryImportExportJobSource = () =>
  importExportJobSource.supportCaseSummaryJson;

const inferManagedFileSummaryImportExportFormat = (source: unknown) => {
  switch (source) {
    case importExportJobSource.managedFileSummaryCsv:
      return importExportJobFormat.csv;
    case importExportJobSource.managedFileSummaryJson:
      return importExportJobFormat.json;
    default:
      return undefined;
  }
};

export const normalizeManagedFileSummaryImportExportFields = (
  value: unknown,
) => {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const normalizedValue = value as {
    readonly source?: unknown;
    readonly format?: unknown;
  };

  if (normalizedValue.source === importExportJobSource.supportCaseSummaryJson) {
    return normalizedValue.format === undefined
      ? {
          ...normalizedValue,
          format: importExportJobFormat.json,
        }
      : normalizedValue;
  }

  const format =
    normalizedValue.format ??
    inferManagedFileSummaryImportExportFormat(normalizedValue.source);

  if (
    format !== importExportJobFormat.json &&
    format !== importExportJobFormat.csv
  ) {
    return value;
  }

  return {
    ...normalizedValue,
    source: getManagedFileSummaryImportExportJobSource(format),
    format,
  };
};

const ImportExportJobStatusConstantSchema = Schema.Struct({
  scheduled: Schema.Literal("scheduled"),
  running: Schema.Literal("running"),
  completed: Schema.Literal("completed"),
  blocked: Schema.Literal("blocked"),
  failed: Schema.Literal("failed"),
  canceled: Schema.Literal("canceled"),
});

export const importExportJobStatus = Schema.validateSync(
  ImportExportJobStatusConstantSchema,
)({
  scheduled: "scheduled",
  running: "running",
  completed: "completed",
  blocked: "blocked",
  failed: "failed",
  canceled: "canceled",
} satisfies Schema.Schema.Type<typeof ImportExportJobStatusConstantSchema>);

export const importExportJobStatuses = [
  importExportJobStatus.scheduled,
  importExportJobStatus.running,
  importExportJobStatus.completed,
  importExportJobStatus.blocked,
  importExportJobStatus.failed,
  importExportJobStatus.canceled,
] as const;

export const ImportExportJobStatusSchema = Schema.Literal(
  ...importExportJobStatuses,
);

export type ImportExportJobStatus = Schema.Schema.Type<
  typeof ImportExportJobStatusSchema
>;

export const ImportExportTenantScopeSchema = Schema.Literal(
  platformScope.enterprise,
  platformScope.organization,
  platformScope.individual,
);

export type ImportExportTenantScope = Schema.Schema.Type<
  typeof ImportExportTenantScopeSchema
>;

export const ImportExportJobReferenceSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
});

export type ImportExportJobReference = Schema.Schema.Type<
  typeof ImportExportJobReferenceSchema
>;

export const ImportExportJobRecordSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  tenantScope: ImportExportTenantScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  source: ImportExportJobSourceSchema,
  format: ImportExportJobFormatSchema,
  status: ImportExportJobStatusSchema,
  requestedBy: Schema.NonEmptyString,
  rowCount: Schema.optional(Schema.NonNegativeInt),
  artifactFileId: Schema.optional(Schema.NonEmptyString),
  lastError: Schema.optional(Schema.NonEmptyString),
  startedAt: Schema.optional(IsoTimestampSchema),
  completedAt: Schema.optional(IsoTimestampSchema),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type ImportExportJobRecord = Schema.Schema.Type<
  typeof ImportExportJobRecordSchema
>;

export const ImportExportJobRecordListSchema = Schema.Array(
  ImportExportJobRecordSchema,
);

export type ImportExportJobRecordList = Schema.Schema.Type<
  typeof ImportExportJobRecordListSchema
>;

export const ImportExportJobAdminViewSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  tenantScope: ImportExportTenantScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  source: ImportExportJobSourceSchema,
  format: ImportExportJobFormatSchema,
  status: ImportExportJobStatusSchema,
  rowCount: Schema.optional(Schema.NonNegativeInt),
  artifactFileId: Schema.optional(Schema.NonEmptyString),
  lastError: Schema.optional(Schema.NonEmptyString),
  startedAt: Schema.optional(IsoTimestampSchema),
  completedAt: Schema.optional(IsoTimestampSchema),
  createdAt: IsoTimestampSchema,
});

export type ImportExportJobAdminView = Schema.Schema.Type<
  typeof ImportExportJobAdminViewSchema
>;
