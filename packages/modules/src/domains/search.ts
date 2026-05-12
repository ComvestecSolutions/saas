import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type DeleteSearchTenantIndexInput,
  DeleteSearchTenantIndexInputSchema,
  type EnsureSearchTenantIndexInput,
  EnsureSearchTenantIndexInputSchema,
  type GetSearchTenantIndexInput,
  GetSearchTenantIndexInputSchema,
  platformModuleId,
  type SearchManagedFileQueryResult,
  type SearchManagedFilesInput,
  SearchManagedFilesInputSchema,
  type ReplaceSearchTenantDocumentsInput,
  type SearchSupportCaseQueryResult,
  type SearchSupportCasesInput,
  SearchSupportCasesInputSchema,
  searchIndexLifecycleState,
  type SearchTenantIndexDeletionReceipt,
  type SearchTenantIndexRecord,
  type SearchTenantIndexSummaryView,
} from "@comvestec/contracts";
import {
  MeilisearchAdapter,
  type MeilisearchAdapterError,
} from "@comvestec/platform";
import {
  type SearchTenantIndexPostgresRepositoryError,
  SearchTenantIndexPostgresRepository,
} from "../persistence";

export type SearchModuleError =
  | ParseResult.ParseError
  | MeilisearchAdapterError
  | SearchTenantIndexPostgresRepositoryError;

export type SearchModuleService = {
  readonly ensureTenantIndex: (
    input: EnsureSearchTenantIndexInput,
  ) => Effect.Effect<SearchTenantIndexSummaryView, SearchModuleError>;
  readonly queryManagedFiles: (
    input: SearchManagedFilesInput,
  ) => Effect.Effect<SearchManagedFileQueryResult, SearchModuleError>;
  readonly querySupportCases: (
    input: SearchSupportCasesInput,
  ) => Effect.Effect<SearchSupportCaseQueryResult, SearchModuleError>;
  readonly getTenantIndex: (
    input: GetSearchTenantIndexInput,
  ) => Effect.Effect<
    SearchTenantIndexSummaryView | undefined,
    SearchModuleError
  >;
  readonly deleteTenantIndex: (
    input: DeleteSearchTenantIndexInput,
  ) => Effect.Effect<SearchTenantIndexDeletionReceipt, SearchModuleError>;
};

export class SearchModule extends Context.Tag("SearchModule")<
  SearchModule,
  SearchModuleService
>() {}

const buildTenantSearchIndexName = (target: {
  readonly scope: EnsureSearchTenantIndexInput["scope"];
  readonly scopeId: string;
}) => [platformModuleId.search, target.scope, target.scopeId].join(":");

const buildTenantSearchIndexReference = (target: {
  readonly scope: EnsureSearchTenantIndexInput["scope"];
  readonly scopeId: string;
}) => ({
  indexName: buildTenantSearchIndexName(target),
  scope: target.scope,
  scopeId: target.scopeId,
});

const buildSearchTenantIndexSummaryFromRecord = (
  record: SearchTenantIndexRecord,
): SearchTenantIndexSummaryView => ({
  indexName: record.indexName,
  scope: record.scope,
  scopeId: record.scopeId,
  documentCount: record.documentCount,
  lifecycleState: record.lifecycleState,
  ...(record.lastSyncedAt !== undefined
    ? { lastSyncedAt: record.lastSyncedAt }
    : {}),
});

const buildPersistedSearchTenantIndexRecord = (input: {
  readonly summary: SearchTenantIndexSummaryView;
  readonly existing?: SearchTenantIndexRecord;
  readonly now: string;
  readonly settings?: EnsureSearchTenantIndexInput["settings"];
}): SearchTenantIndexRecord => ({
  indexName: input.summary.indexName,
  scope: input.summary.scope,
  scopeId: input.summary.scopeId,
  documentCount: input.summary.documentCount,
  lifecycleState: input.summary.lifecycleState,
  ...(input.summary.lastSyncedAt !== undefined
    ? { lastSyncedAt: input.summary.lastSyncedAt }
    : {}),
  ...(input.settings !== undefined
    ? { settings: input.settings }
    : input.existing?.settings !== undefined
      ? { settings: input.existing.settings }
      : {}),
  createdAt: input.existing?.createdAt ?? input.now,
  updatedAt: input.now,
});

const readMeilisearchAdapterErrorMessage = (error: MeilisearchAdapterError) => {
  if (error._tag === "MeilisearchAdapterRequestError") {
    if (typeof error.body === "string" && error.body.length > 0) {
      try {
        const payload = JSON.parse(error.body) as {
          readonly error?: { readonly message?: unknown };
        };

        if (typeof payload.error?.message === "string") {
          return payload.error.message;
        }
      } catch {
        // Fall through to the raw body or cause message.
      }
    }

    if (error.cause instanceof Error && error.cause.message.length > 0) {
      return error.cause.message;
    }

    if (typeof error.cause === "string" && error.cause.length > 0) {
      return error.cause;
    }

    if (typeof error.body === "string" && error.body.length > 0) {
      return error.body;
    }
  }

  return "Search lifecycle request failed.";
};

const readMeilisearchTaskStatus = (
  error: MeilisearchAdapterError,
): "enqueued" | "processing" | undefined => {
  if (
    error._tag !== "MeilisearchAdapterRequestError" ||
    typeof error.body !== "string" ||
    error.body.length === 0
  ) {
    return undefined;
  }

  try {
    const payload = JSON.parse(error.body) as {
      readonly status?: unknown;
    };

    return payload.status === "enqueued" || payload.status === "processing"
      ? payload.status
      : undefined;
  } catch {
    return undefined;
  }
};

const buildFailedSearchTenantIndexRecord = (input: {
  readonly reference: ReturnType<typeof buildTenantSearchIndexReference>;
  readonly existing?: SearchTenantIndexRecord;
  readonly now: string;
  readonly settings?: EnsureSearchTenantIndexInput["settings"];
  readonly error: MeilisearchAdapterError;
}): SearchTenantIndexRecord => ({
  indexName: input.reference.indexName,
  scope: input.reference.scope,
  scopeId: input.reference.scopeId,
  documentCount: input.existing?.documentCount ?? 0,
  lifecycleState:
    readMeilisearchTaskStatus(input.error) !== undefined
      ? searchIndexLifecycleState.syncing
      : searchIndexLifecycleState.failed,
  ...(input.existing?.lastSyncedAt !== undefined
    ? { lastSyncedAt: input.existing.lastSyncedAt }
    : {}),
  ...(input.settings !== undefined
    ? { settings: input.settings }
    : input.existing?.settings !== undefined
      ? { settings: input.existing.settings }
      : {}),
  lastError: readMeilisearchAdapterErrorMessage(input.error),
  createdAt: input.existing?.createdAt ?? input.now,
  updatedAt: input.now,
});

const buildDeletedSearchTenantIndexRecord = (input: {
  readonly receipt: SearchTenantIndexDeletionReceipt;
  readonly existing?: SearchTenantIndexRecord;
}): SearchTenantIndexRecord => ({
  indexName: input.receipt.indexName,
  scope: input.receipt.scope,
  scopeId: input.receipt.scopeId,
  documentCount: 0,
  lifecycleState: searchIndexLifecycleState.deleted,
  ...(input.existing?.lastSyncedAt !== undefined
    ? { lastSyncedAt: input.existing.lastSyncedAt }
    : {}),
  ...(input.existing?.settings !== undefined
    ? { settings: input.existing.settings }
    : {}),
  deletedAt: input.receipt.deletedAt,
  createdAt: input.existing?.createdAt ?? input.receipt.deletedAt,
  updatedAt: input.receipt.deletedAt,
});

const buildDeleteFailureSearchTenantIndexRecord = (input: {
  readonly reference: ReturnType<typeof buildTenantSearchIndexReference>;
  readonly existing?: SearchTenantIndexRecord;
  readonly now: string;
  readonly error: MeilisearchAdapterError;
}): SearchTenantIndexRecord => {
  const lastError = readMeilisearchAdapterErrorMessage(input.error);

  if (
    input.existing?.lifecycleState === searchIndexLifecycleState.deleted &&
    input.existing.deletedAt !== undefined
  ) {
    return {
      ...input.existing,
      lastError,
      updatedAt: input.now,
    };
  }

  return {
    indexName: input.reference.indexName,
    scope: input.reference.scope,
    scopeId: input.reference.scopeId,
    documentCount: input.existing?.documentCount ?? 0,
    lifecycleState:
      readMeilisearchTaskStatus(input.error) !== undefined
        ? searchIndexLifecycleState.deleting
        : searchIndexLifecycleState.failed,
    ...(input.existing?.lastSyncedAt !== undefined
      ? { lastSyncedAt: input.existing.lastSyncedAt }
      : {}),
    ...(input.existing?.settings !== undefined
      ? { settings: input.existing.settings }
      : {}),
    lastError,
    createdAt: input.existing?.createdAt ?? input.now,
    updatedAt: input.now,
  };
};

export const makeSearchModule = () =>
  Effect.gen(function* () {
    const meilisearch = yield* MeilisearchAdapter;
    const searchTenantIndexes = yield* SearchTenantIndexPostgresRepository;

    return {
      ensureTenantIndex: (input: EnsureSearchTenantIndexInput) =>
        Schema.decodeUnknown(EnsureSearchTenantIndexInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const reference = buildTenantSearchIndexReference(request);
              const existing =
                yield* searchTenantIndexes.getSearchTenantIndexRecord(
                  reference,
                );
              const summary = yield* meilisearch
                .ensureTenantIndex({
                  ...reference,
                  settings: request.settings,
                })
                .pipe(
                  Effect.catchAll((error) =>
                    searchTenantIndexes
                      .upsertSearchTenantIndexRecord(
                        buildFailedSearchTenantIndexRecord({
                          reference,
                          now: new Date().toISOString(),
                          settings: request.settings,
                          error,
                          ...(existing !== undefined ? { existing } : {}),
                        }),
                      )
                      .pipe(Effect.flatMap(() => Effect.fail(error))),
                  ),
                );

              const ensuredRecord = buildPersistedSearchTenantIndexRecord({
                summary,
                now: new Date().toISOString(),
                settings: request.settings,
                ...(existing !== undefined ? { existing } : {}),
              });

              const syncedSummary =
                request.documents === undefined
                  ? summary
                  : yield* meilisearch
                      .replaceTenantDocuments({
                        ...reference,
                        documents: request.documents,
                      } satisfies ReplaceSearchTenantDocumentsInput)
                      .pipe(
                        Effect.catchAll((error) =>
                          searchTenantIndexes
                            .upsertSearchTenantIndexRecord(
                              buildFailedSearchTenantIndexRecord({
                                reference,
                                now: new Date().toISOString(),
                                settings: request.settings,
                                error,
                                existing: ensuredRecord,
                              }),
                            )
                            .pipe(Effect.flatMap(() => Effect.fail(error))),
                        ),
                      );

              yield* searchTenantIndexes.upsertSearchTenantIndexRecord(
                buildPersistedSearchTenantIndexRecord({
                  summary: syncedSummary,
                  now: new Date().toISOString(),
                  settings: request.settings,
                  existing: ensuredRecord,
                }),
              );

              return syncedSummary;
            }),
          ),
        ),
      queryManagedFiles: (input: SearchManagedFilesInput) =>
        Schema.decodeUnknown(SearchManagedFilesInputSchema)(input).pipe(
          Effect.flatMap((request) => meilisearch.queryManagedFiles(request)),
        ),
      querySupportCases: (input: SearchSupportCasesInput) =>
        Schema.decodeUnknown(SearchSupportCasesInputSchema)(input).pipe(
          Effect.flatMap((request) => meilisearch.querySupportCases(request)),
        ),
      getTenantIndex: (input: GetSearchTenantIndexInput) =>
        Schema.decodeUnknown(GetSearchTenantIndexInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const reference = buildTenantSearchIndexReference(request);
              const existing =
                yield* searchTenantIndexes.getSearchTenantIndexRecord(
                  reference,
                );
              const summary = yield* meilisearch.getTenantIndex(reference);

              if (summary === undefined) {
                if (
                  existing === undefined ||
                  existing.deletedAt !== undefined ||
                  existing.lifecycleState === searchIndexLifecycleState.deleted
                ) {
                  return undefined;
                }

                return buildSearchTenantIndexSummaryFromRecord(existing);
              }

              yield* searchTenantIndexes.upsertSearchTenantIndexRecord(
                buildPersistedSearchTenantIndexRecord({
                  summary,
                  now: new Date().toISOString(),
                  ...(existing !== undefined ? { existing } : {}),
                }),
              );

              return summary;
            }),
          ),
        ),
      deleteTenantIndex: (input: DeleteSearchTenantIndexInput) =>
        Schema.decodeUnknown(DeleteSearchTenantIndexInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const reference = buildTenantSearchIndexReference(request);
              const existing =
                yield* searchTenantIndexes.getSearchTenantIndexRecord(
                  reference,
                );
              const receipt = yield* meilisearch
                .deleteTenantIndex(reference)
                .pipe(
                  Effect.catchAll((error) =>
                    searchTenantIndexes
                      .upsertSearchTenantIndexRecord(
                        buildDeleteFailureSearchTenantIndexRecord({
                          reference,
                          now: new Date().toISOString(),
                          error,
                          ...(existing !== undefined ? { existing } : {}),
                        }),
                      )
                      .pipe(Effect.flatMap(() => Effect.fail(error))),
                  ),
                );

              yield* searchTenantIndexes.upsertSearchTenantIndexRecord(
                buildDeletedSearchTenantIndexRecord({
                  receipt,
                  ...(existing !== undefined ? { existing } : {}),
                }),
              );

              return receipt;
            }),
          ),
        ),
    } satisfies SearchModuleService;
  });

export const SearchModuleLive = Layer.effect(SearchModule, makeSearchModule());
