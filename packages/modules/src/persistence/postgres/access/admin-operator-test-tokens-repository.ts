/**
 * Admin-operator-test-tokens Postgres repository per
 * `specs/02-modules/access/admin-operator-test-tokens/spec.md` and
 * admin-app implementation-plan.md §9 item 17.
 *
 * Boundary-decodes rows into the typed
 * `AdminOperatorTestTokenSummary` / `AdminOperatorTestTokenDetail`
 * contracts. Owns no business logic — admin-owner authorization,
 * HMAC computation, reason-catalog validation, and audit emission
 * all live in the platform service
 * (`AdminOperatorTestTokensService`) that calls this repository.
 *
 * Repository-level invariants this file enforces:
 *
 *   - `tokenPrefix` is `UNIQUE`; duplicate-insert collisions surface
 *     as `AdminOperatorTestTokensUniquePrefixViolationError` so the
 *     service can re-roll a new prefix without leaking a hash.
 *   - `revokeToken` performs a conditional update that requires
 *     `revoked_at IS NULL`; concurrent revocations of the same row
 *     resolve to `AdminOperatorTestTokensAlreadyRevokedError` on
 *     the loser side.
 *   - `recordUsageEvent` is append-only; the ring trim is owned by
 *     `trimUsageEventsForToken` and runs after every append in the
 *     same service call (kept off the hot path of `verifyToken`).
 */
import { and, desc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  AdminOperatorTestTokenDetailSchema,
  AdminOperatorTestTokenPrefixSchema,
  AdminOperatorTestTokenSummarySchema,
  AdminOperatorTestTokenUsageOutcomeSchema,
  AdminOperatorTestTokenVerificationFailureReasonSchema,
  adminOperatorTestTokenUsageOutcome,
  type AdminOperatorTestTokenDetail,
  type AdminOperatorTestTokenSummary,
  type AdminOperatorTestTokenUsageOutcome,
  type AdminOperatorTestTokenVerificationFailureReason,
} from "@comvestec/contracts";
import type { PostgresDatabase, PostgresDeleteCapability } from "../database";
import {
  adminOperatorTestTokenUsageEventsTable,
  adminOperatorTestTokensTable,
} from "./admin-operator-test-tokens";

type AdminOperatorTestTokensDatabase = PostgresDatabase &
  PostgresDeleteCapability;

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class AdminOperatorTestTokensPersistenceError {
  readonly _tag = "AdminOperatorTestTokensPersistenceError" as const;
  constructor(
    readonly args: {
      readonly operation:
        | "issue"
        | "revoke"
        | "recordUsage"
        | "trimUsage"
        | "archive";
      readonly cause: unknown;
    },
  ) {}
}

export class AdminOperatorTestTokensQueryError {
  readonly _tag = "AdminOperatorTestTokensQueryError" as const;
  constructor(
    readonly args: {
      readonly operation: "list" | "get" | "findByPrefix" | "listUsage";
      readonly cause: unknown;
    },
  ) {}
}

export class AdminOperatorTestTokensNotFoundError {
  readonly _tag = "AdminOperatorTestTokensNotFoundError" as const;
  constructor(readonly args: { readonly id: string }) {}
}

export class AdminOperatorTestTokensAlreadyRevokedError {
  readonly _tag = "AdminOperatorTestTokensAlreadyRevokedError" as const;
  constructor(readonly args: { readonly id: string }) {}
}

export class AdminOperatorTestTokensUniquePrefixViolationError {
  readonly _tag = "AdminOperatorTestTokensUniquePrefixViolationError" as const;
  constructor(readonly args: { readonly tokenPrefix: string }) {}
}

export type AdminOperatorTestTokensRepositoryError =
  | ParseResult.ParseError
  | AdminOperatorTestTokensPersistenceError
  | AdminOperatorTestTokensQueryError
  | AdminOperatorTestTokensNotFoundError
  | AdminOperatorTestTokensAlreadyRevokedError
  | AdminOperatorTestTokensUniquePrefixViolationError;

// ---------------------------------------------------------------------------
// Repository inputs (persistence layer — typed, narrow)
// ---------------------------------------------------------------------------

export const IssueAdminOperatorTestTokenRepositoryInputSchema = Schema.Struct({
  tokenPrefix: AdminOperatorTestTokenPrefixSchema,
  tokenHash: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  issuedBy: Schema.NonEmptyString,
  issuedAt: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  reasonAttachmentText: Schema.optional(Schema.NonEmptyString),
});

export type IssueAdminOperatorTestTokenRepositoryInput = Schema.Schema.Type<
  typeof IssueAdminOperatorTestTokenRepositoryInputSchema
>;

export const RevokeAdminOperatorTestTokenRepositoryInputSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  revokedBy: Schema.NonEmptyString,
  revokedAt: Schema.NonEmptyString,
});

export type RevokeAdminOperatorTestTokenRepositoryInput = Schema.Schema.Type<
  typeof RevokeAdminOperatorTestTokenRepositoryInputSchema
>;

export const RecordAdminOperatorTestTokenUsageRepositoryInputSchema =
  Schema.Struct({
    tokenId: Schema.NonEmptyString,
    occurredAt: Schema.NonEmptyString,
    outcome: AdminOperatorTestTokenUsageOutcomeSchema,
    failureReason: Schema.optional(
      AdminOperatorTestTokenVerificationFailureReasonSchema,
    ),
    correlationId: Schema.NonEmptyString,
  });

export type RecordAdminOperatorTestTokenUsageRepositoryInput =
  Schema.Schema.Type<
    typeof RecordAdminOperatorTestTokenUsageRepositoryInputSchema
  >;

// ---------------------------------------------------------------------------
// Row → contract decode
// ---------------------------------------------------------------------------

type AdminOperatorTestTokenRow =
  typeof adminOperatorTestTokensTable.$inferSelect;

const decodeSummary = Schema.decodeUnknown(AdminOperatorTestTokenSummarySchema);
const decodeDetail = Schema.decodeUnknown(AdminOperatorTestTokenDetailSchema);

const summaryProjection = (row: AdminOperatorTestTokenRow) => ({
  id: row.id,
  tokenPrefix: row.tokenPrefix,
  label: row.label,
  issuedBy: row.issuedBy,
  issuedAt: row.issuedAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
  ...(row.revokedAt === null ? {} : { revokedAt: row.revokedAt.toISOString() }),
  ...(row.lastUsedAt === null
    ? {}
    : { lastUsedAt: row.lastUsedAt.toISOString() }),
  ...(row.lastUsedOutcome === null
    ? {}
    : { lastUsedOutcome: row.lastUsedOutcome }),
});

const detailProjection = (row: AdminOperatorTestTokenRow) => ({
  ...summaryProjection(row),
  reasonCatalogId: row.reasonCatalogId,
  ...(row.revokedBy === null ? {} : { revokedBy: row.revokedBy }),
  ...(row.reasonAttachmentText === null
    ? {}
    : { reasonAttachmentText: row.reasonAttachmentText }),
});

const decodeRowAsSummary = (row: AdminOperatorTestTokenRow) =>
  decodeSummary(summaryProjection(row));

const decodeRowAsDetail = (row: AdminOperatorTestTokenRow) =>
  decodeDetail(detailProjection(row));

// ---------------------------------------------------------------------------
// Service interface + tag
// ---------------------------------------------------------------------------

export type AdminOperatorTestTokenStoredRecord = {
  readonly summary: AdminOperatorTestTokenSummary;
  readonly tokenHash: string;
};

export type AdminOperatorTestTokenUsageEvent = {
  readonly id: string;
  readonly tokenId: string;
  readonly occurredAt: string;
  readonly outcome: AdminOperatorTestTokenUsageOutcome;
  readonly failureReason?: AdminOperatorTestTokenVerificationFailureReason;
  readonly correlationId: string;
};

export type AdminOperatorTestTokensRepositoryService = {
  readonly issueToken: (
    input: IssueAdminOperatorTestTokenRepositoryInput,
  ) => Effect.Effect<
    AdminOperatorTestTokenDetail,
    AdminOperatorTestTokensRepositoryError
  >;
  readonly getTokenById: (
    id: string,
  ) => Effect.Effect<
    Option.Option<AdminOperatorTestTokenDetail>,
    AdminOperatorTestTokensRepositoryError
  >;
  readonly findByPrefix: (
    tokenPrefix: string,
  ) => Effect.Effect<
    Option.Option<AdminOperatorTestTokenStoredRecord>,
    AdminOperatorTestTokensRepositoryError
  >;
  readonly listSummaries: (input: {
    readonly limit: number;
    readonly issuedAfter?: Date;
  }) => Effect.Effect<
    ReadonlyArray<AdminOperatorTestTokenSummary>,
    AdminOperatorTestTokensRepositoryError
  >;
  readonly countByLifecycle: (input: {
    readonly now: Date;
    readonly expiringWithin: Date;
  }) => Effect.Effect<
    {
      readonly active: number;
      readonly expiringSoon: number;
      readonly revoked: number;
    },
    AdminOperatorTestTokensRepositoryError
  >;
  readonly revokeToken: (
    input: RevokeAdminOperatorTestTokenRepositoryInput,
  ) => Effect.Effect<
    AdminOperatorTestTokenDetail,
    AdminOperatorTestTokensRepositoryError
  >;
  readonly recordUsageEvent: (
    input: RecordAdminOperatorTestTokenUsageRepositoryInput,
  ) => Effect.Effect<void, AdminOperatorTestTokensRepositoryError>;
  readonly trimUsageEventsForToken: (input: {
    readonly tokenId: string;
    readonly keepMostRecent: number;
  }) => Effect.Effect<number, AdminOperatorTestTokensRepositoryError>;
  readonly listUsageEventsForToken: (input: {
    readonly tokenId: string;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<AdminOperatorTestTokenUsageEvent>,
    AdminOperatorTestTokensRepositoryError
  >;
};

export class AdminOperatorTestTokensRepository extends Context.Tag(
  "AdminOperatorTestTokensRepository",
)<
  AdminOperatorTestTokensRepository,
  AdminOperatorTestTokensRepositoryService
>() {}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const tryQuery = <A>(
  operation: AdminOperatorTestTokensQueryError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, AdminOperatorTestTokensQueryError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      new AdminOperatorTestTokensQueryError({ operation, cause }),
  });

const tryPersist = <A>(
  operation: AdminOperatorTestTokensPersistenceError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, AdminOperatorTestTokensPersistenceError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      new AdminOperatorTestTokensPersistenceError({ operation, cause }),
  });

const generateUuid = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi?.randomUUID !== undefined) {
    return cryptoApi.randomUUID();
  }
  throw new Error(
    "globalThis.crypto.randomUUID is required to generate admin-operator-test-token identifiers",
  );
};

const isUniqueViolation = (cause: unknown, fragment: string): boolean => {
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "";
  return (
    message.includes("admin_operator_test_tokens_prefix_uq") ||
    message.toLowerCase().includes(fragment.toLowerCase())
  );
};

const selectById = (database: AdminOperatorTestTokensDatabase, id: string) =>
  tryQuery("get", () =>
    database
      .select()
      .from(adminOperatorTestTokensTable)
      .where(eq(adminOperatorTestTokensTable.id, id)),
  ).pipe(Effect.map((rows) => rows.find((row) => row.id === id)));

const selectByPrefix = (
  database: AdminOperatorTestTokensDatabase,
  tokenPrefix: string,
) =>
  tryQuery("findByPrefix", () =>
    database
      .select()
      .from(adminOperatorTestTokensTable)
      .where(eq(adminOperatorTestTokensTable.tokenPrefix, tokenPrefix)),
  ).pipe(
    Effect.map((rows) => rows.find((row) => row.tokenPrefix === tokenPrefix)),
  );

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const makeAdminOperatorTestTokensRepository = (
  database: AdminOperatorTestTokensDatabase,
) =>
  Effect.succeed<AdminOperatorTestTokensRepositoryService>({
    issueToken: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(
          IssueAdminOperatorTestTokenRepositoryInputSchema,
        )(input);
        const id = generateUuid();
        const insertResult = yield* tryPersist("issue", () =>
          database
            .insert(adminOperatorTestTokensTable)
            .values({
              id,
              tokenPrefix: decoded.tokenPrefix,
              tokenHash: decoded.tokenHash,
              label: decoded.label,
              issuedBy: decoded.issuedBy,
              issuedAt: new Date(decoded.issuedAt),
              expiresAt: new Date(decoded.expiresAt),
              reasonCatalogId: decoded.reasonCatalogId,
              ...(decoded.reasonAttachmentText === undefined
                ? {}
                : { reasonAttachmentText: decoded.reasonAttachmentText }),
            })
            .execute(),
        ).pipe(
          Effect.catchTag("AdminOperatorTestTokensPersistenceError", (error) =>
            isUniqueViolation(error.args.cause, "prefix")
              ? Effect.fail<AdminOperatorTestTokensRepositoryError>(
                  new AdminOperatorTestTokensUniquePrefixViolationError({
                    tokenPrefix: decoded.tokenPrefix,
                  }),
                )
              : Effect.fail<AdminOperatorTestTokensRepositoryError>(error),
          ),
        );
        void insertResult;
        const inserted = yield* selectById(database, id);
        if (inserted === undefined) {
          return yield* Effect.fail(
            new AdminOperatorTestTokensPersistenceError({
              operation: "issue",
              cause: new Error(
                "admin-operator-test-token insert was not visible to subsequent select",
              ),
            }),
          );
        }
        return yield* decodeRowAsDetail(inserted);
      }),

    getTokenById: (id) =>
      selectById(database, id).pipe(
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(Option.none<AdminOperatorTestTokenDetail>())
            : decodeRowAsDetail(row).pipe(Effect.map(Option.some)),
        ),
      ),

    findByPrefix: (tokenPrefix) =>
      selectByPrefix(database, tokenPrefix).pipe(
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(Option.none<AdminOperatorTestTokenStoredRecord>())
            : decodeRowAsSummary(row).pipe(
                Effect.map((summary) =>
                  Option.some<AdminOperatorTestTokenStoredRecord>({
                    summary,
                    tokenHash: row.tokenHash,
                  }),
                ),
              ),
        ),
      ),

    listSummaries: ({ limit, issuedAfter }) =>
      tryQuery("list", () =>
        database
          .select()
          .from(adminOperatorTestTokensTable)
          .where(
            issuedAfter === undefined
              ? sql`true`
              : gte(adminOperatorTestTokensTable.issuedAt, issuedAfter),
          ),
      ).pipe(
        Effect.map((rows) =>
          [...rows]
            .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
            .slice(0, limit),
        ),
        Effect.flatMap((rows) =>
          Effect.forEach(rows, decodeRowAsSummary, { concurrency: 1 }),
        ),
      ),

    countByLifecycle: ({ now, expiringWithin }) =>
      tryQuery("list", () =>
        database
          .select()
          .from(adminOperatorTestTokensTable)
          .where(sql`true`),
      ).pipe(
        Effect.map((rows) => {
          let active = 0;
          let expiringSoon = 0;
          let revoked = 0;
          for (const row of rows) {
            if (row.revokedAt !== null) {
              revoked += 1;
              continue;
            }
            if (row.expiresAt.getTime() <= now.getTime()) {
              continue;
            }
            active += 1;
            if (row.expiresAt.getTime() <= expiringWithin.getTime()) {
              expiringSoon += 1;
            }
          }
          return { active, expiringSoon, revoked };
        }),
      ),

    revokeToken: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(
          RevokeAdminOperatorTestTokenRepositoryInputSchema,
        )(input);
        const existing = yield* selectById(database, decoded.id);
        if (existing === undefined) {
          return yield* Effect.fail(
            new AdminOperatorTestTokensNotFoundError({ id: decoded.id }),
          );
        }
        if (existing.revokedAt !== null) {
          return yield* Effect.fail(
            new AdminOperatorTestTokensAlreadyRevokedError({ id: decoded.id }),
          );
        }
        const rows = yield* tryPersist("revoke", () =>
          database
            .update(adminOperatorTestTokensTable)
            .set({
              revokedAt: new Date(decoded.revokedAt),
              revokedBy: decoded.revokedBy,
            })
            .where(
              and(
                eq(adminOperatorTestTokensTable.id, decoded.id),
                isNull(adminOperatorTestTokensTable.revokedAt),
              ),
            )
            .returning(),
        );
        const row = rows.find((entry) => entry.id === decoded.id);
        if (row === undefined) {
          return yield* Effect.fail(
            new AdminOperatorTestTokensAlreadyRevokedError({ id: decoded.id }),
          );
        }
        return yield* decodeRowAsDetail(row);
      }),

    recordUsageEvent: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(
          RecordAdminOperatorTestTokenUsageRepositoryInputSchema,
        )(input);
        yield* tryPersist("recordUsage", () =>
          database
            .insert(adminOperatorTestTokenUsageEventsTable)
            .values({
              id: generateUuid(),
              tokenId: decoded.tokenId,
              occurredAt: new Date(decoded.occurredAt),
              outcome: decoded.outcome,
              ...(decoded.failureReason === undefined
                ? {}
                : { failureReason: decoded.failureReason }),
              correlationId: decoded.correlationId,
            })
            .execute(),
        );
        yield* tryPersist("recordUsage", () =>
          database
            .update(adminOperatorTestTokensTable)
            .set({
              lastUsedAt: new Date(decoded.occurredAt),
              lastUsedOutcome: decoded.outcome,
            })
            .where(eq(adminOperatorTestTokensTable.id, decoded.tokenId))
            .returning(),
        );
      }),

    trimUsageEventsForToken: ({ tokenId, keepMostRecent }) =>
      Effect.gen(function* () {
        const rows = yield* tryQuery("listUsage", () =>
          database
            .select()
            .from(adminOperatorTestTokenUsageEventsTable)
            .where(eq(adminOperatorTestTokenUsageEventsTable.tokenId, tokenId)),
        );
        const sorted = [...rows]
          .filter((row) => row.tokenId === tokenId)
          .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
        if (sorted.length <= keepMostRecent) {
          return 0;
        }
        const cutoff = sorted[keepMostRecent];
        if (cutoff === undefined) {
          return 0;
        }
        const cutoffAt = cutoff.occurredAt;
        yield* tryPersist("trimUsage", () =>
          database
            .delete(adminOperatorTestTokenUsageEventsTable)
            .where(
              and(
                eq(adminOperatorTestTokenUsageEventsTable.tokenId, tokenId),
                lt(adminOperatorTestTokenUsageEventsTable.occurredAt, cutoffAt),
              ),
            )
            .execute(),
        );
        return sorted.length - keepMostRecent;
      }),

    listUsageEventsForToken: ({ tokenId, limit }) =>
      tryQuery("listUsage", () =>
        database
          .select()
          .from(adminOperatorTestTokenUsageEventsTable)
          .where(eq(adminOperatorTestTokenUsageEventsTable.tokenId, tokenId)),
      ).pipe(
        Effect.map((rows) =>
          [...rows]
            .filter((row) => row.tokenId === tokenId)
            .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
            .slice(0, limit)
            .map<AdminOperatorTestTokenUsageEvent>((row) => ({
              id: row.id,
              tokenId: row.tokenId,
              occurredAt: row.occurredAt.toISOString(),
              outcome:
                row.outcome === adminOperatorTestTokenUsageOutcome.success
                  ? adminOperatorTestTokenUsageOutcome.success
                  : adminOperatorTestTokenUsageOutcome.failure,
              ...(row.failureReason === null
                ? {}
                : {
                    failureReason:
                      row.failureReason as AdminOperatorTestTokenVerificationFailureReason,
                  }),
              correlationId: row.correlationId,
            })),
        ),
      ),
  });

export const makeAdminOperatorTestTokensRepositoryLayer = (
  database: AdminOperatorTestTokensDatabase,
) =>
  Layer.effect(
    AdminOperatorTestTokensRepository,
    makeAdminOperatorTestTokensRepository(database),
  );

// Unused-import guards to keep imports honest under
// `verbatimModuleSyntax`.
export type { AdminOperatorTestTokenDetail, AdminOperatorTestTokenSummary };
const _decoyLte = lte;
const _decoyDesc = desc;
void _decoyLte;
void _decoyDesc;
