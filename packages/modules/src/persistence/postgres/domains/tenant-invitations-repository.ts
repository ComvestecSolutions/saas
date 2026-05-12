import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  PlatformScopeSchema,
  type TenantMembershipRelation,
  TenantMembershipRelationSchema,
} from "@comvestec/contracts";
import type { PostgresDatabase } from "../database";
import { tenantMembershipInvitationsTable } from "./tenant-invitations";

const TenantInvitationPersistedStatusConstantSchema = Schema.Struct({
  pending: Schema.Literal("pending"),
  revoked: Schema.Literal("revoked"),
  redeemed: Schema.Literal("redeemed"),
});

export const tenantInvitationPersistedStatus = Schema.validateSync(
  TenantInvitationPersistedStatusConstantSchema,
)({
  pending: "pending",
  revoked: "revoked",
  redeemed: "redeemed",
} satisfies Schema.Schema.Type<
  typeof TenantInvitationPersistedStatusConstantSchema
>);

export const TenantInvitationPersistedStatusSchema = Schema.Literal(
  tenantInvitationPersistedStatus.pending,
  tenantInvitationPersistedStatus.revoked,
  tenantInvitationPersistedStatus.redeemed,
);

export type TenantInvitationPersistedStatus = Schema.Schema.Type<
  typeof TenantInvitationPersistedStatusSchema
>;

export const PersistTenantInvitationRecordSchema = Schema.Struct({
  invitationId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  tokenHash: Schema.optional(Schema.NonEmptyString),
  recipientEmail: Schema.NonEmptyString,
  relation: TenantMembershipRelationSchema,
  status: TenantInvitationPersistedStatusSchema,
  issuedBy: Schema.NonEmptyString,
  correlationId: Schema.optional(Schema.NonEmptyString),
  issuedAt: Schema.optional(Schema.NonEmptyString),
  expiresAt: Schema.NonEmptyString,
  reminderQueuedAt: Schema.optional(Schema.NonEmptyString),
  expiryNotificationQueuedAt: Schema.optional(Schema.NonEmptyString),
  redeemedAt: Schema.optional(Schema.NonEmptyString),
  redeemedBy: Schema.optional(Schema.NonEmptyString),
  revokedAt: Schema.optional(Schema.NonEmptyString),
  revokedBy: Schema.optional(Schema.NonEmptyString),
});

export type PersistTenantInvitationRecord = Schema.Schema.Type<
  typeof PersistTenantInvitationRecordSchema
>;

const TenantInvitationLookupSchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  invitationId: Schema.NonEmptyString,
});

type TenantInvitationLookup = Schema.Schema.Type<
  typeof TenantInvitationLookupSchema
>;

const TenantInvitationTenantQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
});

type TenantInvitationTenantQuery = Schema.Schema.Type<
  typeof TenantInvitationTenantQuerySchema
>;

const TenantInvitationTokenLookupSchema = Schema.Struct({
  tokenHash: Schema.NonEmptyString,
});

type TenantInvitationTokenLookup = Schema.Schema.Type<
  typeof TenantInvitationTokenLookupSchema
>;

const RevokeTenantInvitationRecordSchema = Schema.Struct({
  ...TenantInvitationLookupSchema.fields,
  revokedBy: Schema.NonEmptyString,
  revokedAt: Schema.optional(Schema.NonEmptyString),
});

type RevokeTenantInvitationRecord = Schema.Schema.Type<
  typeof RevokeTenantInvitationRecordSchema
>;

const RedeemTenantInvitationRecordSchema = Schema.Struct({
  ...TenantInvitationLookupSchema.fields,
  redeemedBy: Schema.NonEmptyString,
  redeemedAt: Schema.optional(Schema.NonEmptyString),
});

type RedeemTenantInvitationRecord = Schema.Schema.Type<
  typeof RedeemTenantInvitationRecordSchema
>;

export type TenantInvitationPostgresRepositoryPersistenceError = {
  readonly _tag: "TenantInvitationPostgresRepositoryPersistenceError";
  readonly operation:
    | "createInvitation"
    | "redeemInvitation"
    | "revokeInvitation";
  readonly cause: unknown;
};

export type TenantInvitationPostgresRepositoryQueryError = {
  readonly _tag: "TenantInvitationPostgresRepositoryQueryError";
  readonly operation:
    | "getInvitationById"
    | "getInvitationByTokenHash"
    | "listInvitationsByTenant";
  readonly cause: unknown;
};

export type TenantInvitationPostgresRepositoryError =
  | ParseResult.ParseError
  | TenantInvitationPostgresRepositoryPersistenceError
  | TenantInvitationPostgresRepositoryQueryError;

const decodePersistTenantInvitationRecord = Schema.decodeUnknown(
  PersistTenantInvitationRecordSchema,
);

const parseTimestamp = (value: string | undefined) =>
  value === undefined ? undefined : new Date(value);

const decodePersistedRow = (row: {
  readonly invitationId: string;
  readonly tenantScope: string;
  readonly tenantScopeId: string;
  readonly tokenHash: string | null;
  readonly recipientEmail: string;
  readonly relation: string;
  readonly status: string;
  readonly issuedBy: string;
  readonly correlationId: string | null;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly reminderQueuedAt: Date | null;
  readonly expiryNotificationQueuedAt: Date | null;
  readonly redeemedAt: Date | null;
  readonly redeemedBy: string | null;
  readonly revokedAt: Date | null;
  readonly revokedBy: string | null;
}) =>
  decodePersistTenantInvitationRecord({
    invitationId: row.invitationId,
    tenantScope: row.tenantScope,
    tenantScopeId: row.tenantScopeId,
    ...(row.tokenHash === null ? {} : { tokenHash: row.tokenHash }),
    recipientEmail: row.recipientEmail,
    relation: row.relation,
    status: row.status,
    issuedBy: row.issuedBy,
    ...(row.correlationId === null ? {} : { correlationId: row.correlationId }),
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ...(row.reminderQueuedAt === null
      ? {}
      : { reminderQueuedAt: row.reminderQueuedAt.toISOString() }),
    ...(row.expiryNotificationQueuedAt === null
      ? {}
      : {
          expiryNotificationQueuedAt:
            row.expiryNotificationQueuedAt.toISOString(),
        }),
    ...(row.redeemedAt === null
      ? {}
      : { redeemedAt: row.redeemedAt.toISOString() }),
    ...(row.redeemedBy === null ? {} : { redeemedBy: row.redeemedBy }),
    ...(row.revokedAt === null
      ? {}
      : { revokedAt: row.revokedAt.toISOString() }),
    ...(row.revokedBy === null ? {} : { revokedBy: row.revokedBy }),
  });

const buildPersistedRow = (record: PersistTenantInvitationRecord) => ({
  invitationId: record.invitationId,
  tenantScope: record.tenantScope,
  tenantScopeId: record.tenantScopeId,
  ...(record.tokenHash === undefined ? {} : { tokenHash: record.tokenHash }),
  recipientEmail: record.recipientEmail,
  relation: record.relation,
  status: record.status,
  issuedBy: record.issuedBy,
  ...(record.correlationId === undefined
    ? {}
    : { correlationId: record.correlationId }),
  ...(record.issuedAt === undefined
    ? {}
    : { issuedAt: parseTimestamp(record.issuedAt) }),
  expiresAt: new Date(record.expiresAt),
  ...(record.reminderQueuedAt === undefined
    ? {}
    : { reminderQueuedAt: parseTimestamp(record.reminderQueuedAt) }),
  ...(record.expiryNotificationQueuedAt === undefined
    ? {}
    : {
        expiryNotificationQueuedAt: parseTimestamp(
          record.expiryNotificationQueuedAt,
        ),
      }),
  ...(record.redeemedAt === undefined
    ? {}
    : { redeemedAt: parseTimestamp(record.redeemedAt) }),
  ...(record.redeemedBy === undefined ? {} : { redeemedBy: record.redeemedBy }),
  ...(record.revokedAt === undefined
    ? {}
    : { revokedAt: parseTimestamp(record.revokedAt) }),
  ...(record.revokedBy === undefined ? {} : { revokedBy: record.revokedBy }),
});

const sortInvitationRecords = (
  records: PersistTenantInvitationRecord[],
): readonly PersistTenantInvitationRecord[] =>
  [...records].sort((left, right) => {
    const rightIssuedAt = Date.parse(right.issuedAt ?? right.expiresAt);
    const leftIssuedAt = Date.parse(left.issuedAt ?? left.expiresAt);

    if (leftIssuedAt !== rightIssuedAt) {
      return rightIssuedAt - leftIssuedAt;
    }

    return left.invitationId.localeCompare(right.invitationId);
  });

const persistInvitationRecord = (
  database: PostgresDatabase,
  input: PersistTenantInvitationRecord,
  operation: TenantInvitationPostgresRepositoryPersistenceError["operation"],
) =>
  decodePersistTenantInvitationRecord(input).pipe(
    Effect.flatMap((record) =>
      Effect.tryPromise({
        try: async () => {
          const persistedRow = buildPersistedRow(record);

          await database
            .insert(tenantMembershipInvitationsTable)
            .values(persistedRow)
            .onConflictDoUpdate({
              target: [tenantMembershipInvitationsTable.invitationId],
              set: persistedRow,
            })
            .execute();

          return record;
        },
        catch: (cause) =>
          ({
            _tag: "TenantInvitationPostgresRepositoryPersistenceError",
            operation,
            cause,
          }) satisfies TenantInvitationPostgresRepositoryPersistenceError,
      }),
    ),
  );

const queryInvitationRows = (
  database: PostgresDatabase,
  lookup: TenantInvitationLookup,
) =>
  Effect.tryPromise({
    try: () =>
      database
        .select()
        .from(tenantMembershipInvitationsTable)
        .where(
          and(
            eq(
              tenantMembershipInvitationsTable.tenantScope,
              lookup.tenantScope,
            ),
            eq(
              tenantMembershipInvitationsTable.tenantScopeId,
              lookup.tenantScopeId,
            ),
            eq(
              tenantMembershipInvitationsTable.invitationId,
              lookup.invitationId,
            ),
          ),
        ),
    catch: (cause) =>
      ({
        _tag: "TenantInvitationPostgresRepositoryQueryError",
        operation: "getInvitationById",
        cause,
      }) satisfies TenantInvitationPostgresRepositoryQueryError,
  });

const queryInvitationRowsByTokenHash = (
  database: PostgresDatabase,
  lookup: TenantInvitationTokenLookup,
) =>
  Effect.tryPromise({
    try: () =>
      database
        .select()
        .from(tenantMembershipInvitationsTable)
        .where(
          eq(tenantMembershipInvitationsTable.tokenHash, lookup.tokenHash),
        ),
    catch: (cause) =>
      ({
        _tag: "TenantInvitationPostgresRepositoryQueryError",
        operation: "getInvitationByTokenHash",
        cause,
      }) satisfies TenantInvitationPostgresRepositoryQueryError,
  });

const redeemInvitationRecord = (
  database: PostgresDatabase,
  input: RedeemTenantInvitationRecord,
) =>
  Effect.tryPromise({
    try: () =>
      database
        .update(tenantMembershipInvitationsTable)
        .set({
          status: tenantInvitationPersistedStatus.redeemed,
          redeemedBy: input.redeemedBy,
          redeemedAt: parseTimestamp(input.redeemedAt) ?? new Date(),
        })
        .where(
          and(
            eq(tenantMembershipInvitationsTable.tenantScope, input.tenantScope),
            eq(
              tenantMembershipInvitationsTable.tenantScopeId,
              input.tenantScopeId,
            ),
            eq(
              tenantMembershipInvitationsTable.invitationId,
              input.invitationId,
            ),
            eq(
              tenantMembershipInvitationsTable.status,
              tenantInvitationPersistedStatus.pending,
            ),
          ),
        )
        .returning(),
    catch: (cause) =>
      ({
        _tag: "TenantInvitationPostgresRepositoryPersistenceError",
        operation: "redeemInvitation",
        cause,
      }) satisfies TenantInvitationPostgresRepositoryPersistenceError,
  });

export type TenantInvitationPostgresRepositoryService = {
  readonly createInvitation: (
    input: PersistTenantInvitationRecord,
  ) => Effect.Effect<
    PersistTenantInvitationRecord,
    TenantInvitationPostgresRepositoryError
  >;
  readonly getInvitationById: (
    input: TenantInvitationLookup,
  ) => Effect.Effect<
    PersistTenantInvitationRecord | undefined,
    TenantInvitationPostgresRepositoryError
  >;
  readonly getInvitationByTokenHash: (
    input: TenantInvitationTokenLookup,
  ) => Effect.Effect<
    PersistTenantInvitationRecord | undefined,
    TenantInvitationPostgresRepositoryError
  >;
  readonly listInvitationsByTenant: (
    input: TenantInvitationTenantQuery,
  ) => Effect.Effect<
    readonly PersistTenantInvitationRecord[],
    TenantInvitationPostgresRepositoryError
  >;
  readonly redeemInvitation: (
    input: RedeemTenantInvitationRecord,
  ) => Effect.Effect<
    PersistTenantInvitationRecord | undefined,
    TenantInvitationPostgresRepositoryError
  >;
  readonly revokeInvitation: (
    input: RevokeTenantInvitationRecord,
  ) => Effect.Effect<
    PersistTenantInvitationRecord | undefined,
    TenantInvitationPostgresRepositoryError
  >;
};

export class TenantInvitationPostgresRepository extends Context.Tag(
  "TenantInvitationPostgresRepository",
)<
  TenantInvitationPostgresRepository,
  TenantInvitationPostgresRepositoryService
>() {}

export const makeTenantInvitationPostgresRepository = (
  database: PostgresDatabase,
) =>
  Effect.succeed<TenantInvitationPostgresRepositoryService>({
    createInvitation: (input) =>
      persistInvitationRecord(database, input, "createInvitation"),
    getInvitationById: (input) =>
      Schema.decodeUnknown(TenantInvitationLookupSchema)(input).pipe(
        Effect.flatMap((lookup) => queryInvitationRows(database, lookup)),
        Effect.flatMap((rows) => {
          const invitation = rows.find(
            (row) =>
              row.tenantScope === input.tenantScope &&
              row.tenantScopeId === input.tenantScopeId &&
              row.invitationId === input.invitationId,
          );

          return invitation === undefined
            ? Effect.succeed(undefined)
            : decodePersistedRow(invitation);
        }),
      ),
    getInvitationByTokenHash: (input) =>
      Schema.decodeUnknown(TenantInvitationTokenLookupSchema)(input).pipe(
        Effect.flatMap((lookup) =>
          queryInvitationRowsByTokenHash(database, lookup),
        ),
        Effect.flatMap((rows) => {
          const invitation = rows.find(
            (row) => row.tokenHash === input.tokenHash,
          );

          return invitation === undefined
            ? Effect.succeed(undefined)
            : decodePersistedRow(invitation);
        }),
      ),
    listInvitationsByTenant: (input) =>
      Schema.decodeUnknown(TenantInvitationTenantQuerySchema)(input).pipe(
        Effect.flatMap((query) =>
          Effect.tryPromise({
            try: () =>
              database
                .select()
                .from(tenantMembershipInvitationsTable)
                .where(
                  and(
                    eq(
                      tenantMembershipInvitationsTable.tenantScope,
                      query.tenantScope,
                    ),
                    eq(
                      tenantMembershipInvitationsTable.tenantScopeId,
                      query.tenantScopeId,
                    ),
                  ),
                ),
            catch: (cause) =>
              ({
                _tag: "TenantInvitationPostgresRepositoryQueryError",
                operation: "listInvitationsByTenant",
                cause,
              }) satisfies TenantInvitationPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((rows) =>
          Effect.forEach(
            rows.filter(
              (row) =>
                row.tenantScope === input.tenantScope &&
                row.tenantScopeId === input.tenantScopeId,
            ),
            decodePersistedRow,
            { concurrency: 1 },
          ),
        ),
        Effect.map((rows) => sortInvitationRecords(rows)),
      ),
    redeemInvitation: (input) =>
      Schema.decodeUnknown(RedeemTenantInvitationRecordSchema)(input).pipe(
        Effect.flatMap((request) => redeemInvitationRecord(database, request)),
        Effect.flatMap((rows) => {
          const invitation = rows.find(
            (row) =>
              row.tenantScope === input.tenantScope &&
              row.tenantScopeId === input.tenantScopeId &&
              row.invitationId === input.invitationId,
          );

          return invitation === undefined
            ? Effect.succeed(undefined)
            : decodePersistedRow(invitation);
        }),
      ),
    revokeInvitation: (input) =>
      Schema.decodeUnknown(RevokeTenantInvitationRecordSchema)(input).pipe(
        Effect.flatMap((request) =>
          queryInvitationRows(database, request).pipe(
            Effect.flatMap((rows) => {
              const invitation = rows.find(
                (row) =>
                  row.tenantScope === request.tenantScope &&
                  row.tenantScopeId === request.tenantScopeId &&
                  row.invitationId === request.invitationId,
              );

              return invitation === undefined
                ? Effect.succeed(undefined)
                : decodePersistedRow(invitation).pipe(
                    Effect.flatMap((record) =>
                      record.status === tenantInvitationPersistedStatus.revoked
                        ? Effect.succeed(record)
                        : persistInvitationRecord(
                            database,
                            {
                              ...record,
                              status: tenantInvitationPersistedStatus.revoked,
                              revokedBy: request.revokedBy,
                              revokedAt:
                                request.revokedAt ?? new Date().toISOString(),
                            },
                            "revokeInvitation",
                          ),
                    ),
                  );
            }),
          ),
        ),
      ),
  });

export const makeTenantInvitationPostgresRepositoryLayer = (
  database: PostgresDatabase,
) =>
  Layer.effect(
    TenantInvitationPostgresRepository,
    makeTenantInvitationPostgresRepository(database),
  );

export type { TenantMembershipRelation };
