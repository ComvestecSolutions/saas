/**
 * Manual break-glass Postgres repository per admin-app
 * implementation plan §9 item 5.
 *
 * Boundary-decodes rows into the typed `BreakGlassGrant` contract.
 * Owns no business logic — TTL/active-cap/actor authorization
 * lives in the platform service (`ManualBreakGlassService`). The
 * repository only enforces atomic state transitions:
 *
 *   - `releaseGrant` rejects with `BreakGlassGrantAlreadyReleased`
 *     when the row is not currently `active`, computed inside the
 *     same query path so concurrent releases cannot both succeed.
 *   - `autoExpireStaleGrants` flips any `active` row whose
 *     `expiresAt <= now` to `expired` and returns the affected ids
 *     so the caller can emit a single audit event per sweep.
 */
import { and, eq, lte } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  ManualBreakGlassGrantSchema,
  manualBreakGlassGrantStatus,
  PlatformScopeSchema,
  type ManualBreakGlassGrant,
} from "@comvestec/contracts";
import type { PostgresDatabase } from "../database";
import { manualBreakGlassGrantsTable } from "./manual-break-glass";

type ManualBreakGlassDatabase = PostgresDatabase;

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class ManualBreakGlassPersistenceError {
  readonly _tag = "ManualBreakGlassPersistenceError" as const;
  constructor(
    readonly args: {
      readonly operation: "issue" | "release" | "autoExpire";
      readonly cause: unknown;
    },
  ) {}
}

export class ManualBreakGlassQueryError {
  readonly _tag = "ManualBreakGlassQueryError" as const;
  constructor(
    readonly args: {
      readonly operation: "get" | "listActive" | "countActive";
      readonly cause: unknown;
    },
  ) {}
}

export class ManualBreakGlassGrantNotFoundError {
  readonly _tag = "ManualBreakGlassGrantNotFoundError" as const;
  constructor(readonly args: { readonly id: string }) {}
}

export class ManualBreakGlassGrantAlreadyReleasedError {
  readonly _tag = "ManualBreakGlassGrantAlreadyReleasedError" as const;
  constructor(
    readonly args: {
      readonly id: string;
      readonly currentStatus: string;
    },
  ) {}
}

export type ManualBreakGlassRepositoryError =
  | ParseResult.ParseError
  | ManualBreakGlassPersistenceError
  | ManualBreakGlassQueryError
  | ManualBreakGlassGrantNotFoundError
  | ManualBreakGlassGrantAlreadyReleasedError;

// ---------------------------------------------------------------------------
// Repository inputs (persistence layer — typed, narrow)
// ---------------------------------------------------------------------------

export const IssueManualBreakGlassGrantRepositoryInputSchema = Schema.Struct({
  grantedTo: Schema.NonEmptyString,
  grantedBy: Schema.NonEmptyString,
  targetTenant: Schema.Struct({
    scope: PlatformScopeSchema,
    scopeId: Schema.NonEmptyString,
  }),
  reasonCatalogId: Schema.NonEmptyString,
  reasonNarrative: Schema.NonEmptyString,
  issuedAt: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
  correlationId: Schema.NonEmptyString,
});

export type IssueManualBreakGlassGrantRepositoryInput = Schema.Schema.Type<
  typeof IssueManualBreakGlassGrantRepositoryInputSchema
>;

export const ReleaseManualBreakGlassGrantRepositoryInputSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  releasedBy: Schema.NonEmptyString,
  releaseReasonCatalogId: Schema.NonEmptyString,
  releasedAt: Schema.NonEmptyString,
});

export type ReleaseManualBreakGlassGrantRepositoryInput = Schema.Schema.Type<
  typeof ReleaseManualBreakGlassGrantRepositoryInputSchema
>;

// ---------------------------------------------------------------------------
// Row → contract decode
// ---------------------------------------------------------------------------

type ManualBreakGlassRow = typeof manualBreakGlassGrantsTable.$inferSelect;

const decodeManualBreakGlassGrant = Schema.decodeUnknown(
  ManualBreakGlassGrantSchema,
);

const decodeRow = (row: ManualBreakGlassRow) =>
  decodeManualBreakGlassGrant({
    id: row.id,
    grantedTo: row.grantedTo,
    grantedBy: row.grantedBy,
    targetTenant: {
      scope: row.targetTenantScope,
      scopeId: row.targetTenantScopeId,
    },
    reasonCatalogId: row.reasonCatalogId,
    reasonNarrative: row.reasonNarrative,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status: row.status,
    ...(row.releasedAt === null
      ? {}
      : { releasedAt: row.releasedAt.toISOString() }),
    ...(row.releasedBy === null ? {} : { releasedBy: row.releasedBy }),
    ...(row.releaseReasonCatalogId === null
      ? {}
      : { releaseReasonCatalogId: row.releaseReasonCatalogId }),
    correlationId: row.correlationId,
  });

// ---------------------------------------------------------------------------
// Service interface + tag
// ---------------------------------------------------------------------------

export type ManualBreakGlassRepositoryService = {
  readonly issueGrant: (
    input: IssueManualBreakGlassGrantRepositoryInput,
  ) => Effect.Effect<ManualBreakGlassGrant, ManualBreakGlassRepositoryError>;
  readonly getGrant: (
    id: string,
  ) => Effect.Effect<
    Option.Option<ManualBreakGlassGrant>,
    ManualBreakGlassRepositoryError
  >;
  readonly listActiveForSubject: (
    subjectId: string,
  ) => Effect.Effect<
    ReadonlyArray<ManualBreakGlassGrant>,
    ManualBreakGlassRepositoryError
  >;
  readonly releaseGrant: (
    input: ReleaseManualBreakGlassGrantRepositoryInput,
  ) => Effect.Effect<ManualBreakGlassGrant, ManualBreakGlassRepositoryError>;
  readonly countActiveForSubject: (
    subjectId: string,
  ) => Effect.Effect<number, ManualBreakGlassRepositoryError>;
  readonly autoExpireStaleGrants: (input: {
    readonly now: Date;
  }) => Effect.Effect<ReadonlyArray<string>, ManualBreakGlassRepositoryError>;
};

export class ManualBreakGlassRepository extends Context.Tag(
  "ManualBreakGlassRepository",
)<ManualBreakGlassRepository, ManualBreakGlassRepositoryService>() {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tryQuery = <A>(
  operation: ManualBreakGlassQueryError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, ManualBreakGlassQueryError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => new ManualBreakGlassQueryError({ operation, cause }),
  });

const tryPersist = <A>(
  operation: ManualBreakGlassPersistenceError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, ManualBreakGlassPersistenceError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) =>
      new ManualBreakGlassPersistenceError({ operation, cause }),
  });

const generateUuid = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi?.randomUUID !== undefined) {
    return cryptoApi.randomUUID();
  }
  throw new Error(
    "globalThis.crypto.randomUUID is required to generate manual-break-glass identifiers",
  );
};

const selectAll = (database: ManualBreakGlassDatabase) =>
  tryQuery("get", () =>
    database.select().from(manualBreakGlassGrantsTable).where(undefined),
  );

const selectById = (database: ManualBreakGlassDatabase, id: string) =>
  tryQuery("get", () =>
    database
      .select()
      .from(manualBreakGlassGrantsTable)
      .where(eq(manualBreakGlassGrantsTable.id, id)),
  ).pipe(Effect.map((rows) => rows.find((row) => row.id === id)));

const selectActiveForSubject = (
  database: ManualBreakGlassDatabase,
  subjectId: string,
) =>
  tryQuery("listActive", () =>
    database
      .select()
      .from(manualBreakGlassGrantsTable)
      .where(
        and(
          eq(manualBreakGlassGrantsTable.grantedTo, subjectId),
          eq(
            manualBreakGlassGrantsTable.status,
            manualBreakGlassGrantStatus.active,
          ),
        ),
      ),
  ).pipe(
    Effect.map((rows) =>
      rows.filter(
        (row) =>
          row.grantedTo === subjectId &&
          row.status === manualBreakGlassGrantStatus.active,
      ),
    ),
  );

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const makeManualBreakGlassRepository = (
  database: ManualBreakGlassDatabase,
) =>
  Effect.succeed<ManualBreakGlassRepositoryService>({
    issueGrant: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(
          IssueManualBreakGlassGrantRepositoryInputSchema,
        )(input);
        const id = generateUuid();
        yield* tryPersist("issue", () =>
          database
            .insert(manualBreakGlassGrantsTable)
            .values({
              id,
              grantedTo: decoded.grantedTo,
              grantedBy: decoded.grantedBy,
              targetTenantScope: decoded.targetTenant.scope,
              targetTenantScopeId: decoded.targetTenant.scopeId,
              reasonCatalogId: decoded.reasonCatalogId,
              reasonNarrative: decoded.reasonNarrative,
              issuedAt: new Date(decoded.issuedAt),
              expiresAt: new Date(decoded.expiresAt),
              status: manualBreakGlassGrantStatus.active,
              correlationId: decoded.correlationId,
            })
            .execute(),
        );
        const inserted = yield* selectById(database, id);
        if (inserted === undefined) {
          return yield* Effect.fail(
            new ManualBreakGlassPersistenceError({
              operation: "issue",
              cause: new Error(
                "manual break-glass insert was not visible to subsequent select",
              ),
            }),
          );
        }
        return yield* decodeRow(inserted);
      }),

    getGrant: (id) =>
      selectById(database, id).pipe(
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(Option.none<ManualBreakGlassGrant>())
            : decodeRow(row).pipe(Effect.map(Option.some)),
        ),
      ),

    listActiveForSubject: (subjectId) =>
      selectActiveForSubject(database, subjectId).pipe(
        Effect.flatMap((rows) =>
          Effect.forEach(rows, decodeRow, { concurrency: 1 }),
        ),
      ),

    countActiveForSubject: (subjectId) =>
      selectActiveForSubject(database, subjectId).pipe(
        Effect.map((rows) => rows.length),
      ),

    releaseGrant: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(
          ReleaseManualBreakGlassGrantRepositoryInputSchema,
        )(input);
        const existing = yield* selectById(database, decoded.id);
        if (existing === undefined) {
          return yield* Effect.fail(
            new ManualBreakGlassGrantNotFoundError({ id: decoded.id }),
          );
        }
        if (existing.status !== manualBreakGlassGrantStatus.active) {
          return yield* Effect.fail(
            new ManualBreakGlassGrantAlreadyReleasedError({
              id: decoded.id,
              currentStatus: existing.status,
            }),
          );
        }
        const rows = yield* tryPersist("release", () =>
          database
            .update(manualBreakGlassGrantsTable)
            .set({
              status: manualBreakGlassGrantStatus.released,
              releasedAt: new Date(decoded.releasedAt),
              releasedBy: decoded.releasedBy,
              releaseReasonCatalogId: decoded.releaseReasonCatalogId,
            })
            .where(
              and(
                eq(manualBreakGlassGrantsTable.id, decoded.id),
                eq(
                  manualBreakGlassGrantsTable.status,
                  manualBreakGlassGrantStatus.active,
                ),
              ),
            )
            .returning(),
        );
        const row = rows.find((entry) => entry.id === decoded.id);
        if (row === undefined) {
          // Lost the optimistic-concurrency race — another writer
          // released this grant between the existence check and the
          // conditional update.
          return yield* Effect.fail(
            new ManualBreakGlassGrantAlreadyReleasedError({
              id: decoded.id,
              currentStatus: existing.status,
            }),
          );
        }
        return yield* decodeRow(row);
      }),

    autoExpireStaleGrants: ({ now }) =>
      Effect.gen(function* () {
        const rows = yield* tryPersist("autoExpire", () =>
          database
            .update(manualBreakGlassGrantsTable)
            .set({ status: manualBreakGlassGrantStatus.expired })
            .where(
              and(
                eq(
                  manualBreakGlassGrantsTable.status,
                  manualBreakGlassGrantStatus.active,
                ),
                lte(manualBreakGlassGrantsTable.expiresAt, now),
              ),
            )
            .returning(),
        );
        return rows.map((row) => row.id);
      }),
  });

export const makeManualBreakGlassRepositoryLayer = (
  database: ManualBreakGlassDatabase,
) =>
  Layer.effect(
    ManualBreakGlassRepository,
    makeManualBreakGlassRepository(database),
  );

// Exported for parity with the rest of the access slice — lets the
// auto-expiry sweep walk every persisted row when tests need to
// inspect the table contents without going through a status filter.
export const debugSelectAll = selectAll;
