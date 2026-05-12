import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type WebhookApiKeyListRequest,
  WebhookApiKeyListRequestSchema,
  type WebhookApiKeyLookup,
  WebhookApiKeyLookupSchema,
  type WebhookApiKeyRecord,
  WebhookApiKeyRecordListSchema,
  WebhookApiKeyRecordSchema,
  webhookApiKeyStatus,
} from "@comvestec/contracts";
import { webhookApiKeysTable } from "./schema";

type WebhookApiKeyRow = typeof webhookApiKeysTable.$inferSelect;

export type WebhookApiKeyNotFoundError = {
  readonly _tag: "WebhookApiKeyNotFoundError";
  readonly scope: WebhookApiKeyRecord["scope"];
  readonly scopeId: string;
  readonly apiKeyId: string;
};

export type WebhookApiKeyRevokedError = {
  readonly _tag: "WebhookApiKeyRevokedError";
  readonly scope: WebhookApiKeyRecord["scope"];
  readonly scopeId: string;
  readonly apiKeyId: string;
};

export type WebhookApiKeyMutationConflictError = {
  readonly _tag: "WebhookApiKeyMutationConflictError";
  readonly scope: WebhookApiKeyRecord["scope"];
  readonly scopeId: string;
  readonly apiKeyId: string;
};

export type WebhookApiKeyPostgresQueryable = {
  readonly createWebhookApiKey: (
    record: typeof webhookApiKeysTable.$inferInsert,
  ) => Promise<WebhookApiKeyRow>;
  readonly listWebhookApiKeysByScope: (
    scope: WebhookApiKeyRecord["scope"],
    scopeId: string,
  ) => Promise<readonly WebhookApiKeyRow[]>;
  readonly getWebhookApiKey: (
    scope: WebhookApiKeyRecord["scope"],
    scopeId: string,
    apiKeyId: string,
  ) => Promise<WebhookApiKeyRow | undefined>;
  readonly rotateWebhookApiKey: (input: {
    readonly scope: WebhookApiKeyRecord["scope"];
    readonly scopeId: string;
    readonly apiKeyId: string;
    readonly expectedUpdatedAt: Date;
    readonly expectedStatus: WebhookApiKeyRecord["status"];
    readonly secretHash: string;
    readonly prefix: string;
    readonly rotatedAt: Date;
    readonly updatedAt: Date;
  }) => Promise<WebhookApiKeyRow | undefined>;
  readonly revokeWebhookApiKey: (input: {
    readonly scope: WebhookApiKeyRecord["scope"];
    readonly scopeId: string;
    readonly apiKeyId: string;
    readonly expectedUpdatedAt: Date;
    readonly expectedStatus: WebhookApiKeyRecord["status"];
    readonly expectedSecretHash: string;
    readonly expectedPrefix: string;
    readonly expectedRotatedAt: Date | null;
    readonly expectedRevokedAt: Date | null;
    readonly revokedAt: Date;
    readonly updatedAt: Date;
  }) => Promise<WebhookApiKeyRow | undefined>;
  readonly restoreWebhookApiKey: (input: {
    readonly scope: WebhookApiKeyRecord["scope"];
    readonly scopeId: string;
    readonly apiKeyId: string;
    readonly expectedUpdatedAt: Date;
    readonly expectedStatus: WebhookApiKeyRecord["status"];
    readonly expectedSecretHash: string;
    readonly expectedPrefix: string;
    readonly expectedRotatedAt: Date | null;
    readonly expectedRevokedAt: Date | null;
    readonly label: string;
    readonly secretHash: string;
    readonly prefix: string;
    readonly status: WebhookApiKeyRecord["status"];
    readonly updatedAt: Date;
    readonly rotatedAt: Date | null;
    readonly revokedAt: Date | null;
  }) => Promise<WebhookApiKeyRow | undefined>;
};

export type WebhookApiKeyPostgresRepositoryQueryError = {
  readonly _tag: "WebhookApiKeyPostgresRepositoryQueryError";
  readonly operation:
    | "createWebhookApiKey"
    | "listWebhookApiKeys"
    | "getWebhookApiKey"
    | "rotateWebhookApiKey"
    | "revokeWebhookApiKey"
    | "restoreWebhookApiKey";
  readonly cause: unknown;
};

export type WebhookApiKeyPostgresRepositoryError =
  | ParseResult.ParseError
  | WebhookApiKeyMutationConflictError
  | WebhookApiKeyNotFoundError
  | WebhookApiKeyPostgresRepositoryQueryError
  | WebhookApiKeyRevokedError;

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const decodeWebhookApiKeyLookup = Schema.decodeUnknown(
  WebhookApiKeyLookupSchema,
);
const decodeWebhookApiKeyRecord = Schema.decodeUnknown(
  WebhookApiKeyRecordSchema,
);

const buildWebhookApiKeyRecord = (row: WebhookApiKeyRow) =>
  decodeWebhookApiKeyRecord({
    apiKeyId: row.apiKeyId,
    scope: row.scope,
    scopeId: row.scopeId,
    label: row.label,
    secretHash: row.secretHash,
    prefix: row.prefix,
    status: row.status,
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
    ...(toIsoString(row.rotatedAt) === undefined
      ? {}
      : { rotatedAt: toIsoString(row.rotatedAt) }),
    ...(toIsoString(row.revokedAt) === undefined
      ? {}
      : { revokedAt: toIsoString(row.revokedAt) }),
  });

const createQueryError = (
  operation: WebhookApiKeyPostgresRepositoryQueryError["operation"],
  cause: unknown,
): WebhookApiKeyPostgresRepositoryQueryError => ({
  _tag: "WebhookApiKeyPostgresRepositoryQueryError",
  operation,
  cause,
});

const failWebhookApiKeyNotFound = (input: {
  readonly scope: WebhookApiKeyRecord["scope"];
  readonly scopeId: string;
  readonly apiKeyId: string;
}): Effect.Effect<never, WebhookApiKeyNotFoundError> =>
  Effect.fail({
    _tag: "WebhookApiKeyNotFoundError",
    scope: input.scope,
    scopeId: input.scopeId,
    apiKeyId: input.apiKeyId,
  });

const failWebhookApiKeyMutationConflict = (input: {
  readonly scope: WebhookApiKeyRecord["scope"];
  readonly scopeId: string;
  readonly apiKeyId: string;
}): Effect.Effect<never, WebhookApiKeyMutationConflictError> =>
  Effect.fail({
    _tag: "WebhookApiKeyMutationConflictError",
    scope: input.scope,
    scopeId: input.scopeId,
    apiKeyId: input.apiKeyId,
  });

const failWebhookApiKeyRevoked = (input: {
  readonly scope: WebhookApiKeyRecord["scope"];
  readonly scopeId: string;
  readonly apiKeyId: string;
}): Effect.Effect<never, WebhookApiKeyRevokedError> =>
  Effect.fail({
    _tag: "WebhookApiKeyRevokedError",
    scope: input.scope,
    scopeId: input.scopeId,
    apiKeyId: input.apiKeyId,
  });

const ensureActiveWebhookApiKeyRecord = (
  record: WebhookApiKeyRecord,
): Effect.Effect<WebhookApiKeyRecord, WebhookApiKeyRevokedError> =>
  record.status === webhookApiKeyStatus.revoked
    ? failWebhookApiKeyRevoked(record)
    : Effect.succeed(record);

const lookupWebhookApiKey = (input: {
  readonly database: WebhookApiKeyPostgresQueryable;
  readonly request: WebhookApiKeyLookup;
}): Effect.Effect<WebhookApiKeyRecord, WebhookApiKeyPostgresRepositoryError> =>
  Effect.tryPromise<
    WebhookApiKeyRow | undefined,
    WebhookApiKeyPostgresRepositoryQueryError
  >({
    try: () =>
      input.database.getWebhookApiKey(
        input.request.scope,
        input.request.scopeId,
        input.request.apiKeyId,
      ),
    catch: (cause) => createQueryError("getWebhookApiKey", cause),
  }).pipe(
    Effect.flatMap(
      (
        row,
      ): Effect.Effect<
        WebhookApiKeyRecord,
        WebhookApiKeyPostgresRepositoryError
      > =>
        row === undefined
          ? failWebhookApiKeyNotFound({
              scope: input.request.scope,
              scopeId: input.request.scopeId,
              apiKeyId: input.request.apiKeyId,
            })
          : buildWebhookApiKeyRecord(row),
    ),
  );

const recoverWebhookApiKeyMutationResult = (input: {
  readonly database: WebhookApiKeyPostgresQueryable;
  readonly request: WebhookApiKeyLookup;
}): Effect.Effect<never, WebhookApiKeyPostgresRepositoryError> =>
  lookupWebhookApiKey(input).pipe(
    Effect.flatMap(
      (record): Effect.Effect<never, WebhookApiKeyPostgresRepositoryError> =>
        record.status === webhookApiKeyStatus.revoked
          ? failWebhookApiKeyRevoked(record)
          : failWebhookApiKeyMutationConflict(input.request),
    ),
  );

export type WebhookApiKeyRotationResult = {
  readonly previousRecord: WebhookApiKeyRecord;
  readonly record: WebhookApiKeyRecord;
};

type RevokeWebhookApiKeyInput = WebhookApiKeyLookup & {
  readonly revokedAt: string;
  readonly updatedAt: string;
  readonly expectedCurrentRecord?: WebhookApiKeyRecord;
};

const resolveExpectedWebhookApiKeyRecordForRevocation = (input: {
  readonly database: WebhookApiKeyPostgresQueryable;
  readonly request: WebhookApiKeyLookup;
  readonly expectedCurrentRecord?: WebhookApiKeyRecord;
}): Effect.Effect<WebhookApiKeyRecord, WebhookApiKeyPostgresRepositoryError> =>
  input.expectedCurrentRecord === undefined
    ? lookupWebhookApiKey({
        database: input.database,
        request: input.request,
      }).pipe(
        Effect.flatMap((record) => ensureActiveWebhookApiKeyRecord(record)),
      )
    : decodeWebhookApiKeyRecord(input.expectedCurrentRecord).pipe(
        Effect.flatMap((record) => ensureActiveWebhookApiKeyRecord(record)),
      );

export type WebhookApiKeyPostgresRepositoryService = {
  readonly createWebhookApiKey: (
    input: WebhookApiKeyRecord,
  ) => Effect.Effect<WebhookApiKeyRecord, WebhookApiKeyPostgresRepositoryError>;
  readonly listWebhookApiKeys: (
    input: WebhookApiKeyListRequest,
  ) => Effect.Effect<
    readonly WebhookApiKeyRecord[],
    WebhookApiKeyPostgresRepositoryError
  >;
  readonly rotateWebhookApiKey: (input: {
    readonly scope: WebhookApiKeyRecord["scope"];
    readonly scopeId: string;
    readonly apiKeyId: string;
    readonly secretHash: string;
    readonly prefix: string;
    readonly rotatedAt: string;
    readonly updatedAt: string;
  }) => Effect.Effect<
    WebhookApiKeyRotationResult,
    WebhookApiKeyPostgresRepositoryError
  >;
  readonly revokeWebhookApiKey: (
    input: RevokeWebhookApiKeyInput,
  ) => Effect.Effect<WebhookApiKeyRecord, WebhookApiKeyPostgresRepositoryError>;
  readonly restoreWebhookApiKey: (input: {
    readonly record: WebhookApiKeyRecord;
    readonly expectedCurrentRecord: WebhookApiKeyRecord;
  }) => Effect.Effect<
    WebhookApiKeyRecord,
    WebhookApiKeyPostgresRepositoryError
  >;
};

export class WebhookApiKeyPostgresRepository extends Context.Tag(
  "WebhookApiKeyPostgresRepository",
)<WebhookApiKeyPostgresRepository, WebhookApiKeyPostgresRepositoryService>() {}

export const makeWebhookApiKeyPostgresRepository = (
  database: WebhookApiKeyPostgresQueryable,
) =>
  Effect.succeed<WebhookApiKeyPostgresRepositoryService>({
    createWebhookApiKey: (
      input: WebhookApiKeyRecord,
    ): Effect.Effect<
      WebhookApiKeyRecord,
      WebhookApiKeyPostgresRepositoryError
    > =>
      Schema.decodeUnknown(WebhookApiKeyRecordSchema)(input).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.createWebhookApiKey({
                apiKeyId: record.apiKeyId,
                scope: record.scope,
                scopeId: record.scopeId,
                label: record.label,
                secretHash: record.secretHash,
                prefix: record.prefix,
                status: record.status,
                createdAt: new Date(record.createdAt),
                updatedAt: new Date(record.updatedAt),
                rotatedAt:
                  record.rotatedAt === undefined
                    ? null
                    : new Date(record.rotatedAt),
                revokedAt:
                  record.revokedAt === undefined
                    ? null
                    : new Date(record.revokedAt),
              }),
            catch: (cause) => createQueryError("createWebhookApiKey", cause),
          }),
        ),
        Effect.flatMap((row) => buildWebhookApiKeyRecord(row)),
      ),
    listWebhookApiKeys: (
      input: WebhookApiKeyListRequest,
    ): Effect.Effect<
      readonly WebhookApiKeyRecord[],
      WebhookApiKeyPostgresRepositoryError
    > =>
      Schema.decodeUnknown(WebhookApiKeyListRequestSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              database.listWebhookApiKeysByScope(
                request.scope,
                request.scopeId,
              ),
            catch: (cause) => createQueryError("listWebhookApiKeys", cause),
          }),
        ),
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) => buildWebhookApiKeyRecord(row)),
        ),
        Effect.flatMap((records) =>
          Schema.decodeUnknown(WebhookApiKeyRecordListSchema)(records),
        ),
      ),
    rotateWebhookApiKey: (input) =>
      decodeWebhookApiKeyLookup({
        scope: input.scope,
        scopeId: input.scopeId,
        apiKeyId: input.apiKeyId,
      }).pipe(
        Effect.flatMap((request) =>
          lookupWebhookApiKey({
            database,
            request,
          }),
        ),
        Effect.flatMap((record) => ensureActiveWebhookApiKeyRecord(record)),
        Effect.flatMap((previousRecord) =>
          Effect.tryPromise<
            WebhookApiKeyRow | undefined,
            WebhookApiKeyPostgresRepositoryQueryError
          >({
            try: () =>
              database.rotateWebhookApiKey({
                scope: previousRecord.scope,
                scopeId: previousRecord.scopeId,
                apiKeyId: previousRecord.apiKeyId,
                expectedUpdatedAt: new Date(previousRecord.updatedAt),
                expectedStatus: previousRecord.status,
                secretHash: input.secretHash,
                prefix: input.prefix,
                rotatedAt: new Date(input.rotatedAt),
                updatedAt: new Date(input.updatedAt),
              }),
            catch: (cause) => createQueryError("rotateWebhookApiKey", cause),
          }).pipe(
            Effect.flatMap(
              (
                row,
              ): Effect.Effect<
                WebhookApiKeyRotationResult,
                WebhookApiKeyPostgresRepositoryError
              > =>
                row === undefined
                  ? recoverWebhookApiKeyMutationResult({
                      database,
                      request: {
                        scope: input.scope,
                        scopeId: input.scopeId,
                        apiKeyId: input.apiKeyId,
                      },
                    })
                  : buildWebhookApiKeyRecord(row).pipe(
                      Effect.map((record) => ({
                        previousRecord,
                        record,
                      })),
                    ),
            ),
          ),
        ),
      ),
    revokeWebhookApiKey: (input) =>
      decodeWebhookApiKeyLookup(input).pipe(
        Effect.flatMap((request) =>
          resolveExpectedWebhookApiKeyRecordForRevocation({
            database,
            request,
            ...(input.expectedCurrentRecord === undefined
              ? {}
              : { expectedCurrentRecord: input.expectedCurrentRecord }),
          }).pipe(
            Effect.flatMap((expectedCurrentRecord) =>
              Effect.tryPromise<
                WebhookApiKeyRow | undefined,
                WebhookApiKeyPostgresRepositoryQueryError
              >({
                try: () =>
                  database.revokeWebhookApiKey({
                    scope: request.scope,
                    scopeId: request.scopeId,
                    apiKeyId: request.apiKeyId,
                    expectedUpdatedAt: new Date(
                      expectedCurrentRecord.updatedAt,
                    ),
                    expectedStatus: expectedCurrentRecord.status,
                    expectedSecretHash: expectedCurrentRecord.secretHash,
                    expectedPrefix: expectedCurrentRecord.prefix,
                    expectedRotatedAt:
                      expectedCurrentRecord.rotatedAt === undefined
                        ? null
                        : new Date(expectedCurrentRecord.rotatedAt),
                    expectedRevokedAt:
                      expectedCurrentRecord.revokedAt === undefined
                        ? null
                        : new Date(expectedCurrentRecord.revokedAt),
                    revokedAt: new Date(input.revokedAt),
                    updatedAt: new Date(input.updatedAt),
                  }),
                catch: (cause) =>
                  createQueryError("revokeWebhookApiKey", cause),
              }),
            ),
            Effect.flatMap(
              (
                row,
              ): Effect.Effect<
                WebhookApiKeyRecord,
                WebhookApiKeyPostgresRepositoryError
              > =>
                row === undefined
                  ? recoverWebhookApiKeyMutationResult({
                      database,
                      request: {
                        scope: input.scope,
                        scopeId: input.scopeId,
                        apiKeyId: input.apiKeyId,
                      },
                    })
                  : buildWebhookApiKeyRecord(row),
            ),
          ),
        ),
      ),
    restoreWebhookApiKey: (input) =>
      Schema.decodeUnknown(
        Schema.Struct({
          record: WebhookApiKeyRecordSchema,
          expectedCurrentRecord: WebhookApiKeyRecordSchema,
        }),
      )(input).pipe(
        Effect.flatMap(({ record, expectedCurrentRecord }) =>
          Effect.tryPromise<
            WebhookApiKeyRow | undefined,
            WebhookApiKeyPostgresRepositoryQueryError
          >({
            try: () =>
              database.restoreWebhookApiKey({
                scope: record.scope,
                scopeId: record.scopeId,
                apiKeyId: record.apiKeyId,
                expectedUpdatedAt: new Date(expectedCurrentRecord.updatedAt),
                expectedStatus: expectedCurrentRecord.status,
                expectedSecretHash: expectedCurrentRecord.secretHash,
                expectedPrefix: expectedCurrentRecord.prefix,
                expectedRotatedAt:
                  expectedCurrentRecord.rotatedAt === undefined
                    ? null
                    : new Date(expectedCurrentRecord.rotatedAt),
                expectedRevokedAt:
                  expectedCurrentRecord.revokedAt === undefined
                    ? null
                    : new Date(expectedCurrentRecord.revokedAt),
                label: record.label,
                secretHash: record.secretHash,
                prefix: record.prefix,
                status: record.status,
                updatedAt: new Date(record.updatedAt),
                rotatedAt:
                  record.rotatedAt === undefined
                    ? null
                    : new Date(record.rotatedAt),
                revokedAt:
                  record.revokedAt === undefined
                    ? null
                    : new Date(record.revokedAt),
              }),
            catch: (cause) => createQueryError("restoreWebhookApiKey", cause),
          }),
        ),
        Effect.flatMap(
          (
            row,
          ): Effect.Effect<
            WebhookApiKeyRecord,
            WebhookApiKeyPostgresRepositoryError
          > =>
            row === undefined
              ? recoverWebhookApiKeyMutationResult({
                  database,
                  request: {
                    scope: input.record.scope,
                    scopeId: input.record.scopeId,
                    apiKeyId: input.record.apiKeyId,
                  },
                })
              : buildWebhookApiKeyRecord(row),
        ),
      ),
  });

export const makeWebhookApiKeyPostgresRepositoryLayer = (
  database: WebhookApiKeyPostgresQueryable,
) =>
  Layer.effect(
    WebhookApiKeyPostgresRepository,
    makeWebhookApiKeyPostgresRepository(database),
  );
