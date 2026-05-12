import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { searchFields } from "@comvestec/config";
import {
  IsoTimestampSchema,
  type ReplaceSearchManagedFileDocumentsInput,
  ReplaceSearchManagedFileDocumentsInputSchema,
  type ReplaceSearchTenantDocumentsInput,
  ReplaceSearchTenantDocumentsInputSchema,
  type SearchManagedFileQueryResult,
  SearchManagedFileQueryResultSchema,
  SearchManagedFileDocumentListSchema,
  type SearchManagedFilesInput,
  SearchManagedFilesInputSchema,
  searchDocumentFamily,
  type SearchSupportCaseQueryResult,
  SearchSupportCaseQueryResultSchema,
  SearchSupportCaseDocumentListSchema,
  type SearchSupportCasesInput,
  SearchSupportCasesInputSchema,
  type SearchTenantIndexDefinition,
  SearchTenantIndexDefinitionSchema,
  type SearchTenantIndexDeletionReceipt,
  SearchTenantIndexDeletionReceiptSchema,
  SearchDocumentCountSchema,
  type SearchTenantIndexReference,
  SearchTenantIndexReferenceSchema,
  type SearchTenantIndexSummaryView,
  SearchTenantIndexSummaryViewSchema,
  searchIndexLifecycleState,
} from "@comvestec/contracts";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const MeilisearchAdapterOptionsSchema = Schema.Struct({
  url: Schema.NonEmptyString,
  apiKey: Schema.NonEmptyString,
});

export type MeilisearchAdapterOptions = Schema.Schema.Type<
  typeof MeilisearchAdapterOptionsSchema
>;

const MeilisearchHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.meilisearch,
);

export type MeilisearchHealthcheck = Schema.Schema.Type<
  typeof MeilisearchHealthcheckSchema
>;

export type MeilisearchAdapterRequestError = {
  readonly _tag: "MeilisearchAdapterRequestError";
  readonly operation:
    | "ensureTenantIndex"
    | "getTenantIndex"
    | "deleteTenantIndex"
    | "replaceTenantDocuments"
    | "replaceManagedFileDocuments"
    | "queryManagedFiles"
    | "querySupportCases";
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

export type MeilisearchAdapterError =
  | ParseResult.ParseError
  | MeilisearchAdapterRequestError;

export type MeilisearchAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.meilisearch;
  readonly url: string;
  readonly healthcheck: Effect.Effect<MeilisearchHealthcheck>;
  readonly ensureTenantIndex: (
    input: SearchTenantIndexDefinition,
  ) => Effect.Effect<SearchTenantIndexSummaryView, MeilisearchAdapterError>;
  readonly getTenantIndex: (
    input: SearchTenantIndexReference,
  ) => Effect.Effect<
    SearchTenantIndexSummaryView | undefined,
    MeilisearchAdapterError
  >;
  readonly deleteTenantIndex: (
    input: SearchTenantIndexReference,
  ) => Effect.Effect<SearchTenantIndexDeletionReceipt, MeilisearchAdapterError>;
  readonly replaceTenantDocuments: (
    input: ReplaceSearchTenantDocumentsInput,
  ) => Effect.Effect<SearchTenantIndexSummaryView, MeilisearchAdapterError>;
  readonly replaceManagedFileDocuments: (
    input: ReplaceSearchManagedFileDocumentsInput,
  ) => Effect.Effect<SearchTenantIndexSummaryView, MeilisearchAdapterError>;
  readonly queryManagedFiles: (
    input: SearchManagedFilesInput,
  ) => Effect.Effect<SearchManagedFileQueryResult, MeilisearchAdapterError>;
  readonly querySupportCases: (
    input: SearchSupportCasesInput,
  ) => Effect.Effect<SearchSupportCaseQueryResult, MeilisearchAdapterError>;
};

export class MeilisearchAdapter extends Context.Tag("MeilisearchAdapter")<
  MeilisearchAdapter,
  MeilisearchAdapterService
>() {}

const SearchIndexStatsResponseSchema = Schema.Struct({
  numberOfDocuments: SearchDocumentCountSchema,
});

const MeilisearchTaskEnvelopeSchema = Schema.Struct({
  taskUid: SearchDocumentCountSchema,
});

const MeilisearchTaskStatusSchema = Schema.Literal(
  "enqueued",
  "processing",
  "succeeded",
  "failed",
  "canceled",
);

const MeilisearchTaskErrorSchema = Schema.Struct({
  message: Schema.NonEmptyString,
  code: Schema.optional(Schema.NullOr(Schema.NonEmptyString)),
  type: Schema.optional(Schema.NullOr(Schema.NonEmptyString)),
  link: Schema.optional(Schema.NullOr(Schema.NonEmptyString)),
});

const MeilisearchTaskResponseSchema = Schema.Struct({
  uid: SearchDocumentCountSchema,
  status: MeilisearchTaskStatusSchema,
  finishedAt: Schema.optional(Schema.NullOr(IsoTimestampSchema)),
  error: Schema.optional(Schema.NullOr(MeilisearchTaskErrorSchema)),
});

const decodeSearchTenantIndexDefinition = Schema.decodeUnknown(
  SearchTenantIndexDefinitionSchema,
);

const decodeReplaceSearchManagedFileDocumentsInput = Schema.decodeUnknown(
  ReplaceSearchManagedFileDocumentsInputSchema,
);

const decodeReplaceSearchTenantDocumentsInput = Schema.decodeUnknown(
  ReplaceSearchTenantDocumentsInputSchema,
);

const decodeSearchManagedFilesInput = Schema.decodeUnknown(
  SearchManagedFilesInputSchema,
);

const decodeSearchSupportCasesInput = Schema.decodeUnknown(
  SearchSupportCasesInputSchema,
);

const decodeSearchTenantIndexReference = Schema.decodeUnknown(
  SearchTenantIndexReferenceSchema,
);

const decodeSearchTenantIndexSummaryView = Schema.decodeUnknown(
  SearchTenantIndexSummaryViewSchema,
);

const decodeSearchManagedFileQueryResult = Schema.decodeUnknown(
  SearchManagedFileQueryResultSchema,
);

const decodeSearchSupportCaseQueryResult = Schema.decodeUnknown(
  SearchSupportCaseQueryResultSchema,
);

const decodeSearchTenantIndexDeletionReceipt = Schema.decodeUnknown(
  SearchTenantIndexDeletionReceiptSchema,
);

const decodeMeilisearchTaskEnvelope = Schema.decodeUnknown(
  MeilisearchTaskEnvelopeSchema,
);

const decodeMeilisearchTaskResponse = Schema.decodeUnknown(
  MeilisearchTaskResponseSchema,
);

const decodeSearchIndexStatsResponse = Schema.decodeUnknown(
  SearchIndexStatsResponseSchema,
);

const MeilisearchSearchManagedFilesResponseSchema = Schema.Struct({
  hits: SearchManagedFileDocumentListSchema,
  estimatedTotalHits: Schema.optional(SearchDocumentCountSchema),
  totalHits: Schema.optional(SearchDocumentCountSchema),
});

const decodeMeilisearchSearchManagedFilesResponse = Schema.decodeUnknown(
  MeilisearchSearchManagedFilesResponseSchema,
);

const MeilisearchSearchSupportCasesResponseSchema = Schema.Struct({
  hits: SearchSupportCaseDocumentListSchema,
  estimatedTotalHits: Schema.optional(SearchDocumentCountSchema),
  totalHits: Schema.optional(SearchDocumentCountSchema),
});

const decodeMeilisearchSearchSupportCasesResponse = Schema.decodeUnknown(
  MeilisearchSearchSupportCasesResponseSchema,
);

type MeilisearchAdapterDependencies = {
  readonly fetch?: typeof fetch;
};

const meilisearchTaskPollIntervalMs = 100;
const meilisearchTaskPollMaxAttempts = 200;

const managedFileSearchAttributes = [
  "fileId",
  "fileName",
  "contentType",
  "sizeBytes",
  "deletedAt",
] as const;

const supportCaseSearchAttributes = [
  "caseId",
  "supportAgent",
  "tenantScope",
  "tenantScopeId",
  "summary",
  "status",
  "priority",
  "startedAt",
  "lastUpdatedAt",
] as const;

const buildMeilisearchAdapterRequestError = (
  operation: MeilisearchAdapterRequestError["operation"],
  cause: unknown,
  status?: number,
  body?: string,
): MeilisearchAdapterRequestError =>
  ({
    _tag: "MeilisearchAdapterRequestError",
    operation,
    cause,
    ...(status !== undefined ? { status } : {}),
    ...(body !== undefined ? { body } : {}),
  }) satisfies MeilisearchAdapterRequestError;

const buildMeilisearchUrl = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/$/, "")}${path}`;

const buildDocumentFamilyFilter = (documentFamily: string) =>
  `documentFamily = "${documentFamily}"`;

const buildOrFilter = (field: string, values: readonly string[]) =>
  `(${values.map((value) => `${field} = "${value}"`).join(" OR ")})`;

const buildSupportCaseFilter = (input: SearchSupportCasesInput) => {
  const clauses = [
    buildDocumentFamilyFilter(searchDocumentFamily.supportCaseSummary),
  ];

  if (input.status !== undefined) {
    clauses.push(buildOrFilter("status", input.status));
  }

  if (input.priority !== undefined) {
    clauses.push(buildOrFilter("priority", input.priority));
  }

  return clauses.join(" AND ");
};

const buildSupportCaseSort = (input: SearchSupportCasesInput) =>
  input.sort === undefined
    ? undefined
    : [`${input.sort.field}:${input.sort.direction}`];

const toMeilisearchIndexUid = (indexName: string) =>
  indexName
    .split(":")
    .map((segment) => segment.replace(/[^A-Za-z0-9_-]/g, "_"))
    .join("__");

const createRequestHeaders = (
  apiKey: string,
  hasBody = false,
): HeadersInit => ({
  Accept: "application/json",
  Authorization: `Bearer ${apiKey}`,
  ...(hasBody ? { "Content-Type": "application/json" } : {}),
});

const createRequestInit = (
  apiKey: string,
  method: string,
  body?: unknown,
): RequestInit => ({
  method,
  headers: createRequestHeaders(apiKey, body !== undefined),
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

const parseJsonText = <A>(input: {
  readonly operation: MeilisearchAdapterRequestError["operation"];
  readonly text: string;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError>;
}) =>
  Effect.try({
    try: () => JSON.parse(input.text),
    catch: (cause): MeilisearchAdapterRequestError =>
      buildMeilisearchAdapterRequestError(input.operation, cause),
  }).pipe(Effect.flatMap((payload) => input.decode(payload)));

const requestMeilisearch = (input: {
  readonly fetchImplementation: typeof fetch;
  readonly url: string;
  readonly apiKey: string;
  readonly operation: MeilisearchAdapterRequestError["operation"];
  readonly path: string;
  readonly method: string;
  readonly body?: unknown;
}) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        input.fetchImplementation(
          buildMeilisearchUrl(input.url, input.path),
          createRequestInit(input.apiKey, input.method, input.body),
        ),
      catch: (cause) =>
        buildMeilisearchAdapterRequestError(input.operation, cause),
    });
    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) =>
        buildMeilisearchAdapterRequestError(input.operation, cause),
    });

    return {
      response,
      text,
    } as const;
  });

const waitForTaskPollInterval = (
  operation: MeilisearchAdapterRequestError["operation"],
) =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, meilisearchTaskPollIntervalMs);
      }),
    catch: (cause) => buildMeilisearchAdapterRequestError(operation, cause),
  });

const readTaskErrorMessage = (
  task: Schema.Schema.Type<typeof MeilisearchTaskResponseSchema>,
) => {
  if (task.error?.message !== undefined) {
    return task.error.message;
  }

  return `Meilisearch task ${task.uid} completed with status ${task.status}.`;
};

const readMeilisearchTask = (input: {
  readonly fetchImplementation: typeof fetch;
  readonly url: string;
  readonly apiKey: string;
  readonly operation: MeilisearchAdapterRequestError["operation"];
  readonly taskUid: number;
}) =>
  requestMeilisearch({
    fetchImplementation: input.fetchImplementation,
    url: input.url,
    apiKey: input.apiKey,
    operation: input.operation,
    method: "GET",
    path: `/tasks/${input.taskUid}`,
  }).pipe(
    Effect.flatMap(({ response, text }) => {
      if (!response.ok) {
        return Effect.fail(
          buildMeilisearchAdapterRequestError(
            input.operation,
            new Error(
              text || `Meilisearch request failed with ${response.status}.`,
            ),
            response.status,
            text,
          ),
        );
      }

      return parseJsonText({
        operation: input.operation,
        text,
        decode: decodeMeilisearchTaskResponse,
      });
    }),
  );

const replaceTenantDocumentsInIndex = (input: {
  readonly fetchImplementation: typeof fetch;
  readonly url: string;
  readonly apiKey: string;
  readonly operation: "replaceManagedFileDocuments" | "replaceTenantDocuments";
  readonly request: {
    readonly indexName: string;
    readonly scope: SearchTenantIndexReference["scope"];
    readonly scopeId: string;
    readonly documents: readonly unknown[];
  };
}) =>
  Effect.gen(function* () {
    const indexUid = toMeilisearchIndexUid(input.request.indexName);
    const clearDocuments = yield* requestMeilisearch({
      fetchImplementation: input.fetchImplementation,
      url: input.url,
      apiKey: input.apiKey,
      operation: input.operation,
      method: "DELETE",
      path: `/indexes/${encodeURIComponent(indexUid)}/documents`,
    });

    if (!clearDocuments.response.ok) {
      return yield* Effect.fail(
        buildMeilisearchAdapterRequestError(
          input.operation,
          new Error(
            clearDocuments.text ||
              `Meilisearch request failed with ${clearDocuments.response.status}.`,
          ),
          clearDocuments.response.status,
          clearDocuments.text,
        ),
      );
    }

    const clearDocumentsTaskUid = yield* readTaskUid({
      operation: input.operation,
      text: clearDocuments.text,
    });

    const completedClearDocumentsTask = yield* waitForMeilisearchTaskCompletion(
      {
        fetchImplementation: input.fetchImplementation,
        url: input.url,
        apiKey: input.apiKey,
        operation: input.operation,
        taskUid: clearDocumentsTaskUid,
      },
    );

    const completedDocumentTask =
      input.request.documents.length === 0
        ? completedClearDocumentsTask
        : yield* requestMeilisearch({
            fetchImplementation: input.fetchImplementation,
            url: input.url,
            apiKey: input.apiKey,
            operation: input.operation,
            method: "POST",
            path: `/indexes/${encodeURIComponent(indexUid)}/documents`,
            body: input.request.documents,
          }).pipe(
            Effect.flatMap((responseEnvelope) => {
              if (!responseEnvelope.response.ok) {
                return Effect.fail(
                  buildMeilisearchAdapterRequestError(
                    input.operation,
                    new Error(
                      responseEnvelope.text ||
                        `Meilisearch request failed with ${responseEnvelope.response.status}.`,
                    ),
                    responseEnvelope.response.status,
                    responseEnvelope.text,
                  ),
                );
              }

              return readTaskUid({
                operation: input.operation,
                text: responseEnvelope.text,
              }).pipe(
                Effect.flatMap((taskUid) =>
                  waitForMeilisearchTaskCompletion({
                    fetchImplementation: input.fetchImplementation,
                    url: input.url,
                    apiKey: input.apiKey,
                    operation: input.operation,
                    taskUid,
                  }),
                ),
              );
            }),
          );

    const stats = yield* readTenantIndexStats({
      fetchImplementation: input.fetchImplementation,
      url: input.url,
      apiKey: input.apiKey,
      operation: input.operation,
      indexName: input.request.indexName,
    });

    const lastSyncedAt =
      completedDocumentTask.finishedAt ??
      completedClearDocumentsTask.finishedAt ??
      undefined;

    return yield* decodeSearchTenantIndexSummaryView({
      indexName: input.request.indexName,
      scope: input.request.scope,
      scopeId: input.request.scopeId,
      documentCount: stats?.numberOfDocuments ?? 0,
      lifecycleState: searchIndexLifecycleState.ready,
      ...(lastSyncedAt !== undefined ? { lastSyncedAt } : {}),
    });
  });

const waitForMeilisearchTaskCompletion = (input: {
  readonly fetchImplementation: typeof fetch;
  readonly url: string;
  readonly apiKey: string;
  readonly operation: MeilisearchAdapterRequestError["operation"];
  readonly taskUid: number;
  readonly attempt?: number;
}): Effect.Effect<
  Schema.Schema.Type<typeof MeilisearchTaskResponseSchema>,
  MeilisearchAdapterError
> =>
  readMeilisearchTask(input).pipe(
    Effect.flatMap((task) => {
      switch (task.status) {
        case "succeeded":
          return Effect.succeed(task);
        case "failed":
        case "canceled":
          return Effect.fail(
            buildMeilisearchAdapterRequestError(
              input.operation,
              new Error(readTaskErrorMessage(task)),
              undefined,
              JSON.stringify(task),
            ),
          );
        case "enqueued":
        case "processing": {
          const attempt = input.attempt ?? 0;

          if (attempt >= meilisearchTaskPollMaxAttempts) {
            return Effect.fail(
              buildMeilisearchAdapterRequestError(
                input.operation,
                new Error(
                  `Meilisearch task ${input.taskUid} did not complete within ${meilisearchTaskPollMaxAttempts} polling attempts.`,
                ),
                undefined,
                JSON.stringify(task),
              ),
            );
          }

          return waitForTaskPollInterval(input.operation).pipe(
            Effect.flatMap(() =>
              waitForMeilisearchTaskCompletion({
                ...input,
                attempt: attempt + 1,
              }),
            ),
          );
        }
      }
    }),
  );

const readTaskUid = (input: {
  readonly operation: MeilisearchAdapterRequestError["operation"];
  readonly text: string;
}) =>
  parseJsonText({
    operation: input.operation,
    text: input.text,
    decode: decodeMeilisearchTaskEnvelope,
  }).pipe(Effect.map((task) => task.taskUid));

const readTenantIndexStats = (input: {
  readonly fetchImplementation: typeof fetch;
  readonly url: string;
  readonly apiKey: string;
  readonly operation: MeilisearchAdapterRequestError["operation"];
  readonly indexName: string;
}) =>
  requestMeilisearch({
    fetchImplementation: input.fetchImplementation,
    url: input.url,
    apiKey: input.apiKey,
    operation: input.operation,
    method: "GET",
    path: `/indexes/${encodeURIComponent(toMeilisearchIndexUid(input.indexName))}/stats`,
  }).pipe(
    Effect.flatMap(({ response, text }) => {
      if (response.status === 404) {
        return Effect.succeed(undefined);
      }

      if (!response.ok) {
        return Effect.fail(
          buildMeilisearchAdapterRequestError(
            input.operation,
            new Error(
              text || `Meilisearch request failed with ${response.status}.`,
            ),
            response.status,
            text,
          ),
        );
      }

      return parseJsonText({
        operation: input.operation,
        text,
        decode: decodeSearchIndexStatsResponse,
      });
    }),
  );

export const makeMeilisearchAdapter = (
  input: MeilisearchAdapterOptions,
  dependencies?: MeilisearchAdapterDependencies,
) =>
  Schema.decodeUnknown(MeilisearchAdapterOptionsSchema)(input).pipe(
    Effect.map((options): MeilisearchAdapterService => {
      const fetchImplementation = dependencies?.fetch ?? fetch;

      return {
        serviceName: platformAdapterServiceName.meilisearch,
        url: options.url,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.meilisearch,
        }),
        ensureTenantIndex: (input) =>
          decodeSearchTenantIndexDefinition(input).pipe(
            Effect.flatMap((request) =>
              Effect.gen(function* () {
                const indexUid = toMeilisearchIndexUid(request.indexName);
                const createIndex = yield* requestMeilisearch({
                  fetchImplementation,
                  url: options.url,
                  apiKey: options.apiKey,
                  operation: "ensureTenantIndex",
                  method: "POST",
                  path: "/indexes",
                  body: {
                    uid: indexUid,
                    primaryKey: searchFields.documentId,
                  },
                });

                const createIndexBody = createIndex.text.toLowerCase();

                if (
                  !createIndex.response.ok &&
                  createIndex.response.status !== 409 &&
                  !createIndexBody.includes("already exists") &&
                  !createIndexBody.includes("index_already_exists")
                ) {
                  return yield* Effect.fail(
                    buildMeilisearchAdapterRequestError(
                      "ensureTenantIndex",
                      new Error(
                        createIndex.text ||
                          `Meilisearch request failed with ${createIndex.response.status}.`,
                      ),
                      createIndex.response.status,
                      createIndex.text,
                    ),
                  );
                }

                if (createIndex.response.ok) {
                  const createTaskUid = yield* readTaskUid({
                    operation: "ensureTenantIndex",
                    text: createIndex.text,
                  });

                  yield* waitForMeilisearchTaskCompletion({
                    fetchImplementation,
                    url: options.url,
                    apiKey: options.apiKey,
                    operation: "ensureTenantIndex",
                    taskUid: createTaskUid,
                  });
                }

                const updateSettings = yield* requestMeilisearch({
                  fetchImplementation,
                  url: options.url,
                  apiKey: options.apiKey,
                  operation: "ensureTenantIndex",
                  method: "PATCH",
                  path: `/indexes/${encodeURIComponent(indexUid)}/settings`,
                  body: {
                    filterableAttributes: request.settings.filterableAttributes,
                    sortableAttributes: request.settings.sortableAttributes,
                    searchableAttributes: request.settings.searchableAttributes,
                    rankingRules: request.settings.rankingRules,
                    synonyms: request.settings.synonyms ?? {},
                  },
                });

                if (!updateSettings.response.ok) {
                  return yield* Effect.fail(
                    buildMeilisearchAdapterRequestError(
                      "ensureTenantIndex",
                      new Error(
                        updateSettings.text ||
                          `Meilisearch request failed with ${updateSettings.response.status}.`,
                      ),
                      updateSettings.response.status,
                      updateSettings.text,
                    ),
                  );
                }

                const updateSettingsTaskUid = yield* readTaskUid({
                  operation: "ensureTenantIndex",
                  text: updateSettings.text,
                });

                const completedSettingsTask =
                  yield* waitForMeilisearchTaskCompletion({
                    fetchImplementation,
                    url: options.url,
                    apiKey: options.apiKey,
                    operation: "ensureTenantIndex",
                    taskUid: updateSettingsTaskUid,
                  });

                const stats = yield* readTenantIndexStats({
                  fetchImplementation,
                  url: options.url,
                  apiKey: options.apiKey,
                  operation: "ensureTenantIndex",
                  indexName: request.indexName,
                });

                if (stats === undefined) {
                  return yield* Effect.fail(
                    buildMeilisearchAdapterRequestError(
                      "ensureTenantIndex",
                      new Error(
                        "Meilisearch index stats were not found after index creation.",
                      ),
                    ),
                  );
                }

                const lastSyncedAt =
                  completedSettingsTask.finishedAt ?? undefined;

                return yield* decodeSearchTenantIndexSummaryView({
                  indexName: request.indexName,
                  scope: request.scope,
                  scopeId: request.scopeId,
                  documentCount: stats.numberOfDocuments,
                  lifecycleState: searchIndexLifecycleState.ready,
                  ...(lastSyncedAt !== undefined ? { lastSyncedAt } : {}),
                });
              }),
            ),
          ),
        getTenantIndex: (input) =>
          decodeSearchTenantIndexReference(input).pipe(
            Effect.flatMap((request) =>
              readTenantIndexStats({
                fetchImplementation,
                url: options.url,
                apiKey: options.apiKey,
                operation: "getTenantIndex",
                indexName: request.indexName,
              }).pipe(
                Effect.flatMap((stats) =>
                  stats === undefined
                    ? Effect.succeed(undefined)
                    : decodeSearchTenantIndexSummaryView({
                        indexName: request.indexName,
                        scope: request.scope,
                        scopeId: request.scopeId,
                        documentCount: stats.numberOfDocuments,
                        lifecycleState: searchIndexLifecycleState.ready,
                      }),
                ),
              ),
            ),
          ),
        replaceTenantDocuments: (input) =>
          decodeReplaceSearchTenantDocumentsInput(input).pipe(
            Effect.flatMap((request) =>
              replaceTenantDocumentsInIndex({
                fetchImplementation,
                url: options.url,
                apiKey: options.apiKey,
                operation: "replaceTenantDocuments",
                request,
              }),
            ),
          ),
        replaceManagedFileDocuments: (input) =>
          decodeReplaceSearchManagedFileDocumentsInput(input).pipe(
            Effect.flatMap((request) =>
              replaceTenantDocumentsInIndex({
                fetchImplementation,
                url: options.url,
                apiKey: options.apiKey,
                operation: "replaceManagedFileDocuments",
                request: {
                  ...request,
                  documents: request.documents.map((document) => ({
                    ...document,
                    documentId: [
                      searchDocumentFamily.managedFileSummary,
                      document.fileId,
                    ].join("__"),
                    documentFamily: searchDocumentFamily.managedFileSummary,
                  })),
                },
              }),
            ),
          ),
        queryManagedFiles: (input) =>
          decodeSearchManagedFilesInput(input).pipe(
            Effect.flatMap((request) =>
              Effect.gen(function* () {
                const indexUid = toMeilisearchIndexUid(request.indexName);
                const { response, text } = yield* requestMeilisearch({
                  fetchImplementation,
                  url: options.url,
                  apiKey: options.apiKey,
                  operation: "queryManagedFiles",
                  method: "POST",
                  path: `/indexes/${encodeURIComponent(indexUid)}/search`,
                  body: {
                    q: request.query,
                    filter: buildDocumentFamilyFilter(
                      searchDocumentFamily.managedFileSummary,
                    ),
                    attributesToRetrieve: managedFileSearchAttributes,
                    ...(request.limit !== undefined
                      ? { limit: request.limit }
                      : {}),
                  },
                });

                if (response.status === 404) {
                  return yield* decodeSearchManagedFileQueryResult({
                    query: request.query,
                    hits: [],
                    estimatedTotalHits: 0,
                  });
                }

                if (!response.ok) {
                  return yield* Effect.fail(
                    buildMeilisearchAdapterRequestError(
                      "queryManagedFiles",
                      new Error(
                        text ||
                          `Meilisearch request failed with ${response.status}.`,
                      ),
                      response.status,
                      text,
                    ),
                  );
                }

                const result = yield* parseJsonText({
                  operation: "queryManagedFiles",
                  text,
                  decode: decodeMeilisearchSearchManagedFilesResponse,
                });

                return yield* decodeSearchManagedFileQueryResult({
                  query: request.query,
                  hits: result.hits,
                  estimatedTotalHits:
                    result.estimatedTotalHits ??
                    result.totalHits ??
                    result.hits.length,
                });
              }),
            ),
          ),
        querySupportCases: (input) =>
          decodeSearchSupportCasesInput(input).pipe(
            Effect.flatMap((request) =>
              Effect.gen(function* () {
                const indexUid = toMeilisearchIndexUid(request.indexName);
                const { response, text } = yield* requestMeilisearch({
                  fetchImplementation,
                  url: options.url,
                  apiKey: options.apiKey,
                  operation: "querySupportCases",
                  method: "POST",
                  path: `/indexes/${encodeURIComponent(indexUid)}/search`,
                  body: {
                    q: request.query,
                    filter: buildSupportCaseFilter(request),
                    attributesToRetrieve: supportCaseSearchAttributes,
                    ...(request.limit !== undefined
                      ? { limit: request.limit }
                      : {}),
                    ...(buildSupportCaseSort(request) !== undefined
                      ? { sort: buildSupportCaseSort(request) }
                      : {}),
                  },
                });

                if (response.status === 404) {
                  return yield* decodeSearchSupportCaseQueryResult({
                    query: request.query,
                    hits: [],
                    estimatedTotalHits: 0,
                  });
                }

                if (!response.ok) {
                  return yield* Effect.fail(
                    buildMeilisearchAdapterRequestError(
                      "querySupportCases",
                      new Error(
                        text ||
                          `Meilisearch request failed with ${response.status}.`,
                      ),
                      response.status,
                      text,
                    ),
                  );
                }

                const result = yield* parseJsonText({
                  operation: "querySupportCases",
                  text,
                  decode: decodeMeilisearchSearchSupportCasesResponse,
                });

                return yield* decodeSearchSupportCaseQueryResult({
                  query: request.query,
                  hits: result.hits,
                  estimatedTotalHits:
                    result.estimatedTotalHits ??
                    result.totalHits ??
                    result.hits.length,
                });
              }),
            ),
          ),
        deleteTenantIndex: (input) =>
          decodeSearchTenantIndexReference(input).pipe(
            Effect.flatMap((request) =>
              Effect.gen(function* () {
                const indexUid = toMeilisearchIndexUid(request.indexName);

                return yield* requestMeilisearch({
                  fetchImplementation,
                  url: options.url,
                  apiKey: options.apiKey,
                  operation: "deleteTenantIndex",
                  method: "DELETE",
                  path: `/indexes/${encodeURIComponent(indexUid)}`,
                }).pipe(
                  Effect.flatMap(
                    ({
                      response,
                      text,
                    }): Effect.Effect<
                      SearchTenantIndexDeletionReceipt,
                      MeilisearchAdapterError
                    > =>
                      Effect.gen(function* () {
                        if (response.status !== 404 && !response.ok) {
                          return yield* Effect.fail(
                            buildMeilisearchAdapterRequestError(
                              "deleteTenantIndex",
                              new Error(
                                text ||
                                  `Meilisearch request failed with ${response.status}.`,
                              ),
                              response.status,
                              text,
                            ),
                          );
                        }

                        if (response.status === 404) {
                          return yield* decodeSearchTenantIndexDeletionReceipt({
                            indexName: request.indexName,
                            scope: request.scope,
                            scopeId: request.scopeId,
                            deleted: false,
                            deletedAt: new Date().toISOString(),
                          }).pipe(
                            Effect.mapError(
                              (error): MeilisearchAdapterError => error,
                            ),
                          );
                        }

                        const deleteTaskUid = yield* readTaskUid({
                          operation: "deleteTenantIndex",
                          text,
                        });

                        const completedDeleteTask =
                          yield* waitForMeilisearchTaskCompletion({
                            fetchImplementation,
                            url: options.url,
                            apiKey: options.apiKey,
                            operation: "deleteTenantIndex",
                            taskUid: deleteTaskUid,
                          });

                        return yield* decodeSearchTenantIndexDeletionReceipt({
                          indexName: request.indexName,
                          scope: request.scope,
                          scopeId: request.scopeId,
                          deleted: true,
                          deletedAt:
                            completedDeleteTask.finishedAt ??
                            new Date().toISOString(),
                        }).pipe(
                          Effect.mapError(
                            (error): MeilisearchAdapterError => error,
                          ),
                        );
                      }),
                  ),
                );
              }),
            ),
          ),
      } satisfies MeilisearchAdapterService;
    }),
  );

export const makeMeilisearchAdapterLayer = (
  options: MeilisearchAdapterOptions,
) => Layer.effect(MeilisearchAdapter, makeMeilisearchAdapter(options));
