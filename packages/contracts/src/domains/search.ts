import { Schema } from "effect";
import { platformScope } from "../access/platform-scopes";
import {
  FileSizeBytesSchema,
  ManagedFileSummaryViewListSchema,
  ManagedFileSummaryViewSchema,
} from "./file-storage";
import { IsoTimestampSchema } from "../runtime/timestamps";
import {
  SupportOperationsCasePrioritySchema,
  SupportOperationsCaseStatusSchema,
  SupportOperationsCaseSupportViewListSchema,
  SupportOperationsCaseSupportViewSchema,
} from "../runtime/support-operations-cases";

const SearchIndexLifecycleStateConstantSchema = Schema.Struct({
  ready: Schema.Literal("ready"),
  syncing: Schema.Literal("syncing"),
  deleting: Schema.Literal("deleting"),
  deleted: Schema.Literal("deleted"),
  failed: Schema.Literal("failed"),
});

export const searchIndexLifecycleState = Schema.validateSync(
  SearchIndexLifecycleStateConstantSchema,
)({
  ready: "ready",
  syncing: "syncing",
  deleting: "deleting",
  deleted: "deleted",
  failed: "failed",
} satisfies Schema.Schema.Type<typeof SearchIndexLifecycleStateConstantSchema>);

export const SearchIndexLifecycleStateSchema = Schema.Literal(
  searchIndexLifecycleState.ready,
  searchIndexLifecycleState.syncing,
  searchIndexLifecycleState.deleting,
  searchIndexLifecycleState.deleted,
  searchIndexLifecycleState.failed,
);

const SearchDocumentFamilyConstantSchema = Schema.Struct({
  managedFileSummary: Schema.Literal("managed-file-summary"),
  supportCaseSummary: Schema.Literal("support-case-summary"),
});

export const searchDocumentFamily = Schema.validateSync(
  SearchDocumentFamilyConstantSchema,
)({
  managedFileSummary: "managed-file-summary",
  supportCaseSummary: "support-case-summary",
} satisfies Schema.Schema.Type<typeof SearchDocumentFamilyConstantSchema>);

export const SearchDocumentFamilySchema = Schema.Literal(
  searchDocumentFamily.managedFileSummary,
  searchDocumentFamily.supportCaseSummary,
);

export type SearchDocumentFamily = Schema.Schema.Type<
  typeof SearchDocumentFamilySchema
>;

const SearchSortDirectionConstantSchema = Schema.Struct({
  asc: Schema.Literal("asc"),
  desc: Schema.Literal("desc"),
});

export const searchSortDirection = Schema.validateSync(
  SearchSortDirectionConstantSchema,
)({
  asc: "asc",
  desc: "desc",
} satisfies Schema.Schema.Type<typeof SearchSortDirectionConstantSchema>);

export const SearchSortDirectionSchema = Schema.Literal(
  searchSortDirection.asc,
  searchSortDirection.desc,
);

export type SearchSortDirection = Schema.Schema.Type<
  typeof SearchSortDirectionSchema
>;

const SearchSupportCaseSortFieldConstantSchema = Schema.Struct({
  startedAt: Schema.Literal("startedAt"),
  lastUpdatedAt: Schema.Literal("lastUpdatedAt"),
});

export const searchSupportCaseSortField = Schema.validateSync(
  SearchSupportCaseSortFieldConstantSchema,
)({
  startedAt: "startedAt",
  lastUpdatedAt: "lastUpdatedAt",
} satisfies Schema.Schema.Type<
  typeof SearchSupportCaseSortFieldConstantSchema
>);

export const SearchSupportCaseSortFieldSchema = Schema.Literal(
  searchSupportCaseSortField.startedAt,
  searchSupportCaseSortField.lastUpdatedAt,
);

export type SearchSupportCaseSortField = Schema.Schema.Type<
  typeof SearchSupportCaseSortFieldSchema
>;

export type SearchIndexLifecycleState = Schema.Schema.Type<
  typeof SearchIndexLifecycleStateSchema
>;

export const SearchDocumentCountSchema = Schema.Number.pipe(
  Schema.filter((value) => Number.isInteger(value) && value >= 0),
);

export type SearchDocumentCount = Schema.Schema.Type<
  typeof SearchDocumentCountSchema
>;

export const SearchQueryLimitSchema = Schema.Number.pipe(
  Schema.filter((value) => Number.isInteger(value) && value > 0 && value <= 50),
);

export type SearchQueryLimit = Schema.Schema.Type<
  typeof SearchQueryLimitSchema
>;

export const SearchTenantScopeSchema = Schema.Literal(
  platformScope.enterprise,
  platformScope.organization,
  platformScope.individual,
);

export type SearchTenantScope = Schema.Schema.Type<
  typeof SearchTenantScopeSchema
>;

const SearchTenantIndexTargetFields = {
  scope: SearchTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
};

const SearchTenantIndexReferenceFields = {
  indexName: Schema.NonEmptyString,
  ...SearchTenantIndexTargetFields,
};

export const SearchManagedFileDocumentSchema = ManagedFileSummaryViewSchema;

export type SearchManagedFileDocument = Schema.Schema.Type<
  typeof SearchManagedFileDocumentSchema
>;

export const SearchManagedFileDocumentListSchema =
  ManagedFileSummaryViewListSchema;

export type SearchManagedFileDocumentList = Schema.Schema.Type<
  typeof SearchManagedFileDocumentListSchema
>;

export const SearchManagedFileIndexedDocumentSchema = Schema.Struct({
  documentId: Schema.NonEmptyString,
  documentFamily: Schema.Literal(searchDocumentFamily.managedFileSummary),
  fileId: Schema.NonEmptyString,
  fileName: Schema.NonEmptyString,
  contentType: Schema.NonEmptyString,
  sizeBytes: FileSizeBytesSchema,
  deletedAt: Schema.optional(IsoTimestampSchema),
});

export type SearchManagedFileIndexedDocument = Schema.Schema.Type<
  typeof SearchManagedFileIndexedDocumentSchema
>;

export const SearchSupportCaseDocumentSchema =
  SupportOperationsCaseSupportViewSchema;

export type SearchSupportCaseDocument = Schema.Schema.Type<
  typeof SearchSupportCaseDocumentSchema
>;

export const SearchSupportCaseDocumentListSchema =
  SupportOperationsCaseSupportViewListSchema;

export type SearchSupportCaseDocumentList = Schema.Schema.Type<
  typeof SearchSupportCaseDocumentListSchema
>;

export const SearchSupportCaseIndexedDocumentSchema = Schema.Struct({
  documentId: Schema.NonEmptyString,
  documentFamily: Schema.Literal(searchDocumentFamily.supportCaseSummary),
  caseId: Schema.NonEmptyString,
  supportAgent: Schema.NonEmptyString,
  tenantScope: SearchTenantScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  summary: Schema.NonEmptyString,
  status: SupportOperationsCaseStatusSchema,
  priority: SupportOperationsCasePrioritySchema,
  startedAt: IsoTimestampSchema,
  lastUpdatedAt: IsoTimestampSchema,
});

export type SearchSupportCaseIndexedDocument = Schema.Schema.Type<
  typeof SearchSupportCaseIndexedDocumentSchema
>;

export const SearchTenantDocumentSchema = Schema.Union(
  SearchManagedFileIndexedDocumentSchema,
  SearchSupportCaseIndexedDocumentSchema,
);

export type SearchTenantDocument = Schema.Schema.Type<
  typeof SearchTenantDocumentSchema
>;

export const SearchTenantDocumentListSchema = Schema.Array(
  SearchTenantDocumentSchema,
);

export type SearchTenantDocumentList = Schema.Schema.Type<
  typeof SearchTenantDocumentListSchema
>;

const SearchTenantIndexSynonymValuesSchema = Schema.Array(
  Schema.NonEmptyString,
).pipe(Schema.filter((value) => value.length > 0));

export const SearchTenantIndexSynonymMapSchema = Schema.Record({
  key: Schema.NonEmptyString,
  value: SearchTenantIndexSynonymValuesSchema,
});

export type SearchTenantIndexSynonymMap = Schema.Schema.Type<
  typeof SearchTenantIndexSynonymMapSchema
>;

export const SearchTenantIndexSettingsSchema = Schema.Struct({
  filterableAttributes: Schema.Array(Schema.NonEmptyString),
  sortableAttributes: Schema.Array(Schema.NonEmptyString),
  searchableAttributes: Schema.Array(Schema.NonEmptyString),
  rankingRules: Schema.Array(Schema.NonEmptyString),
  synonyms: Schema.optional(SearchTenantIndexSynonymMapSchema),
});

export type SearchTenantIndexSettings = Schema.Schema.Type<
  typeof SearchTenantIndexSettingsSchema
>;

export const SearchTenantIndexReferenceSchema = Schema.Struct(
  SearchTenantIndexReferenceFields,
);

export type SearchTenantIndexReference = Schema.Schema.Type<
  typeof SearchTenantIndexReferenceSchema
>;

export const SearchTenantIndexDefinitionSchema = Schema.Struct({
  ...SearchTenantIndexReferenceFields,
  settings: SearchTenantIndexSettingsSchema,
});

export type SearchTenantIndexDefinition = Schema.Schema.Type<
  typeof SearchTenantIndexDefinitionSchema
>;

export const ReplaceSearchManagedFileDocumentsInputSchema = Schema.Struct({
  ...SearchTenantIndexReferenceFields,
  documents: SearchManagedFileDocumentListSchema,
});

export type ReplaceSearchManagedFileDocumentsInput = Schema.Schema.Type<
  typeof ReplaceSearchManagedFileDocumentsInputSchema
>;

export const ReplaceSearchTenantDocumentsInputSchema = Schema.Struct({
  ...SearchTenantIndexReferenceFields,
  documents: SearchTenantDocumentListSchema,
});

export type ReplaceSearchTenantDocumentsInput = Schema.Schema.Type<
  typeof ReplaceSearchTenantDocumentsInputSchema
>;

export const SearchManagedFilesInputSchema = Schema.Struct({
  ...SearchTenantIndexReferenceFields,
  query: Schema.String,
  limit: Schema.optional(SearchQueryLimitSchema),
});

export type SearchManagedFilesInput = Schema.Schema.Type<
  typeof SearchManagedFilesInputSchema
>;

export const SearchManagedFileQueryResultSchema = Schema.Struct({
  query: Schema.String,
  hits: SearchManagedFileDocumentListSchema,
  estimatedTotalHits: SearchDocumentCountSchema,
});

export type SearchManagedFileQueryResult = Schema.Schema.Type<
  typeof SearchManagedFileQueryResultSchema
>;

const SearchSupportCaseFilterStatusesSchema = Schema.Array(
  SupportOperationsCaseStatusSchema,
).pipe(Schema.filter((value) => value.length > 0));

export type SearchSupportCaseFilterStatuses = Schema.Schema.Type<
  typeof SearchSupportCaseFilterStatusesSchema
>;

const SearchSupportCaseFilterPrioritiesSchema = Schema.Array(
  SupportOperationsCasePrioritySchema,
).pipe(Schema.filter((value) => value.length > 0));

export type SearchSupportCaseFilterPriorities = Schema.Schema.Type<
  typeof SearchSupportCaseFilterPrioritiesSchema
>;

export const SearchSupportCaseSortSchema = Schema.Struct({
  field: SearchSupportCaseSortFieldSchema,
  direction: SearchSortDirectionSchema,
});

export type SearchSupportCaseSort = Schema.Schema.Type<
  typeof SearchSupportCaseSortSchema
>;

export const SearchSupportCasesInputSchema = Schema.Struct({
  ...SearchTenantIndexReferenceFields,
  query: Schema.String,
  limit: Schema.optional(SearchQueryLimitSchema),
  status: Schema.optional(SearchSupportCaseFilterStatusesSchema),
  priority: Schema.optional(SearchSupportCaseFilterPrioritiesSchema),
  sort: Schema.optional(SearchSupportCaseSortSchema),
});

export type SearchSupportCasesInput = Schema.Schema.Type<
  typeof SearchSupportCasesInputSchema
>;

export const SearchSupportCaseQueryResultSchema = Schema.Struct({
  query: Schema.String,
  hits: SearchSupportCaseDocumentListSchema,
  estimatedTotalHits: SearchDocumentCountSchema,
});

export type SearchSupportCaseQueryResult = Schema.Schema.Type<
  typeof SearchSupportCaseQueryResultSchema
>;

const SearchTenantIndexSummaryViewFields = {
  ...SearchTenantIndexReferenceFields,
  documentCount: SearchDocumentCountSchema,
  lifecycleState: SearchIndexLifecycleStateSchema,
  lastSyncedAt: Schema.optional(IsoTimestampSchema),
};

export const EnsureSearchTenantIndexInputSchema = Schema.Struct({
  ...SearchTenantIndexTargetFields,
  settings: SearchTenantIndexSettingsSchema,
  documents: Schema.optional(SearchTenantDocumentListSchema),
});

export type EnsureSearchTenantIndexInput = Schema.Schema.Type<
  typeof EnsureSearchTenantIndexInputSchema
>;

export const GetSearchTenantIndexInputSchema = Schema.Struct({
  ...SearchTenantIndexTargetFields,
});

export type GetSearchTenantIndexInput = Schema.Schema.Type<
  typeof GetSearchTenantIndexInputSchema
>;

export const DeleteSearchTenantIndexInputSchema = Schema.Struct({
  ...SearchTenantIndexTargetFields,
});

export type DeleteSearchTenantIndexInput = Schema.Schema.Type<
  typeof DeleteSearchTenantIndexInputSchema
>;

export const SearchTenantIndexSummaryViewSchema = Schema.Struct(
  SearchTenantIndexSummaryViewFields,
);

export type SearchTenantIndexSummaryView = Schema.Schema.Type<
  typeof SearchTenantIndexSummaryViewSchema
>;

export const SearchTenantIndexRecordSchema = Schema.Struct({
  ...SearchTenantIndexSummaryViewFields,
  settings: Schema.optional(SearchTenantIndexSettingsSchema),
  lastError: Schema.optional(Schema.NonEmptyString),
  deletedAt: Schema.optional(IsoTimestampSchema),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type SearchTenantIndexRecord = Schema.Schema.Type<
  typeof SearchTenantIndexRecordSchema
>;

export const SearchTenantIndexRecordListSchema = Schema.Array(
  SearchTenantIndexRecordSchema,
);

export type SearchTenantIndexRecordList = Schema.Schema.Type<
  typeof SearchTenantIndexRecordListSchema
>;

export const SearchTenantIndexDeletionReceiptSchema = Schema.Struct({
  ...SearchTenantIndexReferenceFields,
  deleted: Schema.Boolean,
  deletedAt: IsoTimestampSchema,
});

export type SearchTenantIndexDeletionReceipt = Schema.Schema.Type<
  typeof SearchTenantIndexDeletionReceiptSchema
>;
