/**
 * Admin saved-views Postgres repository.
 *
 * Persists `admin_saved_views` and surfaces rows as boundary-decoded
 * `AdminSavedView` contract values from `@comvestec/contracts`. Every
 * query is scoped by `owner_subject_id`; per-user isolation is the
 * single most important invariant of this slice. Cross-user
 * authorization is asserted at the platform service layer (see
 * `CrossUserAccessDenied`) so the repository is free to assume the
 * `ownerSubjectId` argument is the authoritative subject id of the
 * acting operator.
 */
import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  AdminSavedViewResourceKindSchema,
  AdminSavedViewSchema,
  type AdminSavedView,
  type AdminSavedViewResourceKind,
} from "@comvestec/contracts";
import type { PostgresDatabase, PostgresDeleteCapability } from "../database";
import { adminSavedViewsTable } from "./admin-saved-views";

type SavedViewsDatabase = PostgresDatabase & PostgresDeleteCapability;

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class AdminSavedViewsPersistenceError {
  readonly _tag = "AdminSavedViewsPersistenceError" as const;
  constructor(
    readonly args: {
      readonly operation:
        | "create"
        | "update"
        | "delete"
        | "pin"
        | "unpin"
        | "touch";
      readonly cause: unknown;
    },
  ) {}
}

export class AdminSavedViewsQueryError {
  readonly _tag = "AdminSavedViewsQueryError" as const;
  constructor(
    readonly args: {
      readonly operation: "list" | "get";
      readonly cause: unknown;
    },
  ) {}
}

export class AdminSavedViewsNotFoundError {
  readonly _tag = "AdminSavedViewsNotFoundError" as const;
  constructor(
    readonly args: {
      readonly id: string;
      readonly ownerSubjectId: string;
    },
  ) {}
}

export class AdminSavedViewsUniqueViolationError {
  readonly _tag = "AdminSavedViewsUniqueViolationError" as const;
  constructor(
    readonly args: {
      readonly ownerSubjectId: string;
      readonly name: string;
    },
  ) {}
}

export type AdminSavedViewsRepositoryError =
  | ParseResult.ParseError
  | AdminSavedViewsPersistenceError
  | AdminSavedViewsQueryError
  | AdminSavedViewsNotFoundError
  | AdminSavedViewsUniqueViolationError;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const ListSavedViewsFilterSchema = Schema.Struct({
  resourceKind: Schema.optional(AdminSavedViewResourceKindSchema),
  pinnedOnly: Schema.optional(Schema.Boolean),
});

export type ListSavedViewsFilter = Schema.Schema.Type<
  typeof ListSavedViewsFilterSchema
>;

export const CreateSavedViewInputSchema = Schema.Struct({
  ownerSubjectId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  resourceKind: AdminSavedViewResourceKindSchema,
  serializedView: Schema.NonEmptyString,
  pinned: Schema.optional(Schema.Boolean),
});

export type CreateSavedViewInput = Schema.Schema.Type<
  typeof CreateSavedViewInputSchema
>;

export const UpdateSavedViewPatchSchema = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  serializedView: Schema.optional(Schema.NonEmptyString),
  pinned: Schema.optional(Schema.Boolean),
});

export type UpdateSavedViewPatch = Schema.Schema.Type<
  typeof UpdateSavedViewPatchSchema
>;

// ---------------------------------------------------------------------------
// Row → contract decode
// ---------------------------------------------------------------------------

const decodeAdminSavedView = Schema.decodeUnknown(AdminSavedViewSchema);

type AdminSavedViewRow = typeof adminSavedViewsTable.$inferSelect;

const decodeSavedViewRow = (row: AdminSavedViewRow) =>
  decodeAdminSavedView({
    id: row.id,
    ownerSubjectId: row.ownerSubjectId,
    name: row.name,
    resourceKind: row.resourceKind,
    serializedView: row.serializedView,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.lastUsedAt === null
      ? {}
      : { lastUsedAt: row.lastUsedAt.toISOString() }),
  });

// ---------------------------------------------------------------------------
// Service interface + tag
// ---------------------------------------------------------------------------

export type AdminSavedViewsRepositoryService = {
  readonly list: (
    ownerSubjectId: string,
    filter?: ListSavedViewsFilter,
  ) => Effect.Effect<readonly AdminSavedView[], AdminSavedViewsRepositoryError>;
  readonly get: (
    id: string,
    ownerSubjectId: string,
  ) => Effect.Effect<
    Option.Option<AdminSavedView>,
    AdminSavedViewsRepositoryError
  >;
  readonly create: (
    input: CreateSavedViewInput,
  ) => Effect.Effect<AdminSavedView, AdminSavedViewsRepositoryError>;
  readonly update: (input: {
    readonly id: string;
    readonly ownerSubjectId: string;
    readonly patch: UpdateSavedViewPatch;
  }) => Effect.Effect<AdminSavedView, AdminSavedViewsRepositoryError>;
  readonly delete: (input: {
    readonly id: string;
    readonly ownerSubjectId: string;
  }) => Effect.Effect<void, AdminSavedViewsRepositoryError>;
  readonly setPinned: (input: {
    readonly id: string;
    readonly ownerSubjectId: string;
    readonly pinned: boolean;
  }) => Effect.Effect<AdminSavedView, AdminSavedViewsRepositoryError>;
};

export class AdminSavedViewsRepository extends Context.Tag(
  "AdminSavedViewsRepository",
)<AdminSavedViewsRepository, AdminSavedViewsRepositoryService>() {}

// ---------------------------------------------------------------------------
// Implementation helpers
// ---------------------------------------------------------------------------

const tryQuery = <A>(
  operation: AdminSavedViewsQueryError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, AdminSavedViewsQueryError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => new AdminSavedViewsQueryError({ operation, cause }),
  });

const tryPersist = <A>(
  operation: AdminSavedViewsPersistenceError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, AdminSavedViewsPersistenceError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => new AdminSavedViewsPersistenceError({ operation, cause }),
  });

const generateUuid = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi?.randomUUID !== undefined) {
    return cryptoApi.randomUUID();
  }
  throw new Error(
    "globalThis.crypto.randomUUID is required to generate admin-saved-views identifiers",
  );
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const selectByOwner = (database: SavedViewsDatabase, ownerSubjectId: string) =>
  tryQuery("list", () =>
    database
      .select()
      .from(adminSavedViewsTable)
      .where(eq(adminSavedViewsTable.ownerSubjectId, ownerSubjectId)),
  ).pipe(
    Effect.map((rows) =>
      rows.filter((row) => row.ownerSubjectId === ownerSubjectId),
    ),
  );

const selectByIdAndOwner = (
  database: SavedViewsDatabase,
  id: string,
  ownerSubjectId: string,
) =>
  tryQuery("get", () =>
    database
      .select()
      .from(adminSavedViewsTable)
      .where(
        and(
          eq(adminSavedViewsTable.id, id),
          eq(adminSavedViewsTable.ownerSubjectId, ownerSubjectId),
        ),
      ),
  ).pipe(
    Effect.map((rows) =>
      rows.find(
        (row) => row.id === id && row.ownerSubjectId === ownerSubjectId,
      ),
    ),
  );

const selectByOwnerAndName = (
  database: SavedViewsDatabase,
  ownerSubjectId: string,
  name: string,
) =>
  tryQuery("list", () =>
    database
      .select()
      .from(adminSavedViewsTable)
      .where(
        and(
          eq(adminSavedViewsTable.ownerSubjectId, ownerSubjectId),
          eq(adminSavedViewsTable.name, name),
        ),
      ),
  ).pipe(
    Effect.map((rows) =>
      rows.find(
        (row) => row.ownerSubjectId === ownerSubjectId && row.name === name,
      ),
    ),
  );

const matchesResourceKind = (
  row: AdminSavedViewRow,
  resourceKind: AdminSavedViewResourceKind | undefined,
) => resourceKind === undefined || row.resourceKind === resourceKind;

export const makeAdminSavedViewsRepository = (database: SavedViewsDatabase) =>
  Effect.succeed<AdminSavedViewsRepositoryService>({
    list: (ownerSubjectId, filter) =>
      selectByOwner(database, ownerSubjectId).pipe(
        Effect.flatMap((rows) => {
          const filtered = rows.filter((row) => {
            if (!matchesResourceKind(row, filter?.resourceKind)) {
              return false;
            }
            if (filter?.pinnedOnly === true && row.pinned !== true) {
              return false;
            }
            return true;
          });

          return Effect.forEach(filtered, decodeSavedViewRow, {
            concurrency: 1,
          });
        }),
      ),

    get: (id, ownerSubjectId) =>
      selectByIdAndOwner(database, id, ownerSubjectId).pipe(
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(Option.none<AdminSavedView>())
            : decodeSavedViewRow(row).pipe(Effect.map(Option.some)),
        ),
      ),

    create: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(CreateSavedViewInputSchema)(
          input,
        );
        const collision = yield* selectByOwnerAndName(
          database,
          decoded.ownerSubjectId,
          decoded.name,
        );
        if (collision !== undefined) {
          return yield* Effect.fail(
            new AdminSavedViewsUniqueViolationError({
              ownerSubjectId: decoded.ownerSubjectId,
              name: decoded.name,
            }),
          );
        }
        const id = generateUuid();
        const now = new Date();
        yield* tryPersist("create", () =>
          database
            .insert(adminSavedViewsTable)
            .values({
              id,
              ownerSubjectId: decoded.ownerSubjectId,
              name: decoded.name,
              resourceKind: decoded.resourceKind,
              serializedView: decoded.serializedView,
              pinned: decoded.pinned ?? false,
              createdAt: now,
              updatedAt: now,
            })
            .execute(),
        );
        const inserted = yield* selectByIdAndOwner(
          database,
          id,
          decoded.ownerSubjectId,
        );
        if (inserted === undefined) {
          return yield* Effect.fail(
            new AdminSavedViewsPersistenceError({
              operation: "create",
              cause: new Error(
                "admin saved view insert was not visible to subsequent select",
              ),
            }),
          );
        }
        return yield* decodeSavedViewRow(inserted);
      }),

    update: ({ id, ownerSubjectId, patch }) =>
      Effect.gen(function* () {
        const decodedPatch = yield* Schema.decodeUnknown(
          UpdateSavedViewPatchSchema,
        )(patch);
        const existing = yield* selectByIdAndOwner(
          database,
          id,
          ownerSubjectId,
        );
        if (existing === undefined) {
          return yield* Effect.fail(
            new AdminSavedViewsNotFoundError({ id, ownerSubjectId }),
          );
        }
        if (
          decodedPatch.name !== undefined &&
          decodedPatch.name !== existing.name
        ) {
          const collision = yield* selectByOwnerAndName(
            database,
            ownerSubjectId,
            decodedPatch.name,
          );
          if (collision !== undefined && collision.id !== id) {
            return yield* Effect.fail(
              new AdminSavedViewsUniqueViolationError({
                ownerSubjectId,
                name: decodedPatch.name,
              }),
            );
          }
        }
        const now = new Date();
        const updates: Partial<typeof adminSavedViewsTable.$inferInsert> = {
          updatedAt: now,
        };
        if (decodedPatch.name !== undefined) {
          updates.name = decodedPatch.name;
        }
        if (decodedPatch.serializedView !== undefined) {
          updates.serializedView = decodedPatch.serializedView;
        }
        if (decodedPatch.pinned !== undefined) {
          updates.pinned = decodedPatch.pinned;
        }
        const rows = yield* tryPersist("update", () =>
          database
            .update(adminSavedViewsTable)
            .set(updates)
            .where(
              and(
                eq(adminSavedViewsTable.id, id),
                eq(adminSavedViewsTable.ownerSubjectId, ownerSubjectId),
              ),
            )
            .returning(),
        );
        const row = rows.find(
          (entry) => entry.id === id && entry.ownerSubjectId === ownerSubjectId,
        );
        if (row === undefined) {
          return yield* Effect.fail(
            new AdminSavedViewsNotFoundError({ id, ownerSubjectId }),
          );
        }
        return yield* decodeSavedViewRow(row);
      }),

    delete: ({ id, ownerSubjectId }) =>
      Effect.gen(function* () {
        const existing = yield* selectByIdAndOwner(
          database,
          id,
          ownerSubjectId,
        );
        if (existing === undefined) {
          return yield* Effect.fail(
            new AdminSavedViewsNotFoundError({ id, ownerSubjectId }),
          );
        }
        yield* tryPersist("delete", () =>
          database
            .delete(adminSavedViewsTable)
            .where(
              and(
                eq(adminSavedViewsTable.id, id),
                eq(adminSavedViewsTable.ownerSubjectId, ownerSubjectId),
              ),
            )
            .execute(),
        );
        return undefined;
      }),

    setPinned: ({ id, ownerSubjectId, pinned }) =>
      Effect.gen(function* () {
        const existing = yield* selectByIdAndOwner(
          database,
          id,
          ownerSubjectId,
        );
        if (existing === undefined) {
          return yield* Effect.fail(
            new AdminSavedViewsNotFoundError({ id, ownerSubjectId }),
          );
        }
        const now = new Date();
        const rows = yield* tryPersist(pinned ? "pin" : "unpin", () =>
          database
            .update(adminSavedViewsTable)
            .set({ pinned, updatedAt: now })
            .where(
              and(
                eq(adminSavedViewsTable.id, id),
                eq(adminSavedViewsTable.ownerSubjectId, ownerSubjectId),
              ),
            )
            .returning(),
        );
        const row = rows.find(
          (entry) => entry.id === id && entry.ownerSubjectId === ownerSubjectId,
        );
        if (row === undefined) {
          return yield* Effect.fail(
            new AdminSavedViewsNotFoundError({ id, ownerSubjectId }),
          );
        }
        return yield* decodeSavedViewRow(row);
      }),
  });

export const makeAdminSavedViewsRepositoryLayer = (
  database: SavedViewsDatabase,
) =>
  Layer.effect(
    AdminSavedViewsRepository,
    makeAdminSavedViewsRepository(database),
  );
