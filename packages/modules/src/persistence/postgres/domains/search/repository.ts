import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  SearchTenantScopeSchema,
  type SearchTenantIndexRecord,
  SearchTenantIndexRecordListSchema,
  SearchTenantIndexRecordSchema,
  type SearchTenantIndexReference,
  SearchTenantIndexReferenceSchema,
} from "@comvestec/contracts";
import { searchTenantIndexesTable } from "./schema";

const SearchTenantIndexScopeLookupSchema = Schema.Struct({
  scope: SearchTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
});

type SearchTenantIndexRow = typeof searchTenantIndexesTable.$inferSelect;

export type SearchTenantIndexPostgresQueryable = {
  readonly upsertSearchTenantIndex: (
    record: typeof searchTenantIndexesTable.$inferInsert,
  ) => Promise<SearchTenantIndexRow>;
  readonly getSearchTenantIndex: (
    scope: SearchTenantIndexReference["scope"],
    scopeId: string,
    indexName: string,
  ) => Promise<SearchTenantIndexRow | undefined>;
  readonly listSearchTenantIndexesByScope: (
    scope: SearchTenantIndexReference["scope"],
    scopeId: string,
  ) => Promise<readonly SearchTenantIndexRow[]>;
};

export type SearchTenantIndexPostgresRepositoryQueryError = {
  readonly _tag: "SearchTenantIndexPostgresRepositoryQueryError";
  readonly operation:
    | "upsertSearchTenantIndexRecord"
    | "getSearchTenantIndexRecord"
    | "listSearchTenantIndexRecords";
  readonly cause: unknown;
};

export type SearchTenantIndexPostgresRepositoryError =
  | ParseResult.ParseError
  | SearchTenantIndexPostgresRepositoryQueryError;

const parseTimestamp = (value: string | undefined) =>
  value === undefined ? null : new Date(value);

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const buildSearchTenantIndexRecord = (row: SearchTenantIndexRow) =>
  Schema.decodeUnknown(SearchTenantIndexRecordSchema)({
    indexName: row.indexName,
    scope: row.scope,
    scopeId: row.scopeId,
    documentCount: row.documentCount,
    lifecycleState: row.lifecycleState,
    ...(toIsoString(row.lastSyncedAt) !== undefined
      ? { lastSyncedAt: toIsoString(row.lastSyncedAt) }
      : {}),
    ...(row.settings != null ? { settings: row.settings } : {}),
    ...(row.lastError != null ? { lastError: row.lastError } : {}),
    ...(toIsoString(row.deletedAt) !== undefined
      ? { deletedAt: toIsoString(row.deletedAt) }
      : {}),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  });

const buildInsertRow = (record: SearchTenantIndexRecord) => ({
  indexName: record.indexName,
  scope: record.scope,
  scopeId: record.scopeId,
  lifecycleState: record.lifecycleState,
  documentCount: record.documentCount,
  settings: record.settings ?? null,
  lastSyncedAt: parseTimestamp(record.lastSyncedAt),
  lastError: record.lastError ?? null,
  deletedAt: parseTimestamp(record.deletedAt),
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

export type SearchTenantIndexPostgresRepositoryService = {
  readonly upsertSearchTenantIndexRecord: (
    input: SearchTenantIndexRecord,
  ) => Effect.Effect<
    SearchTenantIndexRecord,
    SearchTenantIndexPostgresRepositoryError
  >;
  readonly getSearchTenantIndexRecord: (
    input: SearchTenantIndexReference,
  ) => Effect.Effect<
    SearchTenantIndexRecord | undefined,
    SearchTenantIndexPostgresRepositoryError
  >;
  readonly listSearchTenantIndexRecords: (input: {
    readonly scope: SearchTenantIndexReference["scope"];
    readonly scopeId: string;
  }) => Effect.Effect<
    readonly SearchTenantIndexRecord[],
    SearchTenantIndexPostgresRepositoryError
  >;
};

export class SearchTenantIndexPostgresRepository extends Context.Tag(
  "SearchTenantIndexPostgresRepository",
)<
  SearchTenantIndexPostgresRepository,
  SearchTenantIndexPostgresRepositoryService
>() {}

export const makeSearchTenantIndexPostgresRepository = (
  database: SearchTenantIndexPostgresQueryable,
) =>
  Effect.succeed<SearchTenantIndexPostgresRepositoryService>({
    upsertSearchTenantIndexRecord: (input: SearchTenantIndexRecord) =>
      Schema.decodeUnknown(SearchTenantIndexRecordSchema)(input).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () => database.upsertSearchTenantIndex(buildInsertRow(record)),
            catch: (cause) =>
              ({
                _tag: "SearchTenantIndexPostgresRepositoryQueryError",
                operation: "upsertSearchTenantIndexRecord",
                cause,
              }) satisfies SearchTenantIndexPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) => buildSearchTenantIndexRecord(row)),
      ),
    getSearchTenantIndexRecord: (input: SearchTenantIndexReference) =>
      Schema.decodeUnknown(SearchTenantIndexReferenceSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              database.getSearchTenantIndex(
                request.scope,
                request.scopeId,
                request.indexName,
              ),
            catch: (cause) =>
              ({
                _tag: "SearchTenantIndexPostgresRepositoryQueryError",
                operation: "getSearchTenantIndexRecord",
                cause,
              }) satisfies SearchTenantIndexPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildSearchTenantIndexRecord(row),
        ),
      ),
    listSearchTenantIndexRecords: (input) =>
      Schema.decodeUnknown(SearchTenantIndexScopeLookupSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              database.listSearchTenantIndexesByScope(
                request.scope,
                request.scopeId,
              ),
            catch: (cause) =>
              ({
                _tag: "SearchTenantIndexPostgresRepositoryQueryError",
                operation: "listSearchTenantIndexRecords",
                cause,
              }) satisfies SearchTenantIndexPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) => buildSearchTenantIndexRecord(row)),
        ),
        Effect.flatMap((records) =>
          Schema.decodeUnknown(SearchTenantIndexRecordListSchema)(records),
        ),
      ),
  });

export const makeSearchTenantIndexPostgresRepositoryLayer = (
  database: SearchTenantIndexPostgresQueryable,
) =>
  Layer.effect(
    SearchTenantIndexPostgresRepository,
    makeSearchTenantIndexPostgresRepository(database),
  );
