/**
 * Admin workspaces Postgres repository.
 *
 * Persists `admin_workspaces` and surfaces rows as boundary-decoded
 * `AdminWorkspace` contract values from `@comvestec/contracts`. Every
 * query is scoped by `owner_subject_id`; per-user isolation is the
 * single most important invariant of this slice. Cross-user
 * authorization is asserted at the platform service layer (see
 * `CrossUserAccessDenied`) so the repository is free to assume the
 * `ownerSubjectId` argument is the authoritative subject id of the
 * acting operator.
 *
 * The reorder surface is atomic: it validates the supplied id set
 * matches the owner's full current set exactly, then rewrites
 * every `position` column inside a single transaction using a
 * negative-offset swap to avoid colliding with the
 * `(owner_subject_id, position)` unique index mid-flight.
 */
import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  AdminWorkspaceSchema,
  type AdminWorkspace,
} from "@comvestec/contracts";
import type { PostgresDatabase, PostgresDeleteCapability } from "../database";
import { adminWorkspacesTable } from "./admin-workspaces";

type WorkspacesDatabase = PostgresDatabase & PostgresDeleteCapability;

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class AdminWorkspacesPersistenceError {
  readonly _tag = "AdminWorkspacesPersistenceError" as const;
  constructor(
    readonly args: {
      readonly operation: "create" | "update" | "delete" | "reorder";
      readonly cause: unknown;
    },
  ) {}
}

export class AdminWorkspacesQueryError {
  readonly _tag = "AdminWorkspacesQueryError" as const;
  constructor(
    readonly args: {
      readonly operation: "list" | "get";
      readonly cause: unknown;
    },
  ) {}
}

export class AdminWorkspacesNotFoundError {
  readonly _tag = "AdminWorkspacesNotFoundError" as const;
  constructor(
    readonly args: {
      readonly id: string;
      readonly ownerSubjectId: string;
    },
  ) {}
}

export class AdminWorkspacesUniqueViolationError {
  readonly _tag = "AdminWorkspacesUniqueViolationError" as const;
  constructor(
    readonly args: {
      readonly ownerSubjectId: string;
      readonly name: string;
    },
  ) {}
}

export class AdminWorkspacesReorderMismatchError {
  readonly _tag = "AdminWorkspacesReorderMismatchError" as const;
  constructor(
    readonly args: {
      readonly ownerSubjectId: string;
      readonly suppliedIds: readonly string[];
      readonly currentIds: readonly string[];
    },
  ) {}
}

export type AdminWorkspacesRepositoryError =
  | ParseResult.ParseError
  | AdminWorkspacesPersistenceError
  | AdminWorkspacesQueryError
  | AdminWorkspacesNotFoundError
  | AdminWorkspacesUniqueViolationError
  | AdminWorkspacesReorderMismatchError;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const CreateWorkspaceInputSchema = Schema.Struct({
  ownerSubjectId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  serializedLayout: Schema.NonEmptyString,
});

export type CreateWorkspaceInput = Schema.Schema.Type<
  typeof CreateWorkspaceInputSchema
>;

export const UpdateWorkspacePatchSchema = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  serializedLayout: Schema.optional(Schema.NonEmptyString),
});

export type UpdateWorkspacePatch = Schema.Schema.Type<
  typeof UpdateWorkspacePatchSchema
>;

// ---------------------------------------------------------------------------
// Row → contract decode
// ---------------------------------------------------------------------------

const decodeAdminWorkspace = Schema.decodeUnknown(AdminWorkspaceSchema);

type AdminWorkspaceRow = typeof adminWorkspacesTable.$inferSelect;

const decodeWorkspaceRow = (row: AdminWorkspaceRow) =>
  decodeAdminWorkspace({
    id: row.id,
    ownerSubjectId: row.ownerSubjectId,
    name: row.name,
    serializedLayout: row.serializedLayout,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

// ---------------------------------------------------------------------------
// Service interface + tag
// ---------------------------------------------------------------------------

export type AdminWorkspacesRepositoryService = {
  readonly list: (
    ownerSubjectId: string,
  ) => Effect.Effect<readonly AdminWorkspace[], AdminWorkspacesRepositoryError>;
  readonly get: (
    id: string,
    ownerSubjectId: string,
  ) => Effect.Effect<
    Option.Option<AdminWorkspace>,
    AdminWorkspacesRepositoryError
  >;
  readonly create: (
    input: CreateWorkspaceInput,
  ) => Effect.Effect<AdminWorkspace, AdminWorkspacesRepositoryError>;
  readonly update: (input: {
    readonly id: string;
    readonly ownerSubjectId: string;
    readonly patch: UpdateWorkspacePatch;
  }) => Effect.Effect<AdminWorkspace, AdminWorkspacesRepositoryError>;
  readonly delete: (input: {
    readonly id: string;
    readonly ownerSubjectId: string;
  }) => Effect.Effect<void, AdminWorkspacesRepositoryError>;
  readonly reorder: (input: {
    readonly ownerSubjectId: string;
    readonly idsInOrder: readonly string[];
  }) => Effect.Effect<
    readonly AdminWorkspace[],
    AdminWorkspacesRepositoryError
  >;
};

export class AdminWorkspacesRepository extends Context.Tag(
  "AdminWorkspacesRepository",
)<AdminWorkspacesRepository, AdminWorkspacesRepositoryService>() {}

// ---------------------------------------------------------------------------
// Implementation helpers
// ---------------------------------------------------------------------------

const tryQuery = <A>(
  operation: AdminWorkspacesQueryError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, AdminWorkspacesQueryError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => new AdminWorkspacesQueryError({ operation, cause }),
  });

const tryPersist = <A>(
  operation: AdminWorkspacesPersistenceError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, AdminWorkspacesPersistenceError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => new AdminWorkspacesPersistenceError({ operation, cause }),
  });

const generateUuid = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi?.randomUUID !== undefined) {
    return cryptoApi.randomUUID();
  }
  throw new Error(
    "globalThis.crypto.randomUUID is required to generate admin-workspaces identifiers",
  );
};

const selectByOwner = (database: WorkspacesDatabase, ownerSubjectId: string) =>
  tryQuery("list", () =>
    database
      .select()
      .from(adminWorkspacesTable)
      .where(eq(adminWorkspacesTable.ownerSubjectId, ownerSubjectId)),
  ).pipe(
    Effect.map((rows) =>
      rows
        .filter((row) => row.ownerSubjectId === ownerSubjectId)
        .slice()
        .sort((a, b) => a.position - b.position),
    ),
  );

const selectByIdAndOwner = (
  database: WorkspacesDatabase,
  id: string,
  ownerSubjectId: string,
) =>
  tryQuery("get", () =>
    database
      .select()
      .from(adminWorkspacesTable)
      .where(
        and(
          eq(adminWorkspacesTable.id, id),
          eq(adminWorkspacesTable.ownerSubjectId, ownerSubjectId),
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
  database: WorkspacesDatabase,
  ownerSubjectId: string,
  name: string,
) =>
  tryQuery("list", () =>
    database
      .select()
      .from(adminWorkspacesTable)
      .where(
        and(
          eq(adminWorkspacesTable.ownerSubjectId, ownerSubjectId),
          eq(adminWorkspacesTable.name, name),
        ),
      ),
  ).pipe(
    Effect.map((rows) =>
      rows.find(
        (row) => row.ownerSubjectId === ownerSubjectId && row.name === name,
      ),
    ),
  );

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const makeAdminWorkspacesRepository = (database: WorkspacesDatabase) =>
  Effect.succeed<AdminWorkspacesRepositoryService>({
    list: (ownerSubjectId) =>
      selectByOwner(database, ownerSubjectId).pipe(
        Effect.flatMap((rows) =>
          Effect.forEach(rows, decodeWorkspaceRow, { concurrency: 1 }),
        ),
      ),

    get: (id, ownerSubjectId) =>
      selectByIdAndOwner(database, id, ownerSubjectId).pipe(
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(Option.none<AdminWorkspace>())
            : decodeWorkspaceRow(row).pipe(Effect.map(Option.some)),
        ),
      ),

    create: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(CreateWorkspaceInputSchema)(
          input,
        );
        const collision = yield* selectByOwnerAndName(
          database,
          decoded.ownerSubjectId,
          decoded.name,
        );
        if (collision !== undefined) {
          return yield* Effect.fail(
            new AdminWorkspacesUniqueViolationError({
              ownerSubjectId: decoded.ownerSubjectId,
              name: decoded.name,
            }),
          );
        }
        const existing = yield* selectByOwner(database, decoded.ownerSubjectId);
        const nextPosition =
          existing.length === 0
            ? 1
            : existing[existing.length - 1]!.position + 1;
        const id = generateUuid();
        const now = new Date();
        yield* tryPersist("create", () =>
          database
            .insert(adminWorkspacesTable)
            .values({
              id,
              ownerSubjectId: decoded.ownerSubjectId,
              name: decoded.name,
              serializedLayout: decoded.serializedLayout,
              position: nextPosition,
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
            new AdminWorkspacesPersistenceError({
              operation: "create",
              cause: new Error(
                "admin workspace insert was not visible to subsequent select",
              ),
            }),
          );
        }
        return yield* decodeWorkspaceRow(inserted);
      }),

    update: ({ id, ownerSubjectId, patch }) =>
      Effect.gen(function* () {
        const decodedPatch = yield* Schema.decodeUnknown(
          UpdateWorkspacePatchSchema,
        )(patch);
        const existing = yield* selectByIdAndOwner(
          database,
          id,
          ownerSubjectId,
        );
        if (existing === undefined) {
          return yield* Effect.fail(
            new AdminWorkspacesNotFoundError({ id, ownerSubjectId }),
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
              new AdminWorkspacesUniqueViolationError({
                ownerSubjectId,
                name: decodedPatch.name,
              }),
            );
          }
        }
        const now = new Date();
        const updates: Partial<typeof adminWorkspacesTable.$inferInsert> = {
          updatedAt: now,
        };
        if (decodedPatch.name !== undefined) {
          updates.name = decodedPatch.name;
        }
        if (decodedPatch.serializedLayout !== undefined) {
          updates.serializedLayout = decodedPatch.serializedLayout;
        }
        const rows = yield* tryPersist("update", () =>
          database
            .update(adminWorkspacesTable)
            .set(updates)
            .where(
              and(
                eq(adminWorkspacesTable.id, id),
                eq(adminWorkspacesTable.ownerSubjectId, ownerSubjectId),
              ),
            )
            .returning(),
        );
        const row = rows.find(
          (entry) => entry.id === id && entry.ownerSubjectId === ownerSubjectId,
        );
        if (row === undefined) {
          return yield* Effect.fail(
            new AdminWorkspacesNotFoundError({ id, ownerSubjectId }),
          );
        }
        return yield* decodeWorkspaceRow(row);
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
            new AdminWorkspacesNotFoundError({ id, ownerSubjectId }),
          );
        }
        yield* tryPersist("delete", () =>
          database
            .delete(adminWorkspacesTable)
            .where(
              and(
                eq(adminWorkspacesTable.id, id),
                eq(adminWorkspacesTable.ownerSubjectId, ownerSubjectId),
              ),
            )
            .execute(),
        );
        return undefined;
      }),

    reorder: ({ ownerSubjectId, idsInOrder }) =>
      Effect.gen(function* () {
        const current = yield* selectByOwner(database, ownerSubjectId);
        const currentIds = current.map((row) => row.id);
        const suppliedSet = new Set(idsInOrder);
        const currentSet = new Set(currentIds);
        const sameSize = suppliedSet.size === currentSet.size;
        const sameSizeAsInput = suppliedSet.size === idsInOrder.length;
        const allOwned =
          sameSize &&
          sameSizeAsInput &&
          idsInOrder.every((id) => currentSet.has(id));
        if (!allOwned) {
          return yield* Effect.fail(
            new AdminWorkspacesReorderMismatchError({
              ownerSubjectId,
              suppliedIds: idsInOrder,
              currentIds,
            }),
          );
        }
        const now = new Date();
        yield* tryPersist("reorder", () =>
          database.transaction(async (tx) => {
            // Two-pass swap: move every row to a negative offset
            // first so the `(owner_subject_id, position)` unique
            // index never sees a collision mid-flight, then write
            // the final positions.
            for (let i = 0; i < idsInOrder.length; i += 1) {
              const id = idsInOrder[i]!;
              await tx
                .update(adminWorkspacesTable)
                .set({ position: -(i + 1), updatedAt: now })
                .where(
                  and(
                    eq(adminWorkspacesTable.id, id),
                    eq(adminWorkspacesTable.ownerSubjectId, ownerSubjectId),
                  ),
                )
                .returning();
            }
            for (let i = 0; i < idsInOrder.length; i += 1) {
              const id = idsInOrder[i]!;
              await tx
                .update(adminWorkspacesTable)
                .set({ position: i + 1, updatedAt: now })
                .where(
                  and(
                    eq(adminWorkspacesTable.id, id),
                    eq(adminWorkspacesTable.ownerSubjectId, ownerSubjectId),
                  ),
                )
                .returning();
            }
          }),
        );
        const reordered = yield* selectByOwner(database, ownerSubjectId);
        return yield* Effect.forEach(reordered, decodeWorkspaceRow, {
          concurrency: 1,
        });
      }),
  });

export const makeAdminWorkspacesRepositoryLayer = (
  database: WorkspacesDatabase,
) =>
  Layer.effect(
    AdminWorkspacesRepository,
    makeAdminWorkspacesRepository(database),
  );
